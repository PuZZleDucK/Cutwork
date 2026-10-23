"""Mocked host/systemd/APT commands and disposable directories only."""
import importlib.util,json,subprocess,tempfile,unittest,sqlite3
from pathlib import Path
SPEC=importlib.util.spec_from_file_location('bootstrap',Path(__file__).resolve().parents[2]/'scripts/bootstrap_support.py');m=importlib.util.module_from_spec(SPEC)
try:SPEC.loader.exec_module(m)
except FileNotFoundError:m=None
class Bootstrap(unittest.TestCase):
 def setUp(self):
  self.assertIsNotNone(m,'Bootstrap implementation missing');self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.home=Path(self.tmp.name);self.source=self.home/'source';(self.source/'integrations').mkdir(parents=True);(self.source/'apps/server/src').mkdir(parents=True);(self.source/'apps/server/src/main.ts').write_text('// fixture');(self.source/'scripts').mkdir();(self.source/'scripts/prepare-runtime.sh').write_text('# fixture');self.manifest={'node':{'version':'24.22.0'},'providers':{'codex':{'version':'0.163.0'},'claude':{'version':'2.1.306'}}};(self.source/'integrations/tool-manifest.json').write_text(json.dumps(self.manifest));(self.source/'package-lock.json').write_text('{"fixture":true}');(self.source/'package.json').write_text('{}');self.env={'HOME':str(self.home),'PATH':'/usr/bin:/bin','XDG_DATA_HOME':str(self.home/'data')};self.c=m.config(self.source,self.env);self.calls=[];self.unit={'LoadState':'not-found','ActiveState':'inactive','Transient':'no','FragmentPath':''};self.fail_command=None;self.preserve_loaded=False;self.bus_command=None
  self.facts={'os':{'ID':'ubuntu','VERSION_ID':'26.04'},'architecture':'x86_64','ramBytes':24*2**30,'swapBytes':8*2**30,'diskFreeBytes':150*2**30,'rootWritable':True,'portAvailable':True,'missingCommands':[],'gpus':[{'uuid':'GPU-11111111-1111-1111-1111-111111111111','memoryMiB':16384,'name':'Synthetic GPU'}],'userManager':True}
 def execute(self,args,**kwargs):
  self.calls.append((args,kwargs));out='';code=0
  if self.fail_command and self.fail_command in args:raise RuntimeError('injected command failure')
  if args[:3]==['systemctl','--user','show']:out='\n'.join(k+'='+v for k,v in self.unit.items())
  elif args[:3]==['systemctl','--user','is-enabled']:code=1;out='disabled'
  elif args[:3]==['systemctl','--user','daemon-reload'] and not self.preserve_loaded:self.unit.update(LoadState='loaded',ActiveState='inactive',Transient='no',FragmentPath=str(self.c['unitPath']),WorkingDirectory=str(self.c['source']),Environment='STUDIO_DATA_ROOT='+str(self.c['root']))
  elif args[0]=='busctl':out='a(sasbttttuii) 1 '+json.dumps(self.bus_command or str(self.c['node']))+' 2 '+json.dumps(str(self.c['node']))+' '+json.dumps(str(self.source/'apps/server/src/main.ts'))+' false 0 0 0 0 0 0 0'
  elif args[0]==str(self.c['node']) and '--eval' in args:out=json.dumps({'execPath':str(self.c['node']),'version':'v24.22.0','modules':'fixture-ABI','sqlite':'fixture-SQLite'})
  elif args[-2:]==['run','build']:(self.source/'dist/web').mkdir(parents=True,exist_ok=True);(self.source/'dist/web/index.html').write_text('fixture built')
  return subprocess.CompletedProcess(args,code,out,'')
 def install(self,**kw):return m.install(self.c,run=self.execute,facts=self.facts,**kw)
 def test_plan_readonly(self):
  before=list(self.home.rglob('*'));self.assertTrue(m.plan(self.c,facts=self.facts)['ready']);self.assertEqual(before,list(self.home.rglob('*')));self.assertFalse(self.calls);self.assertFalse(self.c['root'].exists())
 def test_root_rules(self):
  self.assertEqual(self.c['root'],self.home/'data/music-video-studio');self.assertEqual(m.config(self.source,{**self.env,'STUDIO_DATA_ROOT':str(self.home/'explicit')})['root'],self.home/'explicit')
  with self.assertRaisesRegex(ValueError,'absolute'):m.config(self.source,{**self.env,'STUDIO_DATA_ROOT':'relative'})
 def test_host_failures_no_commands(self):
  for key,value in [('architecture','aarch64'),('os',{'ID':'ubuntu','VERSION_ID':'24.04'}),('gpus',[]),('portAvailable',False),('rootWritable',False)]:
   with self.subTest(key=key),self.assertRaises(RuntimeError):m.install(self.c,run=self.execute,facts={**self.facts,key:value})
  self.assertFalse(self.calls)
 def test_missing_package_explicit(self):
  self.facts['missingCommands']=['ffmpeg','ffprobe']
  with self.assertRaisesRegex(RuntimeError,'host-deps'):self.install()
  self.assertFalse(self.calls)
 def test_pinned_node_abi_path_and_no_default_host_writes(self):
  self.install();commands=[a for a,_ in self.calls];self.assertIn(['bash',str(self.source/'scripts/prepare-runtime.sh'),'--install'],commands);self.assertTrue(any(a[0]==str(self.c['node']) and '--eval'in a for a in commands));self.assertTrue(any(a[-2:]==['run','build'] for a in commands));self.assertFalse(any('apt-get'in a or 'start'in a for a in commands))
  for a,k in self.calls:
   if a[0]==str(self.c['npm']):self.assertEqual(k['env']['PATH'].split(':')[0],str(self.c['node'].parent))
 def test_explicit_apt_no_driver_python_or_speculative_build_packages(self):
  self.install(host_deps=True);apt=[a for a,_ in self.calls if 'apt-get'in a];self.assertEqual(len(apt),2);self.assertTrue(any('ffmpeg'in a for a in apt));self.assertFalse(any(any('nvidia'in s or 'python'in s or s in ['pip','build-essential'] for s in a) for a in apt))
 def test_failure_receipt_retry_and_idempotent_completed_repeat(self):
  self.fail_command='ci'
  with self.assertRaises(RuntimeError):self.install()
  self.assertEqual(json.loads((self.c['root']/'bootstrap/receipt.json').read_text())['state'],'failed');self.fail_command=None;self.install();self.calls=[];self.install();self.assertFalse(any(a[0]==str(self.c['npm']) for a,_ in self.calls));self.assertTrue(any('--eval'in a for a,_ in self.calls))
 def test_changed_source_requires_update_and_inactive_service(self):
  self.install();(self.source/'apps/server/src/main.ts').write_text('// changed')
  with self.assertRaisesRegex(RuntimeError,'changed|update'):self.install()
  self.unit['ActiveState']='active'
  with self.assertRaisesRegex(RuntimeError,'active'):self.install(update=True)
 def test_user_unit_and_normal_configuration(self):
  self.install();m.install_service(self.c,run=self.execute,start=True);unit=self.c['unitPath'].read_text();self.assertIn(str(self.c['root']),unit);self.assertIn(str(self.c['node']),unit);self.assertIn('TimeoutStopSec=120s',unit);self.assertIn('KillMode=control-group',unit);self.assertNotIn('ProtectHome',unit);self.assertNotIn('PrivateNetwork',unit);self.assertTrue(any(a[:3]==['systemctl','--user','enable'] for a,_ in self.calls));self.assertTrue(any(a[:3]==['systemctl','--user','start'] for a,_ in self.calls));self.assertFalse(any('loginctl'in a for a,_ in self.calls))
 def test_active_transient_no_overwrite_or_stop(self):
  self.install();self.unit.update(LoadState='loaded',ActiveState='active',Transient='yes',FragmentPath='/run/user/1000/systemd/transient/music-video-studio.service');self.calls=[]
  with self.assertRaisesRegex(RuntimeError,'active'):m.install_service(self.c,run=self.execute,replace_stopped=True)
  self.assertFalse(self.c['unitPath'].exists());self.assertFalse(any('stop'in a for a,_ in self.calls))
 def test_stopped_unknown_requires_explicit_replace_and_backup(self):
  self.install();self.c['unitPath'].parent.mkdir(parents=True);self.c['unitPath'].write_text('[Service]\nExecStart=/unrelated\n')
  with self.assertRaisesRegex(RuntimeError,'replace-stopped'):m.install_service(self.c,run=self.execute)
  m.install_service(self.c,run=self.execute,replace_stopped=True);self.assertTrue(list(self.c['unitPath'].parent.glob('music-video-studio.service.backup-*')))
 def test_retained_native_lease_refuses_service_install(self):
  self.install();(self.c['root']/'jobs').mkdir();db=sqlite3.connect(self.c['root']/'jobs/gpu-queue.sqlite');db.execute('CREATE TABLE gpu_lease(singleton INTEGER)');db.execute('INSERT INTO gpu_lease VALUES(1)');db.commit();db.close()
  with self.assertRaisesRegex(RuntimeError,'work|lease'):m.install_service(self.c,run=self.execute,replace_stopped=True)
 def test_unit_escaping_and_nonsecret_normal_provider_paths(self):
  c=m.config(self.source,{**self.env,'STUDIO_DATA_ROOT':str(self.home/'space % $ root'),'CODEX_HOME':str(self.home/'codex-normal'),'CLAUDE_CONFIG_DIR':str(self.home/'claude-normal'),'SECRET_TEST_TOKEN':'do-not-copy'});unit=m.service_text(c);self.assertIn('%%',unit);self.assertIn('$$',unit);self.assertIn('CODEX_HOME=',unit);self.assertIn('CLAUDE_CONFIG_DIR=',unit);self.assertNotIn('do-not-copy',unit)
 def test_independent_root_and_source_install_does_not_touch_other_active_service(self):
  self.unit.update(LoadState='loaded',ActiveState='active',WorkingDirectory=str(self.home/'other-source'),Environment='STUDIO_DATA_ROOT='+str(self.home/'other-root'))
  self.install();self.assertFalse(any('stop'in a or 'start'in a or 'daemon-reload'in a for a,_ in self.calls))
 def test_live_root_or_source_refuses_even_without_service_option(self):
  for source,root in [(self.source,self.home/'other-root'),(self.home/'other-source',self.c['root'])]:
   self.unit.update(LoadState='loaded',ActiveState='active',WorkingDirectory=str(source),Environment='STUDIO_DATA_ROOT='+str(root))
   with self.assertRaisesRegex(RuntimeError,'active'):self.install()
  self.assertFalse(any(a[0]==str(self.c['npm']) for a,_ in self.calls))
 def test_actual_json_state_tables_and_native_queue_and_debug_are_blockers(self):
  self.install()
  for name,table,body in [('studio.sqlite','studio_attempts',{'state':'queued'}),('studio.sqlite','studio_video_attempts',{'state':'running'}),('studio.sqlite','studio_setup_jobs',{'state':'reconciling'}),('studio.sqlite','studio_renders',{'state':'running'}),('studio.sqlite','studio_deletions',{'state':'purging'}),('debug.sqlite','debug_records',{'record':{'state':'confirmed'},'context':{}}),('studio.sqlite','studio_songs',{'analysis':{'state':'pending'}})]:
   db=sqlite3.connect(self.c['root']/name);db.execute(f'CREATE TABLE {table}(data TEXT)');db.execute(f'INSERT INTO {table} VALUES(?)',(json.dumps(body),));db.commit();db.close()
   with self.subTest(table=table),self.assertRaisesRegex(RuntimeError,'work|analysis'):m.no_work(self.c)
   db=sqlite3.connect(self.c['root']/name);db.execute(f'DROP TABLE {table}');db.commit();db.close()
 def test_explicit_update_repairs_changed_build_when_stopped(self):
  self.install();(self.source/'dist/web/index.html').write_text('changed')
  with self.assertRaisesRegex(RuntimeError,'changed'):self.install()
  self.install(update=True);self.assertEqual((self.source/'dist/web/index.html').read_text(),'fixture built')
 def test_bootstrap_symlink_ownership_refused_before_commands(self):
  outside=self.home/'elsewhere';outside.mkdir();self.c['root'].mkdir(parents=True);(self.c['root']/'bootstrap').symlink_to(outside,target_is_directory=True)
  with self.assertRaisesRegex(RuntimeError,'Linked'):self.install()
  self.assertFalse(self.calls);self.assertEqual(list(outside.iterdir()),[])
 def test_stopped_native_queued_call_blocks_even_without_lease(self):
  self.install();(self.c['root']/'jobs').mkdir();db=sqlite3.connect(self.c['root']/'jobs/gpu-queue.sqlite');db.execute('CREATE TABLE gpu_calls(state TEXT)');db.execute("INSERT INTO gpu_calls VALUES('queued')");db.commit();db.close()
  with self.assertRaisesRegex(RuntimeError,'native work'):m.no_work(self.c)
 def test_not_found_systemd_show_exit_one_is_valid_absence(self):
  def execute(args,**kwargs):
   r=self.execute(args,**kwargs)
   if args[:3]==['systemctl','--user','show']:r.returncode=1
   return r
  self.assertEqual(m.unit_state(execute)['LoadState'],'not-found')
 def test_failed_partially_completed_purge_blocks_replacement(self):
  self.install();db=sqlite3.connect(self.c['root']/'studio.sqlite');db.execute('CREATE TABLE studio_deletions(data TEXT)');db.execute('INSERT INTO studio_deletions VALUES(?)',(json.dumps({'state':'failed','completedEntryIds':['already-unlinked']}),));db.commit();db.close()
  with self.assertRaisesRegex(RuntimeError,'purge|work'):m.no_work(self.c)
 def test_unknown_or_malformed_persisted_states_never_guess_idle(self):
  self.install();db=sqlite3.connect(self.c['root']/'debug.sqlite');db.execute('CREATE TABLE debug_records(data TEXT)');db.commit();db.close()
  for body in [{'state':'succeeded'},{'record':{}},{'record':{'state':'unknown-future'}},{'record':{'state':[]}},False]:
   db=sqlite3.connect(self.c['root']/'debug.sqlite');db.execute('DELETE FROM debug_records');db.execute('INSERT INTO debug_records VALUES(?)',(json.dumps(body),));db.commit();db.close()
   with self.subTest(body=body),self.assertRaisesRegex(RuntimeError,'unknown|Malformed|work'):m.no_work(self.c)
 def test_real_debug_terminal_wrapper_is_idle(self):
  self.install();db=sqlite3.connect(self.c['root']/'debug.sqlite');db.execute('CREATE TABLE debug_records(data TEXT)');db.execute('INSERT INTO debug_records VALUES(?)',(json.dumps({'record':{'state':'succeeded'},'captured':{'synthetic':True}}),));db.commit();db.close();m.no_work(self.c)
 def configured_unit(self,active='inactive'):
  self.install();self.c['unitPath'].parent.mkdir(parents=True);self.c['unitPath'].write_text(m.service_text(self.c));self.unit.update(LoadState='loaded',ActiveState=active,Transient='no',FragmentPath=str(self.c['unitPath']),WorkingDirectory=str(self.source),Environment='STUDIO_DATA_ROOT='+str(self.c['root']));self.calls=[]
 def test_cached_inactive_old_identity_must_reload_before_start(self):
  self.configured_unit();self.unit['WorkingDirectory']=str(self.home/'old-source');m.install_service(self.c,run=self.execute,start=True);commands=[a for a,_ in self.calls];self.assertLess(commands.index(['systemctl','--user','daemon-reload']),commands.index(['systemctl','--user','start',m.UNIT]))
 def test_failed_reload_or_retained_transient_never_starts_stale_command(self):
  self.configured_unit();self.preserve_loaded=True;self.unit['WorkingDirectory']=str(self.home/'old-source')
  with self.assertRaisesRegex(RuntimeError,'loaded|identity'):m.install_service(self.c,run=self.execute,start=True)
  self.assertFalse(any(a[:3]==['systemctl','--user','start']for a,_ in self.calls));self.unit.update(WorkingDirectory=str(self.source),Transient='yes')
  with self.assertRaisesRegex(RuntimeError,'loaded|identity'):m.install_service(self.c,run=self.execute,start=True,replace_stopped=True)
 def test_active_same_file_wrong_loaded_source_or_root_refused_before_reload(self):
  self.configured_unit('active')
  for field,value in [('WorkingDirectory',str(self.home/'wrong-source')),('Environment','STUDIO_DATA_ROOT='+str(self.home/'wrong-root'))]:
   old=self.unit[field];self.unit[field]=value
   with self.assertRaisesRegex(RuntimeError,'active'):m.install_service(self.c,run=self.execute,start=True)
   self.unit[field]=old
  self.assertFalse(any('daemon-reload'in a or 'start'in a for a,_ in self.calls))
 def test_exact_loaded_execstart_not_just_working_directory(self):
  self.configured_unit();self.bus_command='/unrelated-command'
  with self.assertRaisesRegex(RuntimeError,'ExecStart'):m.install_service(self.c,run=self.execute,start=True)
  self.assertFalse(any(a[:3]==['systemctl','--user','start']for a,_ in self.calls))
 def test_dev_build_dependencies_explicit_under_production_environment(self):
  self.c['env'].update(NODE_ENV='production',npm_config_omit='dev');self.install();ci=next(a for a,_ in self.calls if 'ci'in a);self.assertIn('--include=dev',ci)
 def test_command_failure_keeps_bounded_stdout_and_stderr_diagnostics(self):
  script=self.home/'diagnostic.py';script.write_text("import sys;print('x'*20000+'TYPECHECK_STDOUT');print('COMPILER_STDERR',file=sys.stderr);sys.exit(1)")
  with self.assertRaises(RuntimeError)as caught:m.command(['/usr/bin/python3',str(script)])
  self.assertIn('TYPECHECK_STDOUT',str(caught.exception));self.assertIn('COMPILER_STDERR',str(caught.exception));self.assertLess(len(str(caught.exception)),17000)
if __name__=='__main__':unittest.main()
