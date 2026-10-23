#!/usr/bin/env python3
"""Ubuntu newcomer bootstrap. Stdlib orchestration, not a host Python installer.
Default CLI execution diagnoses only; mutations require explicit --install.
The injected runner/facts arguments exist for CPU contract tests, not CLI bypasses.
"""
import argparse,csv,fcntl,hashlib,json,os,platform,shlex,shutil,socket,sqlite3,subprocess,sys,time
from pathlib import Path
UNIT='music-video-studio.service'
PACKAGES=['ca-certificates','curl','tar','xz-utils','unzip','git','ffmpeg']
COMMANDS=['bash','python3','curl','tar','xz','unzip','git','flock','sha256sum','ffmpeg','ffprobe','systemctl','busctl']
WARNING='TRUSTED LAN ONLY: no accounts/authentication; users can launch full-access agents that change this host. Never expose this port to the public Internet.'

def absolute(value,label):
 if not os.path.isabs(value):raise ValueError(label+' must be absolute')
 if any(ord(c)<32 for c in value):raise ValueError(label+' contains control characters')
 return Path(os.path.normpath(value))

def config(source,env=None):
 env=dict(os.environ if env is None else env);source=Path(source).resolve();home=absolute(env.get('HOME',str(Path.home())),'HOME');root=absolute(env.get('STUDIO_DATA_ROOT') or str(absolute(env.get('XDG_DATA_HOME') or str(home/'.local/share'),'XDG_DATA_HOME')/'music-video-studio'),'STUDIO_DATA_ROOT');port=int(env.get('STUDIO_PORT','9122'));host=env.get('STUDIO_HOST','0.0.0.0')
 if not 1024<=port<=65535:raise ValueError('STUDIO_PORT must be an unprivileged port')
 if host not in ['0.0.0.0','127.0.0.1']:raise ValueError('Bootstrap supports STUDIO_HOST=0.0.0.0 or127.0.0.1; explicit advanced manual launch remains available')
 pins=json.loads((source/'integrations/tool-manifest.json').read_text());node=root/f"tools/runtime/node-v{pins['node']['version']}-linux-x64/bin/node";cli=root/f"tools/provider-cli/codex-{pins['providers']['codex']['version']}_claude-{pins['providers']['claude']['version']}/node_modules/.bin";config_home=absolute(env.get('XDG_CONFIG_HOME') or str(home/'.config'),'XDG_CONFIG_HOME')
 env.update(STUDIO_DATA_ROOT=str(root),STUDIO_PORT=str(port),STUDIO_HOST=host);env['PATH']=':'.join(dict.fromkeys([str(node.parent),str(cli),*env.get('PATH','/usr/local/bin:/usr/bin:/bin').split(':')]))
 return {'source':source,'root':root,'home':home,'port':port,'host':host,'pins':pins,'node':node,'npm':node.parent/'npm','cli':cli,'env':env,'unitPath':config_home/'systemd/user'/UNIT}

def command(args,*,env=None,cwd=None,timeout=30,check=True):
 r=subprocess.run(args,env=env,cwd=cwd,timeout=timeout,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 if check and r.returncode:raise RuntimeError(f'Command failed ({r.returncode}): {args[0]} {" ".join(args[1:3])}\n'+'stdout (last8000 chars):\n'+r.stdout[-8000:]+'\nstderr (last8000 chars):\n'+r.stderr[-8000:])
 return r

def nearest(path):
 while not path.exists():path=path.parent
 return path

def collect_facts(c,run=command):
 release={}
 for line in Path('/etc/os-release').read_text().splitlines():
  if '='in line:
   key,value=line.split('=',1);release[key]=value.strip('"')
 mem={}
 for line in Path('/proc/meminfo').read_text().splitlines():
  key,value=line.split(':',1);mem[key]=int(value.split()[0])*1024
 gpus=[]
 try:
  r=run(['/usr/bin/nvidia-smi','--query-gpu=uuid,name,memory.total','--format=csv,noheader,nounits'],timeout=15,check=False)
  if r.returncode==0:
   for row in csv.reader(r.stdout.splitlines()):gpus.append({'uuid':row[0].strip(),'name':row[1].strip(),'memoryMiB':int(row[2].strip())})
 except (OSError,ValueError,subprocess.TimeoutExpired):pass
 try:user_manager=run(['systemctl','--user','show','--property=Version'],check=False).returncode==0
 except (OSError,subprocess.TimeoutExpired):user_manager=False
 # No account environment, credentials or provider config files are queried here.
 parent=nearest(c['root']);free=True;s=socket.socket()
 try:s.bind((c['host'],c['port']))
 except OSError:free=False
 finally:s.close()
 return {'os':{k:release.get(k) for k in ['ID','VERSION_ID']},'architecture':platform.machine(),'ramBytes':mem.get('MemTotal',0),'swapBytes':mem.get('SwapTotal',0),'diskFreeBytes':shutil.disk_usage(parent).free,'rootWritable':os.access(parent,os.W_OK) and parent.resolve()==parent,'portAvailable':free,'missingCommands':[x for x in COMMANDS if not shutil.which(x)],'gpus':gpus,'userManager':user_manager}

def plan(c,*,facts=None,run=command,host_deps=False,allow_busy=False):
 facts=collect_facts(c,run) if facts is None else facts;errors=[];warnings=[]
 if facts['os']!={'ID':'ubuntu','VERSION_ID':'26.04'} or facts['architecture']!='x86_64':errors.append('Supported target is Ubuntu26.04 x86_64; no driver/OS replacement is automated.')
 if not facts['rootWritable']:errors.append('Data directory parent is not writable or contains symlink aliases.')
 if facts['diskFreeBytes']<4*2**30:errors.append('Need at least4GiB free for Node/app bootstrap; this is not a model-storage allowance.')
 if not facts['portAvailable'] and not allow_busy:errors.append('Selected TCP port is occupied; choose another STUDIO_PORT or manage its owner explicitly. Nothing will be stopped.')
 if not facts['userManager']:errors.append('A logged-in systemd user manager is required; run from the intended desktop account.')
 missing=facts['missingCommands'];apt_commands={'curl','tar','xz','unzip','git','ffmpeg','ffprobe'}
 if missing and (not host_deps or set(missing)-apt_commands):errors.append('Missing host prerequisites: '+', '.join(missing)+'. Review explicit --install --host-deps or repair missing base OS tools.')
 selected=c['env'].get('STUDIO_GPU_UUID');gpus=facts['gpus']
 if not gpus:errors.append('NVIDIA driver/GPU is not visible via nvidia-smi; install/repair the driver separately. Bootstrap never changes drivers.')
 elif selected and selected not in [g['uuid']for g in gpus]:errors.append('STUDIO_GPU_UUID does not match an installed GPU.')
 elif len(gpus)>1 and not selected:errors.append('Multiple NVIDIA GPUs: explicitly choose STUDIO_GPU_UUID.')
 if gpus and min(g['memoryMiB']for g in gpus)<16384:warnings.append('16GiB VRAM is the tested target; lower-memory generation is not certified.')
 if facts['ramBytes']<24*2**30:warnings.append('Native H3 has caused host-memory pressure on22GiB machines; conservative offload is not a hard memory cap. Check RAM/swap and other workloads.')
 if facts['diskFreeBytes']<100*2**30:warnings.append('Plan around100GiB or more free for isolated environments, ~40GiB model weights, caches and retained raw frames; actual storage varies.')
 return {'mode':'read-only-plan','ready':not errors,'source':str(c['source']),'dataRoot':str(c['root']),'unitPath':str(c['unitPath']),'listen':f"{c['host']}:{c['port']}",'warning':WARNING,'facts':facts,'errors':errors,'warnings':warnings,'hostPackages':PACKAGES,'steps':['Explicit optional APT shared prerequisites','Pinned Node and both provider CLIs (no login or agent invocation)','Pinned-PATH npm ci, SQLite native ABI check, typecheck, browser build','Optional persistent user service; generator/model setup stays in the web UI'],'limits':['No host Python/pip, NVIDIA driver, swap, firewall, personal service or login-policy modifications','Service starts at user login; linger is a separate explicit loginctl decision','Existing normal provider credentials remain in that user account; no credentials entered in web setup']}

def digest_files(files,base):
 h=hashlib.sha256()
 for p in sorted(files):h.update(str(p.relative_to(base)).encode()+b'\0'+hashlib.sha256(p.read_bytes()).digest())
 return h.hexdigest()

def source_digest(c):
 files=[]
 for name in ['apps','packages','scripts','integrations','public']:
  directory=c['source']/name
  if directory.exists():files.extend(p for p in directory.rglob('*') if p.is_file() and '__pycache__'not in p.parts and p.suffix!='.pyc')
 files.extend(c['source']/name for name in ['package.json','package-lock.json','tsconfig.json','vite.config.ts']if(c['source']/name).is_file());return digest_files(files,c['source'])

def build_digest(c):
 web=c['source']/'dist/web'
 if not(web/'index.html').is_file():raise RuntimeError('Browser build is missing; run bootstrap --install first')
 return digest_files([p for p in web.rglob('*')if p.is_file()],web)

def save(path,value):
 path.parent.mkdir(parents=True,exist_ok=True,mode=0o700);tmp=path.with_name(path.name+'.pending');
 if tmp.is_symlink() or path.is_symlink():raise RuntimeError('Linked bootstrap receipt refused')
 with open(tmp,'w',encoding='utf8')as f:os.chmod(tmp,0o600);json.dump(value,f,indent=2);f.write('\n');f.flush();os.fsync(f.fileno())
 os.replace(tmp,path)

def unit_state(run):
 r=run(['systemctl','--user','show',UNIT,'--property=LoadState,ActiveState,SubState,FragmentPath,Transient,WorkingDirectory,Environment'],check=False)
 values=dict(line.split('=',1)for line in r.stdout.splitlines()if'='in line)
 if r.returncode and values.get('LoadState')!='not-found':raise RuntimeError('Cannot establish existing user-service identity/state; no service changes made')
 # Extract only this nonsecret path; never retain/log the rest of a unit's environment.
 environment=values.pop('Environment','');values['dataRoot']=next((v.split('=',1)[1]for v in shlex.split(environment)if v.startswith('STUDIO_DATA_ROOT=')),None)
 return values

def no_work(c):
 # Read-only SQLite: do not acquire/adopt/reconcile any native ownership.
 for name in ['studio.sqlite','jobs/gpu-queue.sqlite','debug.sqlite']:
  path=c['root']/name
  if not path.exists():continue
  db=sqlite3.connect(path.as_uri()+'?mode=ro',uri=True)
  try:
   tables={r[0]for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
   for table in ['gpu_lease','gpu_maintenance']:
    if table in tables and db.execute(f'SELECT count(*) FROM {table}').fetchone()[0]:raise RuntimeError('Retained native work/lease/maintenance blocks source or service replacement')
   if 'gpu_calls'in tables and db.execute("SELECT count(*) FROM gpu_calls WHERE state IS NULL OR state NOT IN ('succeeded','failed','cancelled')").fetchone()[0]:raise RuntimeError('Queued or unresolved native work blocks replacement')
   if 'studio_artifact_uses'in tables and db.execute('SELECT count(*) FROM studio_artifact_uses').fetchone()[0]:raise RuntimeError('Reserved media work blocks replacement')
   for table in ['studio_attempts','studio_video_attempts','studio_renders','studio_setup_jobs','studio_deletions','debug_records','studio_songs']:
    if table not in tables:continue
    for row in db.execute(f'SELECT data FROM {table}'):
     try:
      data=json.loads(row[0])
      if not isinstance(data,dict):raise ValueError('not object')
      if table=='debug_records':
       data=data['record']
       if not isinstance(data,dict):raise ValueError('not Debug record')
      if table=='studio_songs':
       state=data['analysis']['state'];safe={'available','partial','failed'}
      else:
       state=data['state'];safe={'succeeded','failed','cancelled'}
       if table=='debug_records':safe={'disclosed','cancelled','expired','stale','succeeded','failed'}
       elif table=='studio_deletions':safe={'succeeded'}
       elif table in ['studio_setup_jobs','studio_renders']:safe={'succeeded','failed'}
      if not isinstance(state,str):raise ValueError('not state string')
     except (ValueError,KeyError,TypeError):raise RuntimeError('Malformed persisted work/analysis record blocks source/service replacement')from None
     if state not in safe:raise RuntimeError('Pending/unresolved or unknown studio, Debug, purge or analysis work blocks source/service replacement')
  finally:db.close()

def abi_check(c,run):
 program="const Database=require('better-sqlite3');const db=new Database(':memory:');if(db.prepare('SELECT 40+2 AS value').get().value!==42)throw Error('SQLite contract failed');const sqlite=db.prepare('SELECT sqlite_version() AS v').get().v;db.close();console.log(JSON.stringify({execPath:process.execPath,version:process.version,modules:process.versions.modules,sqlite}));"
 r=run([str(c['node']),'--eval',program],cwd=str(c['source']),env=c['env'],timeout=60);value=json.loads(r.stdout)
 if value.get('execPath')!=str(c['node']) or value.get('version')!='v'+c['pins']['node']['version']:raise RuntimeError('Native SQLite probe did not use the exact pinned Node executable/version')
 return value

def install(c,*,run=command,facts=None,host_deps=False,service=False,update=False,replace_stopped=False):
 receipt=c['root']/'bootstrap/receipt.json'
 if c['root'].resolve()!=c['root'] or receipt.resolve()!=receipt or (receipt.parent/'install.lock').resolve()!=receipt.parent/'install.lock':raise RuntimeError('Linked runtime/bootstrap ownership path refused')
 prior=json.loads(receipt.read_text())if receipt.exists()else None;fingerprint=source_digest(c)
 # Reject host/port defects before changing even the runtime directory.
 report=plan(c,facts=facts,run=run,host_deps=host_deps,allow_busy=bool(prior and prior.get('state')=='complete' and prior.get('sourceDigest')==fingerprint))
 if report['errors']:raise RuntimeError('\n'.join(report['errors']))
 state=unit_state(run);active=state.get('ActiveState')not in ['inactive','failed',None,''];same=prior and prior.get('sourceDigest')==fingerprint and prior.get('source')==str(c['source'])
 if prior and not same and not update:raise RuntimeError('Captured bootstrap source changed; inspect changes, stop the owned app when idle, then explicitly --install --update')
 identical_running=bool(same and prior.get('state')=='complete' and c['unitPath'].exists() and c['unitPath'].read_text()==service_text(c) and state.get('FragmentPath')==str(c['unitPath']) and state.get('Transient')!='yes' and state.get('WorkingDirectory')==str(c['source']) and state.get('dataRoot')==str(c['root']))
 independent=bool(not service and state.get('WorkingDirectory') and state.get('dataRoot') and Path(state['WorkingDirectory']).resolve()!=c['source'] and Path(state['dataRoot']).resolve()!=c['root'])
 if active and not(identical_running or independent):raise RuntimeError('An active service shares this source/runtime or has unknown identity; inspect and explicitly stop that exact owned app before bootstrap. Nothing was stopped.')
 completed=bool(same and prior.get('state')=='complete')
 build_changed=completed and build_digest(c)!=prior.get('buildDigest')
 if build_changed and not update:raise RuntimeError('Completed browser build changed; inspect before an explicit stopped --update')
 if completed and not update and not report['facts']['missingCommands']:
  result={'state':'already-complete','abi':abi_check(c,run),'receipt':str(receipt)}
  if service:result['service']=install_service(c,run=run,start=True,replace_stopped=replace_stopped)
  return result
 if c['root'].exists()and any(c['root'].iterdir())and not prior and not update:raise RuntimeError('Existing runtime has no bootstrap ownership receipt; inspect and explicitly --update to adopt this prepared runtime while stopped')
 if active and not independent:raise RuntimeError('Active service prevents dependency/build changes')
 no_work(c);c['root'].mkdir(parents=True,exist_ok=True,mode=0o700);directory=receipt.parent;directory.mkdir(exist_ok=True,mode=0o700)
 with open(directory/'install.lock','a')as lock:
  fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);record={'version':1,'state':'installing','source':str(c['source']),'sourceDigest':fingerprint,'dataRoot':str(c['root']),'startedAt':time.time(),'steps':[]};save(receipt,record)
  try:
   if host_deps:
    print('Installing explicitly authorized shared APT prerequisites (no Python/driver changes).',file=sys.stderr)
    # Explicit terminal-authorized APT only, never host pip or driver packages.
    for argv in [['sudo','apt-get','update'],['sudo','apt-get','install','--yes','--no-install-recommends',*PACKAGES]]:run(argv,timeout=1800)
    record['steps'].append('explicit-host-packages');save(receipt,record)
   print('Preparing pinned Node and provider CLIs; no login or agent task.',file=sys.stderr)
   run(['bash',str(c['source']/'scripts/prepare-runtime.sh'),'--install'],cwd=str(c['source']),env=c['env'],timeout=3600);record['steps'].append('pinned-runtime-providers');save(receipt,record)
   print('Installing locked app dependencies; checking pinned Node and native SQLite ABI.',file=sys.stderr)
   run([str(c['npm']),'ci','--ignore-scripts','--include=dev','--include=optional','--no-fund'],cwd=str(c['source']),env=c['env'],timeout=1800);record['abi']=abi_check(c,run);record['steps'].append('locked-app-dependencies-native-ABI');save(receipt,record)
   print('Typechecking and building the browser.',file=sys.stderr)
   for task in ['typecheck','build']:run([str(c['npm']),'run',task],cwd=str(c['source']),env=c['env'],timeout=600)
   if source_digest(c)!=fingerprint:raise RuntimeError('Source changed during bootstrap; completion not recorded')
   record.update(state='complete',completedAt=time.time(),buildDigest=build_digest(c));save(receipt,record)
  except Exception as e:record.update(state='failed',error=str(e));save(receipt,record);raise
 if service:record['service']=install_service(c,run=run,start=True,replace_stopped=replace_stopped)
 return record

def quoted(value,exec_arg=False):
 value=str(value)
 if any(ord(c)<32 for c in value):raise ValueError('Service configuration contains control characters')
 value=value.replace('\\','\\\\').replace('"','\\"').replace('%','%%')
 if exec_arg:value=value.replace('$','$$')
 return '"'+value+'"'

def service_text(c):
 # Preserve normal account config paths, not authentication secrets in unit text.
 values={k:c['env'][k]for k in ['STUDIO_DATA_ROOT','STUDIO_PORT','STUDIO_HOST','PATH','STUDIO_GPU_UUID','STUDIO_NATIVE_LIMIT_SECONDS','STUDIO_ALLOWED_HOSTS','XDG_DATA_HOME','XDG_CONFIG_HOME','CODEX_HOME','CLAUDE_CONFIG_DIR']if k in c['env']}
 return '\n'.join(['# Assembly managed user service v1','[Unit]','Description=Assembly trusted-LAN music video studio','After=network-online.target','Wants=network-online.target','','[Service]','Type=exec','WorkingDirectory='+str(c['source']).replace('%','%%'),*[f'Environment={quoted(k+"="+v)}'for k,v in values.items()],f'ExecStart={quoted(c["node"],True)} {quoted(c["source"]/"apps/server/src/main.ts",True)}','KillMode=control-group','TimeoutStopSec=120s','Restart=no','UMask=0077','','[Install]','WantedBy=default.target',''])

def verify_loaded_service(c,run):
 loaded=unit_state(run)
 if loaded.get('LoadState')!='loaded' or loaded.get('Transient')!='no' or loaded.get('FragmentPath')!=str(c['unitPath']) or loaded.get('WorkingDirectory')!=str(c['source']) or loaded.get('dataRoot')!=str(c['root']):raise RuntimeError('Reloaded service identity differs or a transient unit remains loaded; no start requested. Inspect/retire the stopped old unit explicitly before retrying.')
 # Local systemd interface documentation defines ExecStart as a(sasbttttuii).
 # busctl's typed output preserves quoted path/argv boundaries, unlike substring
 # matching the human-readable systemctl ExecStart summary. No shell execution.
 r=run(['busctl','--user','get-property','org.freedesktop.systemd1','/org/freedesktop/systemd1/unit/music_2dvideo_2dstudio_2eservice','org.freedesktop.systemd1.Service','ExecStart'])
 try:
  fields=shlex.split(r.stdout);count=int(fields[1]);argc=int(fields[3]);expected=[str(c['node']),str(c['source']/'apps/server/src/main.ts')]
  valid=fields[0]=='a(sasbttttuii)' and count==1 and fields[2]==str(c['node']) and argc==2 and fields[4:4+argc]==expected and fields[4+argc]=='false'
 except (ValueError,IndexError):valid=False
 if not valid:raise RuntimeError('Loaded ExecStart differs from the exact pinned Node and source command; no start requested')
 return loaded

def install_service(c,*,run=command,start=False,replace_stopped=False):
 state=unit_state(run);path=c['unitPath'];desired=service_text(c)
 if path.resolve()!=path:raise RuntimeError('Linked service ownership path refused')
 current=path.read_text()if path.is_file()else None;active=state.get('ActiveState')not in ['inactive','failed',None,''];loaded=state.get('LoadState')not in ['not-found',None,''];same=current==desired and state.get('Transient')!='yes' and (not loaded or state.get('FragmentPath')==str(path)) and (not active or state.get('WorkingDirectory')==str(c['source']) and state.get('dataRoot')==str(c['root']))
 if active and not same:raise RuntimeError('Existing active/transient/different service refused. Inspect status, finish work and explicitly stop that exact owned app first; installer never stops it.')
 if (current is not None and current!=desired or loaded and state.get('FragmentPath')not in ['',str(path)]) and not replace_stopped:raise RuntimeError('Existing service differs; review its identity and use --replace-stopped-service only while it is stopped')
 if path.is_symlink() or path.parent.resolve()!=path.parent or c['root'].resolve()!=c['root']:raise RuntimeError('Linked service/data paths are not eligible for managed installation')
 if not active:no_work(c)
 build_digest(c);abi=abi_check(c,run)
 if not same:
  path.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
  if current is not None:
   backup=path.with_name(path.name+f'.backup-{time.time_ns()}');backup.write_text(current);backup.chmod(0o600)
  temporary=path.with_name(path.name+f'.pending-{os.getpid()}')
  with open(temporary,'x')as f:f.write(desired);f.flush();os.fsync(f.fileno())
  temporary.chmod(0o600);os.replace(temporary,path)
 # Even identical on-disk text may follow an earlier failed reload. Refresh
 # inactive configuration, then independently check what systemd actually loaded.
 if not active:run(['systemctl','--user','daemon-reload'])
 verify_loaded_service(c,run)
 if run(['systemctl','--user','is-enabled',UNIT],check=False).returncode:run(['systemctl','--user','enable',UNIT])
 if start and not active:run(['systemctl','--user','start',UNIT],timeout=150)
 result={'unit':UNIT,'unitPath':str(path),'unitSha256':hashlib.sha256(desired.encode()).hexdigest(),'abi':abi,'requestedStart':start,'lingerChanged':False,'commands':{'status':f'systemctl --user status {UNIT}','logs':f'journalctl --user -u {UNIT} -f','start':f'systemctl --user start {UNIT}','stop':f'systemctl --user stop {UNIT}','restart':f'systemctl --user restart {UNIT}'},'warning':WARNING,'persistence':'Enabled for user login. Boot-without-login requires a separate explicit loginctl enable-linger decision.'};save(c['root']/'bootstrap/service.json',result);return result

def main(argv=None):
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('mode',choices=['bootstrap','service']);parser.add_argument('--install',action='store_true');parser.add_argument('--host-deps',action='store_true');parser.add_argument('--service',action='store_true');parser.add_argument('--start',action='store_true');parser.add_argument('--update',action='store_true');parser.add_argument('--replace-stopped-service',action='store_true');args=parser.parse_args(argv)
 if not args.install and any([args.host_deps,args.service,args.start,args.update,args.replace_stopped_service]):parser.error('Mutating options require explicit --install')
 if args.mode=='bootstrap' and args.start:parser.error('Use --service to install/enable/start, or the separate service helper --install --start')
 if args.mode=='service' and any([args.host_deps,args.service,args.update]):parser.error('Host/app installation options belong to bootstrap-ubuntu.sh')
 c=config(Path(__file__).resolve().parent.parent);print(WARNING,file=sys.stderr)
 if not args.install:
  report=plan(c);report['serviceUnit']=service_text(c);print(json.dumps(report,indent=2));return 0
 result=install(c,host_deps=args.host_deps,service=args.service,update=args.update,replace_stopped=args.replace_stopped_service)if args.mode=='bootstrap'else install_service(c,start=args.start,replace_stopped=args.replace_stopped_service);print(json.dumps(result,indent=2));return 0
if __name__=='__main__':
 try:sys.exit(main())
 except (OSError,ValueError,RuntimeError,subprocess.TimeoutExpired)as error:print('Bootstrap refused/failed: '+str(error),file=sys.stderr);sys.exit(2)
