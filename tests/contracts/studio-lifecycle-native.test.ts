import {expect,test} from 'vitest';
import {nativeMediaBlockers} from '../../apps/server/src/studio/lifecycle-native.ts';
import type {GpuQueue,GpuCall} from '../../apps/server/src/jobs/gpu-queue-contract.ts';
const call=(id:string,projectId:string,state:GpuCall['state'])=>({id,projectId,state}) as GpuCall;
const queue=(calls:GpuCall[],held?:string)=>({list:()=>calls,heldLease:()=>held?{callId:held}:null}) as GpuQueue;
test('unresolved native calls block their known project, including queued work',()=>{
 expect(nativeMediaBlockers(queue([call('a','p','queued'),call('b','q','running')]),'p').map(b=>b.id)).toEqual(['a']);
});
test('held ownership overrides a terminal label; missing identity blocks globally',()=>{
 expect(nativeMediaBlockers(queue([call('a','p','failed')],'a'),'p')).toHaveLength(1);
 expect(nativeMediaBlockers(queue([],'lost'),'p')).toHaveLength(1);
 expect(nativeMediaBlockers(queue([call('a','p','failed')]),'p')).toEqual([]);
});
