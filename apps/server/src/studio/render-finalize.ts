import { rm, writeFile } from 'node:fs/promises';
export interface RenderFinalizationIO { remove(path:string):Promise<void>; writeReceipt(path:string,receipt:Record<string,unknown>):Promise<void> }
export interface RenderFinalization { audioPath:string;scratchPaths?:string[];partialPath:string;outputPath:string;receiptPath:string;receipt:Record<string,unknown>;primaryError?:Error }
const filesystem:RenderFinalizationIO={remove:path=>rm(path,{force:true}),writeReceipt:(path,receipt)=>writeFile(path,JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600})};
const asError=(value:unknown)=>value instanceof Error?value:new Error(String(value));
/** Finalization must never disguise unknown child cleanup as an ordinary media
 * failure. Try each owned derivative and the receipt independently; preserve
 * the primary error first, and retain every subsequent filesystem failure. */
export async function finalizeRenderFiles(input:RenderFinalization,io:RenderFinalizationIO=filesystem):Promise<void> {
 const errors:Error[]=input.primaryError?[input.primaryError]:[],finalizationErrors:Error[]=[];
 const record=(error:unknown)=>{const e=asError(error);errors.push(e);finalizationErrors.push(e);};
 for(const path of new Set([input.audioPath,...(input.scratchPaths??[]),input.partialPath]))try{await io.remove(path);}catch(error){record(error);}
 let outputRemovalAttempted=false;
 const removeOutput=async()=>{outputRemovalAttempted=true;try{await io.remove(input.outputPath);}catch(error){record(error);}};
 if(errors.length||input.receipt.state!=='succeeded')await removeOutput();
 if(errors.length){input.receipt.state='failed';input.receipt.error=errors.map(e=>e.message).join(' | ');}
 if(finalizationErrors.length)input.receipt.finalizationErrors=finalizationErrors.map(e=>e.message);
 try{await io.writeReceipt(input.receiptPath,input.receipt);}catch(error){
  record(error);
  // A validated file without a successfully persisted receipt is not publishable.
  if(!outputRemovalAttempted)await removeOutput();
 }
 if(errors.length===1)throw errors[0];
 if(errors.length>1)throw new AggregateError(errors,errors.map(e=>e.message).join(' | '),{cause:input.primaryError??errors[0]});
}
