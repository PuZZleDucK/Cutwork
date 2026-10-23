"""Approved polling regressions against main(); all native boundaries are fixtures.

No GPU, network or providers. Receipt/control flow is real; one owned local
Python child checks the actual alarm with a five-second teardown backstop.
"""
from contextlib import ExitStack, redirect_stdout
import importlib.util
import io
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch
import urllib.error
import uuid

path = Path(__file__).resolve().parents[2] / 'integrations/h3/generate.py'
spec = importlib.util.spec_from_file_location('h3_polling_runner', path)
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class Harness:
    def __init__(self, root, history=None, queue=None, budget=40):
        self.root, self.history, self.queue = root, list(history or ['done']), list(queue or ['empty'])
        self.now, self.calls, self.handlers = 100.0, [], {}
        self.alarm_at = None
        self.budget, self.exited, self.post_error, self.stop_on_error = budget, False, False, None
        self.collection_count = 0
        self.attempt = str(uuid.uuid4())
        self.run = root/'projects/poll-fixture/runs'/self.attempt
        self.proc = Mock(pid=987654321, returncode=None)
        self.tool = root/'tools/comfyui'
        (self.tool/'source').mkdir(parents=True)
        self.request = root/'request.json'
        self.request.write_text(json.dumps({'schemaVersion':1,'attemptId':self.attempt,'projectId':'poll-fixture',
            'seed':'11187851132846900587','prompt':'Synthetic transport fixture; no generation.',
            'song':{'path':str(root/'unused.wav'),'sha256':'unused'},
            'plan':{'fps':'24/1','requestedFrames':48,'nativeFrames':56,
                    'placement':{'startFrame':0,'endFrame':48},'durationWarning':False,
                    'conditioning':{'startSample':0,'availableSamples':112000,'silenceSamples':0,'totalSamples':112000}}}))
        self.collect_real = runner.media.collect_outputs

    def sleep(self, seconds):
        self.now += seconds

    def setitimer(self, _which, seconds, interval=0):
        self.alarm_at = self.now+seconds if seconds else None
        return (0,0)

    def popen(self, command, **_):
        self.command = command
        return self.proc

    def prepare(self, _song, _plan, directory):
        directory.mkdir(); p=directory/'conditioning.wav'; p.write_bytes(b'not-real-audio: transport fixture')
        return {'path':str(p),'sha256':runner.media.sha256(p)}

    def completed(self):
        return {'job-fixture':{'prompt':[0,'job-fixture',self.graph],
                'status':{'completed':True,'status_str':'success'},'outputs':{}}}

    def open(self, request, timeout):
        url = request if isinstance(request,str) else request.full_url
        method = 'GET' if isinstance(request,str) else request.get_method()
        route = url.split(':8198/')[1]
        self.calls.append((method,route,timeout,self.now))
        if route=='system_stats':
            value={'system':{'argv':self.command[2:],'comfyui_version':'fixture'},'devices':[{'type':'cuda'}]}
        elif route=='object_info': value={n['class_type']:{} for n in runner.workflow.h3_graph(prompt='x',seed='1',frames=56,audio_filename='conditioning.wav',first_frame_filename='continuation.png' if 'firstFrame' in json.loads(self.request.read_text()) else None).values()}
        elif route=='prompt':
            self.graph=json.loads(request.data)['prompt']
            if self.post_error: raise TimeoutError('submission timed out')
            value={'prompt_id':'job-fixture','number':0,'node_errors':{}}
        else:
            seq = self.history if route.startswith('history/') else self.queue
            value=seq.pop(0) if len(seq)>1 else seq[0]
            if isinstance(value,BaseException):
                self.now += timeout
                if self.stop_on_error=='exit': self.exited=True
                if self.stop_on_error=='signal': self.handlers[signal.SIGTERM](signal.SIGTERM,None)
                raise value
            if value=='done': value=self.completed()
            elif value=='empty': value={} if route.startswith('history/') else {'queue_pending':[],'queue_running':[]}
            elif value=='bad-status':
                value=self.completed();value['job-fixture']['status']['status_str']='error'
            elif value=='bad-id':
                value=self.completed();value['job-fixture']['prompt'][1]='other-job'
            elif value=='bad-graph':
                value=self.completed();value['job-fixture']['prompt'][2]={}
            elif value=='late':
                self.now+=timeout+1;value=self.completed()
            elif value=='slow-body':
                harness=self
                class SlowBody(io.BytesIO):
                    def read(self,*args):
                        for _ in range(30):
                            harness.now += 0.1
                            if harness.alarm_at is not None and harness.now>=harness.alarm_at:
                                harness.handlers[signal.SIGALRM](signal.SIGALRM,None)
                        return super().read(*args)
                return SlowBody(json.dumps(self.completed()).encode())
            elif value=='invalid-json': return io.BytesIO(b'{broken')
        return io.BytesIO(json.dumps(value).encode())

    def collect(self, **kwargs):
        self.collection_count += 1
        result=kwargs['result']
        # Keep actual existing rejection behavior; no real files are reached.
        if result['prompt'][2]!=kwargs['graph'] or result['status']['status_str']!='success':
            return self.collect_real(**kwargs)
        return {'fixture':True}

    def signal(self, number, handler):
        previous=self.handlers.get(number,signal.SIG_DFL);self.handlers[number]=handler;return previous

    def execute(self):
        cwd=Path.cwd(); old_umask=os.umask(0o077);os.umask(old_umask)
        identity={'pid':self.proc.pid,'processGroupId':self.proc.pid,'startTicks':'fixture','bootId':'fixture'}
        try:
            with ExitStack() as stack:
                def patcher(obj,name,**kw): return stack.enter_context(patch.object(obj,name,**kw))
                stack.enter_context(patch.dict(os.environ,{'STUDIO_DATA_ROOT':str(self.root)}))
                patcher(runner.sys,'argv',new=['generate.py','--request',str(self.request),'--run','--timeout-seconds',str(self.budget)])
                patcher(runner,'verify_installation',return_value=(self.tool,{'source':{'revision':'fixture','version':'fixture'}},{}))
                patcher(runner,'verify_models',return_value=self.root/'models')
                patcher(runner,'process_identity',return_value=identity)
                patcher(runner,'gpu_processes',return_value=[])
                patcher(runner,'exit_observation',side_effect=lambda _: 'exited' if self.exited else None)
                patcher(runner,'stop_owned_group',return_value={'ownedServiceExited':True,'serviceExitCode':0,'stopSignals':[]})
                patcher(runner.media,'prepare_conditioning',side_effect=self.prepare)
                patcher(runner.media,'collect_outputs',side_effect=self.collect)
                patcher(runner.subprocess,'Popen',side_effect=self.popen)
                patcher(runner.threading,'Thread',return_value=Mock(is_alive=Mock(return_value=False)))
                patcher(runner.socket,'socket')
                patcher(runner.signal,'signal',side_effect=self.signal)
                patcher(runner.signal,'getitimer',return_value=(0,0))
                patcher(runner.signal,'setitimer',side_effect=self.setitimer)
                patcher(runner.urllib.request,'build_opener',return_value=self)
                patcher(runner.time,'monotonic',side_effect=lambda:self.now)
                patcher(runner.time,'sleep',side_effect=self.sleep)
                with redirect_stdout(io.StringIO()): code=runner.main()
                return code,json.loads((self.run/'receipt.json').read_text())
        finally:
            os.chdir(cwd);os.umask(old_umask)


class PollingTest(unittest.TestCase):
    def run_fixture(self, **kwargs):
        temp=tempfile.TemporaryDirectory();self.addCleanup(temp.cleanup)
        return Harness(Path(temp.name),**kwargs)

    def assert_single_submission(self,h):
        self.assertEqual(sum(m=='POST' for m,_,_,_ in h.calls),1)

    def test_image_snapshot_is_copied_and_both_modalities_are_submitted_once(self):
        h=self.run_fixture();request=json.loads(h.request.read_text())
        request['firstFrame']={'path':str(h.root/'captured.png'),'sha256':'a'*64,'pixelSha256':'b'*64};h.request.write_text(json.dumps(request))
        def prepared(reference,directory,python,project):
            self.assertEqual(reference,request['firstFrame']);self.assertEqual(project,h.root/'projects/poll-fixture')
            self.assertEqual(python,h.tool/'venv/bin/python')
            p=directory/'continuation.png';p.write_bytes(b'EXPLICIT MOCK PNG TRANSPORT')
            return {'path':str(p),'sourcePath':reference['path'],'sha256':runner.media.sha256(p),'pixelSha256':'b'*64,'bytes':p.stat().st_size,'width':640,'height':480}
        with patch.object(runner.media,'prepare_first_frame',side_effect=prepared) as prepare:
            code,r=h.execute()
        self.assertEqual(code,0,r);prepare.assert_called_once();self.assert_single_submission(h)
        self.assertEqual(h.graph['5']['inputs']['first_frame'],['19',0]);self.assertEqual(h.graph['7']['inputs']['audio'],['6',0])
        self.assertEqual(runner.media.sha256(h.run/'comfy-base/input/continuation.png'),r['firstFrame']['sha256'])

    def test_history_timeout_then_empty_then_completion_preserves_submission(self):
        h=self.run_fixture(history=[TimeoutError('slow history'),'empty','done'])
        code,r=h.execute()
        self.assertEqual(code,0,r);self.assert_single_submission(h)
        self.assertEqual(h.collection_count,1)
        self.assertEqual(r['actualSeeds'],{'h3':'11187851132846900587'})
        self.assertEqual(len(r['observationErrors']),1)
        self.assertEqual(r['observationErrors'][0]['route'],'history/job-fixture')
        self.assertEqual(r['promptId'],'job-fixture')

    def test_persistent_failure_obeys_original_deadline_and_remaining_budget(self):
        h=self.run_fixture(history=[TimeoutError('slow')],budget=12)
        code,r=h.execute()
        self.assertEqual(code,1);self.assertEqual(r['state'],'failed')
        self.assertAlmostEqual(h.now,112);self.assertEqual(h.collection_count,0)
        reads=[x for x in h.calls if x[1].startswith('history/')]
        self.assertEqual(len(reads),2)
        self.assertEqual([x[2] for x in reads],[10,1])
        self.assertEqual(len(r['observationErrors']),2);self.assertIn('deadline',r['error'].lower())
        self.assert_single_submission(h)

    def test_stop_and_process_exit_after_timeout_prevent_another_read(self):
        for mode in ['signal','exit']:
            with self.subTest(mode=mode):
                h=self.run_fixture(history=[TimeoutError('slow'),'done']);h.stop_on_error=mode
                code,r=h.execute()
                self.assertEqual(code,1);self.assertEqual(r['state'],'interrupted' if mode=='signal' else 'failed')
                self.assertIn('Termination requested' if mode=='signal' else 'Owned Comfy process exited',r['error'])
                self.assertEqual(len([x for x in h.calls if x[1].startswith('history/')]),1)
                self.assertEqual(h.collection_count,0);self.assert_single_submission(h)

    def test_non_transient_responses_are_not_retried_or_accepted(self):
        for response in [urllib.error.HTTPError('http://fixture',503,'HTTP error',{},None),
                         urllib.error.URLError('non-transient fixture reason'),'invalid-json','bad-status','bad-id','bad-graph']:
            with self.subTest(response=str(response)):
                h=self.run_fixture(history=[response,'done']);code,r=h.execute()
                self.assertEqual(code,1,r);self.assertEqual(r['state'],'failed')
                self.assertEqual(len([x for x in h.calls if x[1].startswith('history/')]),1)
                self.assert_single_submission(h)

    def test_final_queue_timeout_retries_only_queue_and_keeps_one_collection(self):
        h=self.run_fixture(queue=[urllib.error.URLError(TimeoutError('queue slow')),'empty'])
        code,r=h.execute();self.assertEqual(code,0,r)
        self.assertEqual(h.collection_count,1);self.assert_single_submission(h)
        self.assertEqual(len([x for x in h.calls if x[1].startswith('history/')]),1)
        self.assertEqual(len([x for x in h.calls if x[1]=='queue']),2)
        self.assertEqual(r['observationErrors'][0]['route'],'queue')

    def test_post_timeout_is_never_resubmitted(self):
        h=self.run_fixture();h.post_error=True
        code,r=h.execute();self.assertEqual(code,1);self.assert_single_submission(h)
        self.assertFalse(any(x[1].startswith('history/') for x in h.calls))
        self.assertEqual(h.collection_count,0);self.assertNotIn('promptId',r)

    def test_real_alarm_interrupts_body_and_restores_handler_without_overwriting_timer(self):
        source = r"""
import importlib.util,io,json,signal,sys,time
spec=importlib.util.spec_from_file_location('runner',sys.argv[1]);runner=importlib.util.module_from_spec(spec);spec.loader.exec_module(runner)
class Slow(io.BytesIO):
    def read(self,*args):
        for _ in range(200):time.sleep(0.01)
        return super().read(*args)
class Transport:
    def open(self,url,timeout):return Slow(b'{}')
previous=lambda *_:None
signal.signal(signal.SIGALRM,previous)
start=time.monotonic()
try:runner.read_json(Transport(),'http://unused',0.12)
except TimeoutError:pass
else:raise RuntimeError('Slow body did not time out')
elapsed=time.monotonic()-start
if signal.getsignal(signal.SIGALRM) is not previous or signal.getitimer(signal.ITIMER_REAL)!=(0.0,0.0):
    raise RuntimeError('Alarm/handler was not restored')
signal.setitimer(signal.ITIMER_REAL,4)
try:
    try:runner.read_json(Transport(),'http://unused',0.12)
    except ValueError:pass
    else:raise RuntimeError('Existing timer was replaced')
    if signal.getitimer(signal.ITIMER_REAL)[0]<=3:raise RuntimeError('Existing timer changed')
finally:signal.setitimer(signal.ITIMER_REAL,0)
print(json.dumps({'elapsed':elapsed}))
"""
        result=subprocess.run([sys.executable,'-c',source,str(path)],capture_output=True,text=True,timeout=5)
        self.assertEqual(result.returncode,0,result.stderr)
        elapsed=json.loads(result.stdout)['elapsed']
        self.assertGreaterEqual(elapsed,0.08);self.assertLess(elapsed,1.5)

    def test_slow_response_body_is_interrupted_within_the_original_budget(self):
        h=self.run_fixture(history=['slow-body'],budget=2)
        code,r=h.execute();self.assertEqual(code,1,r)
        self.assertLessEqual(h.now,102.10001)
        self.assertEqual(h.collection_count,0);self.assert_single_submission(h)
        self.assertEqual(len(r['observationErrors']),1)

    def test_late_success_and_empty_history_cannot_exceed_deadline(self):
        for response in ['late','empty']:
            with self.subTest(response=response):
                h=self.run_fixture(history=[response],budget=2)
                code,r=h.execute();self.assertEqual(code,1,r)
                self.assertIn('deadline',r['error'].lower());self.assertEqual(h.collection_count,0)
                self.assert_single_submission(h)


if __name__=='__main__': unittest.main()
