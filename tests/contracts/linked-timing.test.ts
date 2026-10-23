import { describe, expect, it } from 'vitest';
import type { StudioSong } from '../../packages/core/src/contracts/studio.ts';
import {
  displayTimingDuration, displayTimingValue, layoutIntervalLanes, parseTimingValue, resolveTiming, resolveTimingSeconds, selectBeatBoundary, timingFromFrames, timingValueFromSeconds,
  type ClipTimingIntent, type ResolvedTiming,
} from '../../packages/core/src/time/linked-timing.ts';

const song = (anchors = ['0', '24000', '48000'], count = '480000'): Pick<StudioSong, 'analysis' | 'sampleRate' | 'sampleCount'> => ({
  sampleRate: 48000, sampleCount: count,
  analysis: {state:'available', estimatedBpm:120, sampleIndices:anchors, waveformBucketSamples:0, peaks:[], error:null, version:'fixture'},
});
const seconds = (start:string,end:string):ClipTimingIntent => ({start:{unit:'seconds',value:start},end:{unit:'seconds',value:end}});
const r = (numerator:bigint,denominator=1n) => ({numerator,denominator});
function valid(result:ReturnType<typeof resolveTiming>):ResolvedTiming {
  expect(result.valid).toBe(true);
  if (!result.valid) throw new Error(result.error);
  return result;
}

describe('lossless linked timing intent',()=>{
  it('retains arbitrary decimal intent, containing labels and distinct realised boundaries',()=>{
    const result=valid(resolveTiming(song(),seconds('12.3456789','13')));
    expect(result).toMatchObject({startSeconds:r(123456789n,10000000n),endSeconds:r(13n),startFrame:296,endFrame:312,startContainingFrame:297,endContainingFrame:313,realisedStartSeconds:r(37n,3n),realisedEndSeconds:r(13n)});
    expect(result.display.start).toEqual({frames:'297',seconds:'12.3456789',beats:'25.6913578'});
  });
  it('maps direct one-based labels to frame starts, including the first excluded end frame',()=>{
    const intent=timingFromFrames(0,48);
    expect(intent).toEqual({start:{unit:'frames',value:'1'},end:{unit:'frames',value:'49'}});
    expect(valid(resolveTiming(song(),intent))).toMatchObject({startSeconds:r(0n),endSeconds:r(2n),startFrame:0,endFrame:48,endContainingFrame:49});
  });
  it('never adds a frame at an exact end boundary',()=>{
    expect(valid(resolveTiming(song(),seconds('0','12.5')))).toMatchObject({endFrame:300,endContainingFrame:301});
    expect(valid(resolveTiming(song(),seconds('0','12.3456789')))).toMatchObject({endFrame:297,endContainingFrame:297});
  });
  it('accepts a positive interval much shorter than a frame, even within one containing frame',()=>{
    const value=valid(resolveTiming(song(),seconds('0.00000000000000000000000001','0.00000000000000000000000002')));
    expect(value).toMatchObject({startFrame:0,endFrame:1,startContainingFrame:1,endContainingFrame:1,durationSeconds:r(1n,100000000000000000000000000n)});
  });
  it('preserves typed formatting and never reparses a derived repeating decimal',()=>{
    const result=valid(resolveTiming(song(),{start:{unit:'frames',value:'0002'},end:{unit:'seconds',value:'000.500000000000000000000000'}}));
    expect(result.display.start.frames).toBe('0002');
    expect(result.display.start.seconds).toBe('≈ 0.041666666666');
    expect(result.display.end.seconds).toBe('000.500000000000000000000000');
    let canonical=result;
    for(let i=0;i<100;i++) canonical=valid(resolveTimingSeconds(song(),canonical.startSeconds,canonical.endSeconds));
    expect(canonical.startSeconds).toEqual(r(1n,24n));
    expect(canonical.startFrame).toBe(1);
  });
  it('prints arbitrarily long derived terminating decimals without approximation',()=>{
    const result=valid(resolveTiming(song(),seconds('0.000000000000000000000001','1')));
    expect(result.display.start.beats).toBe('1.000000000000000000000002');
  });
  it('supports signed derived beats before beat one without allowing negative timeline time',()=>{
    const s=song(['96000','120000','144000']);
    const result=valid(resolveTiming(s,{start:{unit:'beats',value:'-2.5'},end:{unit:'beats',value:'+1.000'}}));
    expect(result).toMatchObject({startSeconds:r(1n,4n),endSeconds:r(2n),startFrame:6,endFrame:48});
    expect(result.display.start.beats).toBe('-2.5');
    expect(result.display.end.beats).toBe('+1.000');
    expect(resolveTiming(s,{start:{unit:'beats',value:'-4'},end:{unit:'beats',value:'1'}})).toMatchObject({valid:false,field:'start'});
  });
  it('uses irregular observed anchors rather than estimated BPM for fractional beats',()=>{
    const result=valid(resolveTiming(song(['24000','48000','120000']),{start:{unit:'beats',value:'2.5'},end:{unit:'beats',value:'4'}}));
    expect(result).toMatchObject({startSeconds:r(7n,4n),endSeconds:r(4n),startFrame:42,endFrame:96});
  });
  it('allows frames/seconds when analysis is missing and makes the beat field unavailable',()=>{
    const s=song([]);s.analysis.state='failed';s.analysis.estimatedBpm=null;
    const result=valid(resolveTiming(s,seconds('0','1')));
    expect(result.display.start.beats).toBeNull();
    expect(result.display.end.beats).toBeNull();
    expect(resolveTiming(s,{start:{unit:'beats',value:'1'},end:{unit:'seconds',value:'1'}})).toMatchObject({valid:false,field:'start'});
  });
  it('accepts JSON-safe exact seconds alongside typed units and normalizes without drift',()=>{
    const intent:ClipTimingIntent={start:{unit:'rational',value:{numerator:'2',denominator:'48'}},end:{unit:'seconds',value:'1.00'}};
    const result=valid(resolveTiming(song(),JSON.parse(JSON.stringify(intent))));
    expect(result).toMatchObject({startSeconds:r(1n,24n),startFrame:1,endFrame:24});
    expect(result.display.start.seconds).toBe('≈ 0.041666666666');
    expect(result.display.end.seconds).toBe('1.00');
  });
  it.each([{numerator:'-1',denominator:'24'},{numerator:'01',denominator:'24'},{numerator:'1',denominator:'0'},{numerator:'1',denominator:'-2'},{numerator:'1.5',denominator:'24'},{numerator:'1',denominator:' 24'}])('rejects malformed exact seconds %j',value=>{
    expect(resolveTiming(song(),{start:{unit:'rational',value},end:{unit:'seconds',value:'1'}})).toMatchObject({valid:false,field:'start'});
  });
  it('parses and links one endpoint independently of an inverted draft interval',()=>{
    const intent=seconds('2','1');
    expect(resolveTiming(song(),intent)).toMatchObject({valid:false,field:'range'});
    expect(parseTimingValue(song(),intent.start)).toEqual(r(2n));
    expect(displayTimingValue(song(),intent.start)).toEqual({frames:'49',seconds:'2',beats:'5'});
    expect(()=>displayTimingValue(song(),{unit:'seconds',value:'-'})).toThrow();
  });
  it('serializes a clicked repeating boundary exactly and preserves the untouched typed endpoint',()=>{
    const intent=seconds('0.000','2.0');
    const selected=selectBeatBoundary(song(['0','24000'],'50000'),intent,r(104n,100n));
    if(!selected.valid)throw new Error(selected.error);
    const changed={...intent,end:timingValueFromSeconds(selected.boundarySeconds)};
    expect(changed.end).toEqual({unit:'rational',value:{numerator:'25',denominator:'24'}});
    const restored=valid(resolveTiming(song(['0','24000'],'50000'),JSON.parse(JSON.stringify(changed))));
    expect(restored).toMatchObject({startFrame:0,endFrame:25,endSeconds:r(25n,24n)});
    expect(restored.display.start.seconds).toBe('0.000');
  });
  it('preserves exact adjacent safe-integer frame labels at the supported limit',()=>{
    const result=valid(resolveTiming(song(),{start:{unit:'frames',value:'9007199254740990'},end:{unit:'frames',value:'9007199254740991'}}));
    expect(result).toMatchObject({startFrame:9007199254740989,endFrame:9007199254740990,durationSeconds:r(1n,24n)});
  });
  it('derives a negative beat label for valid lead-in seconds',()=>{
    expect(displayTimingValue(song(['96000','120000']),{unit:'seconds',value:'0'})).toEqual({frames:'1',seconds:'0',beats:'-3'});
  });
  it.each(['','-','+','.','≈ 1.2','1e3','NaN','Infinity',' 1','1/24'])('rejects incomplete/nondecimal seconds %j',value=>{
    expect(resolveTiming(song(),seconds(value,'2'))).toMatchObject({valid:false,field:'start'});
  });
  it.each(['0','-1','1.5','9007199254740992'])('rejects invalid or unsafe containing frame label %s',value=>{
    expect(resolveTiming(song(),{start:{unit:'frames',value},end:{unit:'seconds',value:'2'}})).toMatchObject({valid:false,field:'start'});
  });
  it.each([['1','1'],['2','1'],['-0.01','1'],['999999999999999999999999999999999','9999999999999999999999999999999999']])('rejects negative/nonpositive/unsafe intervals %s..%s',(start,end)=>{
    expect(resolveTiming(song(),seconds(start,end)).valid).toBe(false);
  });
  it('rejects malformed exact rationals instead of approximating',()=>{
    expect(resolveTimingSeconds(song(),r(0n),r(1n,0n)).valid).toBe(false);
    expect(resolveTimingSeconds(song(),r(0n),r(-1n)).valid).toBe(false);
  });
  it('does not mutate caller input and rejects unsafe frame conversion',()=>{
    const intent=Object.freeze({start:Object.freeze({unit:'seconds' as const,value:'0'}),end:Object.freeze({unit:'seconds' as const,value:'1'})});
    valid(resolveTiming(song(),intent));expect(intent).toEqual(seconds('0','1'));
    expect(()=>timingFromFrames(0,Number.MAX_SAFE_INTEGER)).toThrow();
    expect(()=>timingFromFrames(2,2)).toThrow();
  });
});

describe('stable optimal interval lanes',()=>{
  it('shares adjacent spans, orders ties by start/end/id and keeps inputs untouched',()=>{
    const items=Object.freeze([
      Object.freeze({id:'c',startFrame:10,endFrame:20,kind:'draft'}),
      Object.freeze({id:'b',startFrame:0,endFrame:10,kind:'reserved'}),
      Object.freeze({id:'a',startFrame:0,endFrame:10,kind:'placed'}),
    ]);
    expect(layoutIntervalLanes(items)).toEqual({laneCount:2,items:[{...items[2],lane:0},{...items[1],lane:1},{...items[0],lane:0}]});
    expect(items.map(i=>i.id)).toEqual(['c','b','a']);
    expect(layoutIntervalLanes([...items].reverse())).toEqual(layoutIntervalLanes(items));
  });
  it('reuses the lowest free row and reaches exactly maximum concurrent interval count',()=>{
    const items=Array.from({length:80},(_,i)=>({id:String(i).padStart(3,'0'),startFrame:(i*17)%101,endFrame:(i*17)%101+1+(i*13)%29}));
    const result=layoutIntervalLanes(items);
    const events=items.flatMap(p=>[{time:p.startFrame,delta:1},{time:p.endFrame,delta:-1}]).sort((a,b)=>a.time-b.time||a.delta-b.delta);
    let active=0,maximum=0;for(const event of events){active+=event.delta;maximum=Math.max(maximum,active);}
    expect(result.laneCount).toBe(maximum);
    for(let lane=0;lane<result.laneCount;lane++){
      const row=result.items.filter(p=>p.lane===lane);
      for(let i=1;i<row.length;i++) expect(row[i]!.startFrame).toBeGreaterThanOrEqual(row[i-1]!.endFrame);
    }
  });
  it('handles empty input and rejects duplicate identities or invalid spans',()=>{
    expect(layoutIntervalLanes([])).toEqual({laneCount:0,items:[]});
    expect(()=>layoutIntervalLanes([{id:'a',startFrame:0,endFrame:1},{id:'a',startFrame:1,endFrame:2}])).toThrow();
    expect(()=>layoutIntervalLanes([{id:'a',startFrame:1,endFrame:1}])).toThrow();
    expect(()=>layoutIntervalLanes([{id:'a',startFrame:0.5,endFrame:2}])).toThrow();
  });
});

describe('beat boundary clicking',()=>{
  it.each(['1',''])('repairs the selected end of an inverted or incomplete draft (%j)',end=>{
    const intent=seconds('2.00',end);
    const selected=selectBeatBoundary(song(['0','48000','144000']),intent,r(3n));
    expect(selected).toMatchObject({valid:true,target:'end',boundarySeconds:r(3n),timing:{startSeconds:r(2n),endSeconds:r(3n),startFrame:48,endFrame:72}});
    if(selected.valid)expect(selected.timing.display.start.seconds).toBe('2.00');
    expect(intent).toEqual(seconds('2.00',end));
  });
  it('repairs a malformed selected start but still explains an invalid untouched endpoint',()=>{
    const selected=selectBeatBoundary(song(),seconds('-','2.000'),r(0n),'start');
    expect(selected).toMatchObject({valid:true,target:'start',timing:{startSeconds:r(0n),endSeconds:r(2n)}});
    if(selected.valid)expect(selected.timing.display.end.seconds).toBe('2.000');
    expect(selectBeatBoundary(song(),seconds('','2'),r(3n),'end')).toMatchObject({valid:false,field:'start'});
    expect(selectBeatBoundary(song(),seconds('1',''),r(0n),'start')).toMatchObject({valid:false,field:'end'});
  });
  it('defaults to end and chooses actual irregular anchors rather than a BPM grid',()=>{
    const selected=selectBeatBoundary(song(['24000','48000','120000']),seconds('0','4'),r(19n,10n));
    expect(selected).toMatchObject({valid:true,target:'end',boundarySeconds:r(5n,2n),timing:{startFrame:0,endFrame:60}});
  });
  it('includes zero and chooses the earlier boundary for exact ties',()=>{
    const selected=selectBeatBoundary(song(['24000','48000']),seconds('0.5','4'),r(1n,4n),'start');
    expect(selected).toMatchObject({valid:true,boundarySeconds:r(0n),timing:{startFrame:0,endFrame:96}});
  });
  it('retains a nondecimal song-end boundary exactly without a display round trip',()=>{
    const selected=selectBeatBoundary(song(['0','24000'],'50001'),seconds('0','2'),r(104n,100n));
    expect(selected).toMatchObject({valid:true,boundarySeconds:r(16667n,16000n),timing:{endFrame:26}});
    const repeating=selectBeatBoundary(song(['0','24000'],'50000'),seconds('0','2'),r(104n,100n));
    expect(repeating).toMatchObject({valid:true,boundarySeconds:r(25n,24n),timing:{endFrame:25,endContainingFrame:26}});
    if(repeating.valid)expect(repeating.timing.display.end.seconds).toBe('≈ 1.041666666666');
  });
  it('extrapolates integer beat boundaries after song end using the final actual interval',()=>{
    const selected=selectBeatBoundary(song(['0','24000','96000'],'120000'),seconds('0','1'),r(52n,10n));
    expect(selected).toMatchObject({valid:true,boundarySeconds:r(5n),timing:{endFrame:120}});
  });
  it('does not invent missing pre-end beat anchors from estimated BPM',()=>{
    const selected=selectBeatBoundary(song(['0','24000'],'480000'),seconds('0','2'),r(4n));
    expect(selected).toMatchObject({valid:true,boundarySeconds:r(1n,2n)});
  });
  it('rejects an inverted selection without silently swapping or changing input',()=>{
    const intent=seconds('1','2');const before=structuredClone(intent);
    expect(selectBeatBoundary(song(),intent,r(0n))).toMatchObject({valid:false,field:'range'});
    expect(intent).toEqual(before);
    expect(selectBeatBoundary(song(['0','48000','144000']),intent,r(3n),'start')).toMatchObject({valid:false,field:'range'});
  });
  it('can repeatedly adjust canonical click output without losing a frame',()=>{
    const selected=selectBeatBoundary(song(['0','24000'],'50000'),seconds('0','2'),r(104n,100n));
    if(!selected.valid)throw new Error(selected.error);
    let current=selected.timing;
    for(let i=0;i<100;i++){
      const next=selectBeatBoundary(song(['0','24000'],'50000'),current,r(0n),'start');
      if(!next.valid)throw new Error(next.error);current=next.timing;
    }
    expect(current.endSeconds).toEqual(r(25n,24n));expect(current.endFrame).toBe(25);
  });
});

describe('generation duration display',()=>{
 it('counts outward-rounded frames, not the difference of containing labels',()=>{
  const s=song();expect(displayTimingDuration(s,resolveTiming(s,seconds('0.01','0.02')))).toEqual({frames:'1',seconds:'0.01',beats:'0.02'});
 });
 it('subtracts exact arbitrary decimals before formatting',()=>{
  const s=song();expect(displayTimingDuration(s,resolveTiming(s,seconds('1.000000000000000001','1.123456789012345679')))).toEqual({frames:'3',seconds:'0.123456789012345678',beats:'0.246913578024691356'});
 });
 it('marks repeating duration without reparsing rounded endpoints',()=>{
  const s=song();expect(displayTimingDuration(s,resolveTiming(s,timingFromFrames(1,2)))).toEqual({frames:'1',seconds:'≈ 0.041666666666',beats:'≈ 0.083333333333'});
 });
 it('measures beats over irregular anchors rather than multiplying estimated BPM',()=>{
  const s=song(['24000','48000','120000']);expect(displayTimingDuration(s,resolveTiming(s,seconds('0.75','1.75')))).toEqual({frames:'24',seconds:'1',beats:'1'});
 });
 it('keeps frame and second durations without beat analysis',()=>{
  const s=song([]);expect(displayTimingDuration(s,resolveTiming(s,seconds('0','1')))).toEqual({frames:'24',seconds:'1',beats:null});
 });
 it('does not manufacture a duration for incomplete or inverted input',()=>{
  const s=song();for(const intent of [seconds('','1'),seconds('2','1')])expect(displayTimingDuration(s,resolveTiming(s,intent))).toBeNull();
 });
});
