"""Staged YuE2 helper: file-backed inputs/receipts, ordinary native Python APIs.

This helper does not constrain agents or implement the durable scheduler. Its
process receipt identifies only this process, not arbitrary agent descendants.
"""
import argparse
import copy
import dataclasses
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import re
import resource
import signal
import sys
import tempfile
import time


def sha256(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(8 * 1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def write_json(path, data):
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', dir=path.parent, prefix=path.name + '.',
                                         suffix='.tmp', delete=False) as stream:
            temporary = Path(stream.name)
            json.dump(data, stream, indent=2, allow_nan=False)
            stream.write('\n')
        temporary.replace(path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--request', required=True, type=Path)
    parser.add_argument('--result', required=True, type=Path)
    args = parser.parse_args()
    raw_request = args.request.read_bytes()
    submitted = json.loads(raw_request)
    parameters = copy.deepcopy(submitted['parameters'])
    assigned = submitted['seeds']
    stochastic_plan = parameters.get('cot', 'full') != 'off' and parameters.get('abc') is None
    stages = ['abc', 'semantic', 'nar'] if stochastic_plan else ['semantic', 'nar']
    if set(assigned) != set(stages):
        raise ValueError(f'Exactly these stochastic stage seeds are required: {stages}')
    for seed in assigned.values():
        if not isinstance(seed, str) or not re.fullmatch(r'0|[1-9][0-9]*', seed) or int(seed) >= 2**63:
            raise ValueError('Seeds must be exact decimal strings in the native [0, 2**63) domain')
    if len(set(assigned.values())) != len(stages):
        raise ValueError('Stochastic stages require distinct assigned seeds')
    if 'seed' in parameters:
        raise ValueError('Use the explicit stage seed map, not a second ambiguous request seed')
    if submitted.get('schemaVersion') != 1:
        raise ValueError('Unsupported helper request version')
    root = Path(os.environ.get('STUDIO_DATA_ROOT',
                str(Path(os.environ.get('XDG_DATA_HOME', str(Path.home() / '.local/share')))
                    / 'music-video-studio')))
    if not root.is_absolute():
        raise ValueError('STUDIO_DATA_ROOT must be absolute')
    result_path = args.result.absolute()
    if result_path.exists() or result_path.is_symlink():
        raise FileExistsError('Use a new attempt/result path; never overwrite a receipt')
    os.umask(0o077)
    result_path.parent.mkdir(parents=True, exist_ok=True)
    artifacts = result_path.parent / (result_path.stem + '-artifacts')
    artifacts.mkdir()  # An existing attempt, even partial, must not be overwritten.
    with result_path.open('x'):
        pass  # Atomic reservation, including protection against a racing launch.
    (artifacts / 'submitted-request.json').write_bytes(raw_request)
    proc = Path('/proc/self/stat').read_text().rsplit(')', 1)[1].split()
    receipt = {'schemaVersion': 1, 'attemptId': submitted['attemptId'], 'state': 'running',
               'pid': os.getpid(), 'processGroupId': os.getpgrp(), 'startTicks': proc[19],
               'bootId': Path('/proc/sys/kernel/random/boot_id').read_text().strip(),
               'cwd': str(Path.cwd()), 'python': sys.executable, 'prefix': sys.prefix,
               'requestSha256': hashlib.sha256(raw_request).hexdigest(),
               'helperSha256': sha256(Path(__file__)), 'assignedSeeds': assigned,
               'startedUnix': time.time(), 'calls': [], 'artifacts': []}
    write_json(result_path, receipt)
    pipeline = None
    torch = None
    started = time.monotonic()

    def interrupted(signum, _frame):
        receipt['signalReceived'] = signum
        raise InterruptedError(f'Received signal {signum}; process exit/resource release require observation')

    previous = {s: signal.signal(s, interrupted) for s in (signal.SIGINT, signal.SIGTERM)}

    def stage(name, inputs, function, seed=None):
        call = {'stage': name, 'state': 'running', 'startedUnix': time.time(),
                'inputs': copy.deepcopy(inputs), 'suppliedSeed': seed}
        receipt['calls'].append(call)
        write_json(result_path, receipt)  # Evidence exists before native invocation.
        tick = time.monotonic()
        print(f'Stage: {name}', flush=True)
        try:
            value = function()
            call['state'] = 'succeeded'
            return value
        except BaseException as error:
            call['state'] = 'interrupted' if isinstance(error, (InterruptedError, KeyboardInterrupt)) else 'failed'
            call['error'] = f'{type(error).__name__}: {error}'
            raise
        finally:
            call['elapsedSeconds'] = time.monotonic() - tick
            write_json(result_path, receipt)

    try:
        import numpy as np
        import soundfile as sf
        import torch as torch_module
        from yue2 import YuE2Pipeline
        from yue2.protocol import SongRequest
        torch = torch_module
        manifest_path = Path(__file__).with_name('models.json')
        manifest = json.loads(manifest_path.read_text())
        receipt['modelManifestSha256'] = sha256(manifest_path)
        model_paths = {}
        for model in manifest['models']:
            directory = root / 'models/yue2' / model['repository'].split('/')[1] / model['revision']
            for entry in model['files']:
                path = directory / entry['path']
                if path.stat().st_size != entry['bytes'] or sha256(path) != entry['sha256']:
                    raise ValueError(f'Model asset changed or incomplete: {path}')
            model_paths[model['role']] = str(directory)
        receipt['versions'] = {name: importlib.metadata.version(name)
                               for name in ('yue2-infer', 'torch', 'transformers', 'numpy', 'soundfile')}
        execution = copy.deepcopy(submitted.get('execution', {}))
        # Record resolved defaults; these are native execution choices, not song limits.
        defaults = {'device': 'cuda', 'memory_budget_gib': 16, 'offload_ar': True,
                    'vae_core_frames': 256, 'backend': 'torch', 'quantization': 'none'}
        defaults.update(execution)
        receipt['execution'] = defaults
        if defaults['device'] != 'cuda':
            raise ValueError('This pinned feasibility helper requires explicit CUDA; no silent CPU fallback')
        torch.cuda.reset_peak_memory_stats()
        pipeline = stage('load', {'models': model_paths, 'execution': defaults},
                         lambda: YuE2Pipeline.from_pretrained(model_paths['model'], vae=model_paths['vae'],
                                                              local_files_only=True, **defaults))
        first_seed = assigned['abc'] if stochastic_plan else assigned['semantic']
        request = SongRequest(**parameters, seed=int(first_seed))
        sampling = submitted.get('sampling', {})
        abc_sampling, semantic_sampling = sampling.get('abc'), sampling.get('semantic')
        config = pipeline.effective_config(request, abc_sampling, semantic_sampling)
        write_json(artifacts / 'effective-config.json', config)
        plan = stage('abc' if stochastic_plan else 'provided-plan',
                     {'request': request.to_dict(), 'sampling': config['generation']['abc']},
                     lambda: pipeline.plan(request=request, abc_sampling=abc_sampling),
                     assigned.get('abc'))
        plan.save(artifacts / 'abc-output')
        # Independent dataclass copies preserve the earlier stage's request and tokens.
        semantic_plan = dataclasses.replace(plan, request=dataclasses.replace(plan.request, seed=int(assigned['semantic'])))
        semantic_plan.save(artifacts / 'semantic-input')
        semantic = stage('semantic', {'planDirectory': str(artifacts / 'semantic-input'),
                                      'sampling': config['generation']['semantic']},
                         lambda: pipeline.generate_semantic(semantic_plan, sampling=semantic_sampling), assigned['semantic'])
        np.save(artifacts / 'semantic.npy', np.asarray(semantic.tokens, dtype=np.int32))
        nar_plan = dataclasses.replace(semantic.plan, request=dataclasses.replace(semantic.plan.request, seed=int(assigned['nar'])))
        nar_input = dataclasses.replace(semantic, plan=nar_plan)
        nar_plan.save(artifacts / 'nar-input')
        latents = stage('nar', {'planDirectory': str(artifacts / 'nar-input'),
                               'semanticTokens': str(artifacts / 'semantic.npy'),
                               'odeSteps': config['generation']['ode_steps'], 'context': config['generation']['context']},
                       lambda: pipeline.synthesize(nar_input), assigned['nar'])
        np.save(artifacts / 'latents.npy', latents)
        audio = stage('decode', {'latents': str(artifacts / 'latents.npy'),
                                 'full': False, 'stochastic': False}, lambda: pipeline.decode(latents))
        # Preserve upstream samples, no product fade/normalization/mastering.
        sample_rate = json.loads((Path(model_paths['vae']) / 'config.json').read_text())['sample_rate']
        sf.write(artifacts / 'audio.wav', audio, sample_rate, subtype='FLOAT')
        receipt['audio'] = {'path': str(artifacts / 'audio.wav'), 'sampleRate': sample_rate,
                            'samples': len(audio), 'channels': audio.shape[1],
                            'seconds': len(audio) / sample_rate, 'subtype': 'FLOAT'}
        receipt['truncated'] = {'abc': plan.truncated, 'semantic': semantic.truncated}
        receipt['state'] = 'succeeded'
    except BaseException as error:
        receipt['state'] = 'interrupted' if isinstance(error, (InterruptedError, KeyboardInterrupt)) else 'failed'
        receipt['error'] = f'{type(error).__name__}: {error}'
        raise
    finally:
        try:
            if torch is not None and torch.cuda.is_initialized():
                receipt['torchPeakAllocatedBytes'] = torch.cuda.max_memory_allocated()
                receipt['torchPeakReservedBytes'] = torch.cuda.max_memory_reserved()
        except BaseException as error:
            receipt['state'] = 'failed'
            receipt['metricsError'] = f'{type(error).__name__}: {error}'
            raise
        finally:
            try:
                # Metrics failures must not prevent native cleanup being attempted.
                if pipeline is not None:
                    pipeline.close()
            except BaseException as error:
                receipt['state'] = 'failed'
                receipt['cleanupError'] = f'{type(error).__name__}: {error}'
                raise
            finally:
                try:
                    receipt['elapsedSeconds'] = time.monotonic() - started
                    receipt['maxRssKiB'] = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
                    receipt['finishedUnix'] = time.time()
                    receipt['artifacts'] = [{'path': str(p.relative_to(artifacts)), 'bytes': p.stat().st_size,
                                             'sha256': sha256(p)} for p in sorted(artifacts.rglob('*')) if p.is_file()]
                    write_json(result_path, receipt)
                finally:
                    for sig, handler in previous.items():
                        signal.signal(sig, handler)
    print(f'Receipt: {result_path}', flush=True)


if __name__ == '__main__':
    main()
