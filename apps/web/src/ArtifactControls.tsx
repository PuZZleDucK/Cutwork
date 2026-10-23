import {useEffect,useRef,useState} from 'react';
import type {ArtifactDeletePlan,ArtifactRef,PurgeRecord} from '../../../packages/core/src/contracts/lifecycle.ts';
import type {ClipEditContext} from '../../../packages/core/src/contracts/studio.ts';
import type {useStudio} from './useStudio.ts';
import {request} from './api.ts';
import {activeArtifacts,artifactLifecycle,artifactState,beginDeletionSubmission,deletionDefinitelyRejected,forgetDeletionSubmission,readDeletionSubmission} from './artifact-lifecycle.ts';
import './artifact-lifecycle.css';
type Studio=ReturnType<typeof useStudio>;
export function restoreDeletionTriggerFocus(trigger:Pick<HTMLButtonElement,'disabled'|'isConnected'|'focus'>|null):boolean {
 if(!trigger?.isConnected||trigger.disabled)return false;
 trigger.focus({preventScroll:true});return true;
}
const asset=(id:string)=>`/api/assets/${encodeURIComponent(id)}`;
const path=(projectId:string,ref:ArtifactRef)=>`/api/projects/${encodeURIComponent(projectId)}/artifacts/${ref.kind}/${encodeURIComponent(ref.id)}`;
export function DeletionDisclosure({plan}:{plan:ArtifactDeletePlan}) {
 return <><p className="deletion-warning"><strong>Delete “{plan.title}” permanently?</strong> The full media cannot be recovered through this product.</p>
  <p>{plan.ref.kind==='clip'?'All of this clip’s timeline placements will also be removed. Uncovered time will use black frames and the song soundtrack.':'This song will be deselected and its saved arrangement removed. Separate generated clips remain in the project; their audio can still contain music from this song.'}</p>
  <p>{plan.fileCount} known managed-media files ({new Intl.NumberFormat().format(plan.bytes)} bytes) are in this deletion plan. Full media stays unavailable while the durable purge finishes; a purge error is not a completed deletion.</p>
  <h4>Retained in history</h4><ul>{plan.retains.map((value,i)=><li key={i}>{value}</li>)}</ul><p>A separate deletion event is added. This does not erase the generation record, thumbnail or text logs.</p>
  <h4>Deletion boundary</h4><ul>{plan.limitations.map((value,i)=><li key={i}>{value}</li>)}</ul>
  {!!plan.blockers.length&&<section aria-label="Work blocking deletion"><h4>Finish or cancel dependent work first</h4><ul>{plan.blockers.map((blocker,i)=><li key={`${blocker.kind}:${blocker.id}:${i}`}><strong>{blocker.kind} / {blocker.id}</strong> · {blocker.state}<br/>{blocker.detail}</li>)}</ul><p>Deletion cannot be accepted while this work depends on the media. Archive remains reversible and does not cancel work.</p></section>}
 </>;
}
export function ArtifactControls({studio,refValue,title}:{studio:Studio;refValue:ArtifactRef;title:string}) {
 const snapshot=studio.snapshot!,projectId=snapshot.project.id,lifecycle=artifactLifecycle(snapshot,refValue),state=artifactState(snapshot,refValue);
 const [plan,setPlan]=useState<ArtifactDeletePlan|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[uncertain,setUncertain]=useState(false),[now,setNow]=useState(Date.now);
 const dialog=useRef<HTMLDialogElement>(null),deleteTrigger=useRef<HTMLButtonElement>(null),returnFocus=useRef(false),flight=useRef(false),mounted=useRef(true);
 const purge=snapshot.deletions?.find(row=>row.projectId===projectId&&row.artifact.kind===refValue.kind&&row.artifact.id===refValue.id);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{if(!plan)return;dialog.current?.showModal();const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[plan?.id]);
 // Async preparation disables the trigger before showModal, so native dialog
 // focus restoration may target BODY. Restore after React removes the dialog
 // and the original trigger is enabled, without moving the page.
 useEffect(()=>{if(!plan&&returnFocus.current&&!busy&&!studio.busy&&restoreDeletionTriggerFocus(deleteTrigger.current))returnFocus.current=false;},[plan,busy,studio.busy,state]);
 const execute=async(work:()=>Promise<void>)=>{if(flight.current)return;flight.current=true;setBusy(true);setError(null);try{await work();}catch(error){if(mounted.current)setError(error instanceof Error?error.message:'The lifecycle action failed.');}finally{flight.current=false;if(mounted.current)setBusy(false);}};
 const prepare=()=>execute(async()=>{
  const pending=readDeletionSubmission(projectId,refValue);
  const next=pending?.plan??await request<ArtifactDeletePlan>(`${path(projectId,refValue)}/delete-plan`,{});
  if(mounted.current){setPlan(next);setUncertain(!!pending);setNow(Date.now());}
 });
 const close=()=>{if(busy)return;returnFocus.current=true;dialog.current?.close();setPlan(null);setError(null);};
 const confirm=()=>execute(async()=>{
  if(!plan||plan.blockers.length)throw new Error('Dependent work must finish or be cancelled before deletion.');
  const pending=readDeletionSubmission(projectId,refValue);
  if(!pending&&Date.parse(plan.expiresAt)<=Date.now())throw new Error('This deletion plan expired. Close it and review a fresh plan.');
  const submission=beginDeletionSubmission(plan);setUncertain(true);
  try{
   const accepted=await request<PurgeRecord>(`${path(projectId,refValue)}/delete`,{planId:submission.plan.id,digest:submission.plan.digest,idempotencyKey:submission.key});
   studio.acceptDeletion(accepted);forgetDeletionSubmission(submission);
   if(mounted.current){dialog.current?.close();setPlan(null);setUncertain(false);}
   await studio.refresh().catch(()=>{});
  }catch(error){if(deletionDefinitelyRejected(error)){forgetDeletionSubmission(submission);if(mounted.current)setUncertain(false);}throw error;}
 });
 const change=(action:'archive'|'restore')=>studio.perform(async()=>{await request(`${path(projectId,refValue)}/${action}`,{revision:lifecycle?.revision??0});},action==='archive'?(refValue.kind==='clip'?'Clip archived and removed from every sequence.':'Song archived without selecting a replacement; its saved arrangement is retained.'):(refValue.kind==='clip'?'Clip restored to the library, unplaced. Existing clips and coverage are unchanged.':'Song restored, unselected. Select it explicitly to reopen its arrangement.'));
 return <div className={`artifact-controls artifact-${state}`} aria-label={`Media lifecycle: ${title}`}>
  {state==='active'&&<div className="row-actions"><button type="button" className="button secondary small" disabled={studio.busy||busy} onClick={()=>void change('archive')}>Archive</button><button ref={deleteTrigger} type="button" className="text-button destructive-text" disabled={studio.busy||busy} onClick={()=>void prepare()}>Delete permanently…</button></div>}
  {state==='archived'&&<><p className="small-copy muted">{refValue.kind==='clip'?'Archived. Restoration returns it unplaced; no sequence is changed.':'Archived. Its saved arrangement remains; restoration does not select the song.'}</p><div className="row-actions"><button type="button" className="button secondary small" disabled={studio.busy||busy} onClick={()=>void change('restore')}>{refValue.kind==='clip'?'Restore to library':'Restore song'}</button><button ref={deleteTrigger} type="button" className="text-button destructive-text" disabled={studio.busy||busy} onClick={()=>void prepare()}>Delete permanently…</button></div></>}
  {state==='deleting'&&<div className="purge-status" role="status"><strong>{purge?.state==='failed'?'Media purge needs attention':'Removing full media…'}</strong><p>Media is unavailable; no Restore is offered for a partially purged artifact.</p>{purge&&<><p>{purge.completedEntryIds.length} / {purge.inventory.entries.length} managed paths checked</p>{purge.error&&<p className="error-copy">{purge.error}</p>}{purge.state==='failed'&&<button type="button" className="button secondary small" disabled={studio.busy||busy} onClick={()=>void studio.performImmediate(async()=>{const next=await request<PurgeRecord>(`/api/projects/${projectId}/deletions/${purge.id}/retry`,{});studio.acceptDeletion(next);},'Retrying the same durable media purge; no generation will run.')}>Retry media purge</button>}</>}</div>}
  {state==='deleted'&&<p className="small-copy muted">Full media deleted. Generation history, retained thumbnail and text remain; there is no media recovery.</p>}
  {error&&!plan&&<p className="error-copy" role="alert">{error}</p>}
  {plan&&<dialog className="artifact-delete-dialog" ref={dialog} aria-labelledby={`delete-title-${refValue.id}`} onCancel={event=>{event.preventDefault();close();}}><header><span className="eyebrow">IRREVERSIBLE MEDIA DELETION</span><h2 id={`delete-title-${refValue.id}`}>{plan.title}</h2></header><DeletionDisclosure plan={plan}/>
   {uncertain&&<p className="deletion-warning" role="status">A confirmation was sent. A lost response does not mean it failed. Closing does not cancel accepted deletion. Rechecking uses the same recorded confirmation and never creates a new deletion request.</p>}
   {error&&<p className="error-copy" role="alert">{error}</p>}
   {!uncertain&&Date.parse(plan.expiresAt)<=now&&<p className="warning">This plan has expired. Close it and review a fresh plan before deleting.</p>}
   <div className="row-actions delete-dialog-actions"><button type="button" className="button secondary" autoFocus disabled={busy} onClick={close}>{uncertain?'Close — keep checking status':'Cancel — keep media'}</button>{!plan.blockers.length&&<button type="button" className="button danger" disabled={busy||(!uncertain&&Date.parse(plan.expiresAt)<=now)||state==='deleting'||state==='deleted'} onClick={()=>void confirm()}>{uncertain?'Check / retry same confirmation':'Delete permanently'}</button>}</div>
  </dialog>}
 </div>;
}
export function ArchivedMedia({studio}:{studio:Studio}) {
 const snapshot=studio.snapshot!;
 const rows=[...snapshot.songs.map(song=>({ref:{kind:'song' as const,id:song.id},title:song.title})),...snapshot.clips.map(clip=>({ref:{kind:'clip' as const,id:clip.id},title:clip.title}))].filter(row=>artifactState(snapshot,row.ref)!=='active');
 return <section className="artifact-archive" aria-label="Archived and removed media"><div className="video-section-heading"><div><span className="section-code">MEDIA / LIFECYCLE</span><h2>Archive & removed media.</h2></div><span className="micro">{rows.length} RECORDS</span></div>
  <p className="small-copy muted">Archive keeps media for later. Restored clips return unplaced; restored songs return unselected. Permanent deletion keeps lightweight provenance, not recoverable media.</p>
  {!rows.length?<p className="small-copy muted">No archived or removed media in this project.</p>:<div className="archive-list">{rows.map(row=>{const lifecycle=artifactLifecycle(snapshot,row.ref);return <article key={`${row.ref.kind}:${row.ref.id}`} className="archive-item"><div className="archive-heading">{lifecycle?.thumbnailAssetId&&<img src={asset(lifecycle.thumbnailAssetId)} alt="Retained generation thumbnail" loading="lazy"/>}<div><span className="micro">{row.ref.kind.toUpperCase()} / {artifactState(snapshot,row.ref).toUpperCase()}</span><h3>{row.title}</h3></div></div><ArtifactControls studio={studio} refValue={row.ref} title={row.title}/></article>;})}</div>}
 </section>;
}
export function RetargetClipContext({studio,context}:{studio:Studio;context:ClipEditContext}) {
 const [songId,setSongId]=useState(''),songs=activeArtifacts(studio.snapshot!,'song',studio.snapshot!.songs);
 return <div className="retarget-context"><p className="warning">This edit’s song is unavailable. Choose a replacement explicitly; the original generation association stays in history.</p><label htmlFor={`retarget-${context.id}`}>Choose a replacement song</label><select id={`retarget-${context.id}`} value={songId} disabled={studio.busy||!!context.placementId} onChange={event=>setSongId(event.target.value)}><option value="">Choose a replacement song…</option>{songs.map(song=><option key={song.id} value={song.id}>{song.title}</option>)}</select><button type="button" className="button secondary small" disabled={studio.busy||!!context.placementId||!songs.some(song=>song.id===songId)} onClick={()=>void studio.perform(async()=>{await request(`/api/projects/${context.projectId}/edit-contexts/${context.id}/retarget-song`,{revision:context.revision,songId});},'Edit retargeted to the chosen song, unplaced. Its trim and timing are retained; no generation started.')}>Use chosen song</button><p className="small-copy muted">Remains unplaced. Trim, original timing and audio choice are kept; select that song to edit or continue this clip.</p></div>;
}
