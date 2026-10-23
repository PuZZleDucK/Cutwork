#!/usr/bin/env python3
"""Install allowlisted public model bytes, never Python packages or inference.

Uses stdlib plus curl. With no flag it prints a plan without creating files.
"""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import signal
import subprocess
import tempfile
import time


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(8 * 1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def matches(path, entry):
    return (path.is_file() and not path.is_symlink()
            and path.stat().st_size == entry['bytes']
            and digest(path) == entry['sha256'])


def write_json(path, value):
    with tempfile.NamedTemporaryFile(mode='w', dir=path.parent, prefix='.'+path.name+'.', delete=False) as stream:
        tmp = Path(stream.name)
        stream.write(json.dumps(value, indent=2) + '\n')
    tmp.replace(path)


def require_unlinked(path):
    if path.resolve() != path.absolute():
        raise RuntimeError(f'Refusing symlinked managed path: {path}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--install', action='store_true')
    parser.add_argument('--prompt-guides', action='store_true', help='Install small pinned prompting references separately; never touches weights')
    args = parser.parse_args()
    collection = 'references/h3' if args.prompt_guides else 'models/h3'
    manifest_name = 'prompt-guides.json' if args.prompt_guides else 'models.json'
    manifest_path = Path(__file__).resolve().parents[1] / 'integrations/h3' / manifest_name
    manifest = json.loads(manifest_path.read_text())
    manifest_hash = digest(manifest_path)
    root = Path(os.environ.get('STUDIO_DATA_ROOT',
                str(Path(os.environ.get('XDG_DATA_HOME', str(Path.home() / '.local/share')))
                    / 'music-video-studio')))
    if not root.is_absolute():
        raise ValueError('STUDIO_DATA_ROOT must be absolute')
    # Resolve the user-selected data root once; managed descendants must not link
    # somewhere else. Do this before creating directories or ownership markers.
    root = root.resolve()
    targets = []
    for model in manifest['models']:
        if (not re.fullmatch(r'[0-9a-f]{40}', model['revision'])
                or model['repository'] not in {'Comfy-Org/MiniMax-H3', 'MiniMaxAI/MiniMax-H3'}):
            raise ValueError('Unexpected model identity')
        directory = root / collection / model['repository'].split('/')[1] / model['revision']
        seen = set()
        for entry in model['files']:
            path = PurePosixPath(entry['path'])
            if (path.is_absolute() or '..' in path.parts or path.as_posix() != entry['path']
                    or entry['path'] in seen or not re.fullmatch(r'[0-9a-f]{64}', entry['sha256'])
                    or not isinstance(entry['bytes'], int) or entry['bytes'] <= 0):
                raise ValueError('Invalid/duplicate model file')
            seen.add(entry['path'])
        targets.append((model, directory))
    total = sum(f['bytes'] for m, _ in targets for f in m['files'])
    print(f'Plan: {total:,} pinned bytes under {root / collection}', flush=True)
    print('No host Python, agent configuration, inference, authentication or service changes.', flush=True)
    if not args.install:
        print('Plan only. Pass --install to download/verify the allowlisted public files.')
        return
    if shutil.which('curl') is None:
        raise RuntimeError('curl is required')
    os.umask(0o077)
    for path in (root / 'setup-jobs', root / ('references/h3/.h3-install.lock' if args.prompt_guides else 'models/.h3-install.lock')):
        require_unlinked(path)
    for model, directory in targets:
        require_unlinked(directory / '.studio-model-manifest')
        for entry in model['files']:
            target = directory / entry['path']
            require_unlinked(target)
            require_unlinked(target.with_name(target.name + '.part'))
    (root / 'setup-jobs').mkdir(parents=True, exist_ok=True)
    (root / collection).mkdir(parents=True, exist_ok=True)
    with (root / ('references/h3/.h3-install.lock' if args.prompt_guides else 'models/.h3-install.lock')).open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        job = Path(tempfile.mkdtemp(prefix='h3-prompt-guides.' if args.prompt_guides else 'h3-models.', dir=root / 'setup-jobs'))
        shutil.copyfile(manifest_path, job / manifest_name)
        receipt = {'schemaVersion': 1, 'manifestSha256': manifest_hash,
                   'installerSha256': digest(Path(__file__)), 'pid': os.getpid(),
                   'startedUnix': time.time(), 'state': 'running', 'verifiedFiles': []}
        write_json(job / 'receipt.json', receipt)
        print(f'Evidence: {job}', flush=True)
        stopping = False
        def interrupted(signum, _frame):
            nonlocal stopping
            if not stopping:
                stopping = True
                raise InterruptedError('Installer received '+signal.Signals(signum).name)
        try:
            for sig in (signal.SIGINT, signal.SIGTERM):
                signal.signal(sig, interrupted)
            remaining = 0
            for model, directory in targets:
                marker = directory / '.studio-model-manifest'
                if directory.exists():
                    if directory.is_symlink() or not marker.is_file() or marker.read_text().strip() != manifest_hash:
                        raise RuntimeError(f'Refusing unowned/different model directory: {directory}')
                else:
                    directory.mkdir(parents=True)
                    marker.write_text(manifest_hash + '\n')
                for entry in model['files']:
                    target = directory / entry['path']
                    if target.exists():
                        if not matches(target, entry):
                            raise RuntimeError(f'Installed file changed; retained for investigation: {target}')
                    else:
                        part = target.with_name(target.name + '.part')
                        size = part.stat().st_size if part.exists() else 0
                        if size >= entry['bytes'] and not matches(part, entry):
                            evidence = job / 'rejected' / model['role'] / entry['path']
                            evidence.parent.mkdir(parents=True, exist_ok=True)
                            part.replace(evidence)
                            size = 0
                        remaining += entry['bytes'] - size
            if shutil.disk_usage(root).free < remaining + (1024**2 if args.prompt_guides else 2 * 1024**3):
                raise RuntimeError('Insufficient free space: pinned bytes plus download reserve required')
            for model, directory in targets:
                for entry in model['files']:
                    target = directory / entry['path']
                    # Refuse linked parents as well as linked final files.
                    if target.resolve() != target.absolute():
                        raise RuntimeError(f'Refusing symlinked model path: {target}')
                    if target.exists() and not matches(target, entry):
                        raise RuntimeError(f'Installed file changed; retained for investigation: {target}')
                    if not target.exists():
                        target.parent.mkdir(parents=True, exist_ok=True)
                        part = target.with_name(target.name + '.part')
                        if part.is_symlink():
                            raise RuntimeError(f'Refusing symlinked partial file: {part}')
                        url = f'https://huggingface.co/{model["repository"]}/resolve/{model["revision"]}/{entry["path"]}'
                        if not matches(part, entry):
                            print(f'Downloading {model["role"]}/{entry["path"]}', flush=True)
                            with (job / 'download.log').open('a') as log:
                                # Explicit public URL; no HF login or credential access.
                                subprocess.run(['curl', '--disable', '--fail', '--location',
                                                '--proto', '=https', '--proto-redir', '=https',
                                                '--connect-timeout', '30', '--speed-limit', '1024',
                                                '--speed-time', '120', '--retry', '2', '--continue-at', '-',
                                                '--output', str(part), url], stdout=log, stderr=log, check=True)
                        if not matches(part, entry):
                            # Preserve corrupt bytes in this attempt; a later retry starts fresh.
                            evidence = job / 'rejected' / model['role'] / entry['path']
                            evidence.parent.mkdir(parents=True, exist_ok=True)
                            part.replace(evidence)
                            raise RuntimeError(f'Model checksum/size mismatch; retained at {evidence}')
                        part.replace(target)
                    receipt['verifiedFiles'].append({'role': model['role'], 'path': str(target),
                                                      'bytes': entry['bytes'], 'sha256': entry['sha256']})
                    write_json(job / 'receipt.json', receipt)
            receipt['state'] = 'succeeded'
        except BaseException as error:
            receipt['state'] = 'failed'
            receipt['error'] = f'{type(error).__name__}: {error}'
            raise
        finally:
            stopping = True
            receipt['finishedUnix'] = time.time()
            write_json(job / 'receipt.json', receipt)
        print(f'Verified {len(receipt["verifiedFiles"])} files. No generation performed.', flush=True)


if __name__ == '__main__':
    main()
