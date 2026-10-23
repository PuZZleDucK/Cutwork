import type { MusicInput } from '../../../packages/core/src/contracts/studio.ts';
import { readSession, writeSession, decodeSubmission, clearMatchingSession } from './clip-session.ts';
import { submissionIdentity } from './video-state.ts';
export const musicSubmissionKey=(projectId:string)=>`assembly:music-submission:${projectId}`;
/** Persist before dispatch. A changed provider default must not redirect an uncertain retry. */
export function prepareMusicSubmission(projectId:string,input:MusicInput,key?:()=>string) {
 const storageKey=musicSubmissionKey(projectId);
 const identity=submissionIdentity(decodeSubmission(readSession(storageKey)),{projectId,input},key);
 writeSession(storageKey,JSON.stringify(identity));return identity;
}
export function clearMusicSubmission(projectId:string,identity:{signature:string;key:string}):void {
 clearMatchingSession(musicSubmissionKey(projectId),JSON.stringify(identity));
}
