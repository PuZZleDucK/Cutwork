import { describe, expect, it } from 'vitest';
import { finalizeRenderFiles } from '../../apps/server/src/studio/render-finalize.ts';
import type { RenderFinalizationIO } from '../../apps/server/src/studio/render-finalize.ts';
const files={audioPath:'/render/song.wav',partialPath:'/render/partial.mp4',outputPath:'/render/output.mp4',receiptPath:'/render/receipt.json'};
function fixture(failures:string[]) {
 const calls:string[]=[],receipts:Record<string,unknown>[]=[];
 const io:RenderFinalizationIO={remove:async path=>{calls.push(path);if(failures.includes(path))throw new Error(`EACCES: ${path}`);},writeReceipt:async(path,receipt)=>{calls.push(path);receipts.push(structuredClone(receipt));if(failures.includes(path))throw new Error(`ENOSPC: ${path}`);}};
 return {io,calls,receipts};
}
describe('CPU render finalization keeps primary process uncertainty',()=>{
 it('preserves cleanup-unconfirmed when all scratch removals and receipt writing also fail, and attempts every cleanup',async()=>{
  const f=fixture(Object.values(files)),primary=new Error('Render command cleanup unconfirmed');
  let observed:unknown;try{await finalizeRenderFiles({...files,receipt:{state:'failed'},primaryError:primary},f.io);}catch(error){observed=error;}
  expect(observed).toBeInstanceOf(AggregateError);expect((observed as Error).message).toContain('cleanup unconfirmed');
  expect((observed as AggregateError).errors).toHaveLength(5);expect((observed as AggregateError).errors[0]).toBe(primary);
  expect(f.calls).toEqual([files.audioPath,files.partialPath,files.outputPath,files.receiptPath]);
  expect(f.receipts[0]).toMatchObject({state:'failed',error:expect.stringContaining('cleanup unconfirmed'),finalizationErrors:expect.arrayContaining([expect.stringContaining('EACCES')])});
 });
 it('best-effort writes a failed receipt and removes the output when finalization of otherwise successful work fails',async()=>{
  const f=fixture([files.audioPath]);await expect(finalizeRenderFiles({...files,receipt:{state:'succeeded',output:{sha256:'proof'}}},f.io)).rejects.toThrow('EACCES');
  expect(f.calls).toEqual([files.audioPath,files.partialPath,files.outputPath,files.receiptPath]);expect(f.receipts[0]?.state).toBe('failed');expect(f.receipts[0]?.error).toContain('EACCES');
 });
 it('rethrows the original failure unchanged when persistence succeeds',async()=>{
  const f=fixture([]),primary=new Error('PNG hash mismatch');await expect(finalizeRenderFiles({...files,receipt:{state:'failed'},primaryError:primary},f.io)).rejects.toBe(primary);
  expect(f.receipts[0]).toMatchObject({state:'failed',error:'PNG hash mismatch'});
 });
 it('does not remove a successful validated output',async()=>{
  const f=fixture([]);await finalizeRenderFiles({...files,receipt:{state:'succeeded'}},f.io);expect(f.calls).toEqual([files.audioPath,files.partialPath,files.receiptPath]);expect(f.receipts[0]?.state).toBe('succeeded');
 });
 it('removes every owned captured clip/PCM scratch file and retains the original failure if one removal fails',async()=>{
  const scratchPaths=['/render/clip.flac','/render/clip.f32le','/render/soundtrack.f32le'],f=fixture([scratchPaths[0]!]);
  await expect(finalizeRenderFiles({...files,scratchPaths,receipt:{state:'failed'},primaryError:new Error('Native audio hash mismatch')},f.io)).rejects.toThrow(/Native audio hash mismatch.*EACCES/);
  expect(f.calls).toEqual([files.audioPath,...scratchPaths,files.partialPath,files.outputPath,files.receiptPath]);
 });
});
