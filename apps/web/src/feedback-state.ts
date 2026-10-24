import type { ToolStatus } from '../../../packages/core/src/contracts/studio.ts';
/** Presentation only: setup dependency order is independent. */
export function orderedToolIndicators(tools: readonly ToolStatus[]): ToolStatus[] {
 const order=['yue2','analysis','comfyui','h3'];
 return tools.filter(t=>t.id!=='agent').sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id));
}
export const toolIsReady=(tool:ToolStatus|undefined):boolean=>!!tool?.installed&&tool.state==='ready';
/** Queueing, checking and generation activity must not animate setup stripes. */
export function setupClasses(tool:ToolStatus|undefined,ready=toolIsReady(tool)):string {
 return ready?'':`setup-todo${tool?.state==='installing'?' setup-installing':''}`;
}
export function acceptedClipPrompt(current:string,submitted:string,accepted:boolean):string {
 return accepted&&current===submitted?'':current;
}
export function initializePreviewAudio(media:Pick<HTMLVideoElement,'muted'|'defaultMuted'|'volume'>):void {
 media.defaultMuted=false;media.muted=false;media.volume=.5;
}
/** Only the final pixel projection is approximate; enormous exact decimal terms stay finite. */
export function timelinePercent(time:{numerator:bigint;denominator:bigint},totalFrames:number):number {
 return Number(time.numerator*24n*100_000_000n/(time.denominator*BigInt(totalFrames)))/1_000_000;
}

/** Tool status buttons open Config and return to the existing project workspace. */
export function toggleToolConfiguration(view:'projects'|'config'):'projects'|'config' {
 return view==='config'?'projects':'config';
}
