import { expect,it } from 'vitest';
import { draftWriter, draftResolutionGuard } from './clip-draft-ownership.ts';
it('an old mount can finish recovery writes until a successor owns that same song',()=>{
 const a=draftWriter('a');a.claim();expect(a.isCurrent()).toBe(true);
 const b=draftWriter('b');b.claim();expect(a.isCurrent()).toBe(true);expect(b.isCurrent()).toBe(true);
 const nextA=draftWriter('a');nextA.claim();expect(a.isCurrent()).toBe(false);expect(nextA.isCurrent()).toBe(true);
});
it('a recovery response cannot discard typing or a later resolution',()=>{
 const guard=draftResolutionGuard();const first=guard.begin();expect(guard.isCurrent(first)).toBe(true);
 guard.edited();expect(guard.isCurrent(first)).toBe(false);
 const second=guard.begin();expect(guard.isCurrent(second)).toBe(true);
 const third=guard.begin();expect(guard.isCurrent(second)).toBe(false);expect(guard.isCurrent(third)).toBe(true);
});

it('discarded render initializers cannot steal ownership; committed effect replay is idempotent',()=>{
 const actual=draftWriter('strict');const discarded=draftWriter('strict');actual.claim();
 expect(actual.isCurrent()).toBe(true);expect(discarded.isCurrent()).toBe(false);
 actual.claim();expect(actual.isCurrent()).toBe(true);draftWriter('strict');expect(actual.isCurrent()).toBe(true);
});
it('preparation can replace only the writer generation observed before its request',()=>{
 const old=draftWriter('prepare');old.claim();const pending=draftWriter('prepare');
 const successor=draftWriter('prepare');successor.claim();
 expect(pending.claimIfUnchanged()).toBe(false);expect(successor.isCurrent()).toBe(true);
 const next=draftWriter('prepare');expect(next.claimIfUnchanged()).toBe(true);expect(next.isCurrent()).toBe(true);expect(successor.isCurrent()).toBe(false);
});
