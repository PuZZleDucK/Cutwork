import { expect, it } from 'vitest';
import { resolveMoveEdit } from '../../apps/web/src/clip-edit-state.ts';
import { displayTimingValue, timingValueFromSeconds } from '../../packages/core/src/time/linked-timing.ts';
const song={sampleRate:48000,sampleCount:'4800000',analysis:{state:'available' as const,estimatedBpm:60,sampleIndices:['0','48000','96000'],waveformBucketSamples:4800,peaks:[],error:null,version:'synthetic-review'}};
const context={sourceOriginFrame:0,sourceStartFrame:0,sourceEndFrame:80,trimIntent:null,placementIntent:null,songId:'song'};
it('does not approve a move whose linked computed end cannot be displayed without crashing',()=>{
 const moved=resolveMoveEdit(song,context,{unit:'frames',value:'9007199254740912'});
 // Rejecting the unsupported range is valid; approving it must keep linked UI derivation safe.
 if(moved.valid)expect(()=>displayTimingValue(song,timingValueFromSeconds({numerator:BigInt(moved.endFrame),denominator:24n}))).not.toThrow();
});
