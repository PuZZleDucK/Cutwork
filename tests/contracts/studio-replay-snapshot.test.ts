/** Synthetic files only: exact helper and media capture, not native inference. */
import {afterEach,expect,test} from 'vitest';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {captureExecutionSource,verifyExecutionSource,captureReplayFile,verifyReplayFile} from '../../apps/server/src/studio/execution-snapshot.ts';
const dirs:string[]=[];afterEach(async()=>{for(const d of dirs.splice(0))await rm(d,{recursive:true,force:true});});
const sha=(b:string)=>createHash('sha256').update(b).digest('hex');
async function fixture(){const root=await mkdtemp(join(tmpdir(),'studio-snapshot-'));dirs.push(root);const source=join(root,'source'),destination=join(root,'captured');await mkdir(join(source,'integrations/yue2'),{recursive:true});await writeFile(join(source,'integrations/yue2/generate.py'),'original helper');await writeFile(join(source,'integrations/yue2/models.json'),'original model pins');return{root,source,destination};}
test('native helper snapshots remain exact after original source edits and verify every dependency',async()=>{const f=await fixture(),manifest=await captureExecutionSource(f.source,f.destination,'yue2');await writeFile(join(f.source,'integrations/yue2/generate.py'),'later helper');expect(await verifyExecutionSource(manifest)).toBe(f.destination);expect(await readFile(join(f.destination,'integrations/yue2/generate.py'),'utf8')).toBe('original helper');expect(manifest.files).toHaveLength(2);});
test('changed or missing captured helper blocks replay, not replacement from current source',async()=>{const f=await fixture(),m=await captureExecutionSource(f.source,f.destination,'yue2');await writeFile(join(f.destination,'integrations/yue2/generate.py'),'tampered');await expect(verifyExecutionSource(m)).rejects.toThrow(/changed|hash/i);});
test('capture never overwrites an existing attempt source directory',async()=>{const f=await fixture();await captureExecutionSource(f.source,f.destination,'yue2');await expect(captureExecutionSource(f.source,f.destination,'yue2')).rejects.toThrow();});
test('retained song/frame input is copied and read against its exact expected hash',async()=>{const f=await fixture(),path=join(f.root,'original.wav'),to=join(f.root,'snapshot.wav');await writeFile(path,'SYNTHETIC ORIGINAL');const m=await captureReplayFile(path,to,sha('SYNTHETIC ORIGINAL'));await writeFile(path,'later');expect(await verifyReplayFile(m)).toBe(to);expect(await readFile(to,'utf8')).toBe('SYNTHETIC ORIGINAL');await writeFile(to,'tampered');await expect(verifyReplayFile(m)).rejects.toThrow(/changed|hash/i);});
test('wrong expected input hash never produces a valid captured replay reference',async()=>{const f=await fixture(),path=join(f.root,'original.png');await writeFile(path,'wrong');await expect(captureReplayFile(path,join(f.root,'copy.png'),sha('expected'))).rejects.toThrow(/changed|hash/i);});
