import type {FastifyInstance} from 'fastify';
import type {StudioStore} from './store-contract.ts';
import type {LifecycleManager,DeleteConfirmation} from './lifecycle-manager.ts';
import type {ArtifactRef} from '../../../../packages/core/src/contracts/lifecycle.ts';
import {StudioStoreError} from './store.ts';
const uuid={type:'string',pattern:'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'};
const revision={type:'integer',minimum:0,maximum:Number.MAX_SAFE_INTEGER};
const plain=(properties:Record<string,unknown>)=>({type:'object',additionalProperties:false,required:Object.keys(properties),properties});
const empty=plain({});
interface Params{id:string;kind:ArtifactRef['kind'];artifactId:string}
const params=plain({id:uuid,kind:{type:'string',enum:['song','clip']},artifactId:uuid});
const ref=(p:Params):ArtifactRef=>({kind:p.kind,id:p.artifactId.toLowerCase()});
export function registerLifecycleRoutes(api:FastifyInstance,store:StudioStore,lifecycle:LifecycleManager):void {
 for(const action of ['archive','restore'] as const)api.post<{Params:Params;Body:{revision:number}}>(`/api/projects/:id/artifacts/:kind/:artifactId/${action}`,
  {schema:{params,body:plain({revision}),querystring:empty}},request=>store[action==='archive'?'archiveArtifact':'restoreArtifact'](request.params.id,ref(request.params),request.body.revision));
 api.post<{Params:Params}>('/api/projects/:id/artifacts/:kind/:artifactId/delete-plan',{schema:{params,body:empty,querystring:empty}},async(request,reply)=>{
  store.lifecycle(request.params.id,ref(request.params));return reply.code(201).send(await lifecycle.prepareDelete(request.params.id.toLowerCase(),ref(request.params)));
 });
 api.post<{Params:Params;Body:DeleteConfirmation}>('/api/projects/:id/artifacts/:kind/:artifactId/delete',
  {schema:{params,body:plain({planId:uuid,digest:{type:'string',pattern:'^[a-f0-9]{64}$'},idempotencyKey:uuid}),querystring:empty}},async(request,reply)=>{
   store.lifecycle(request.params.id,ref(request.params));return reply.code(202).send(await lifecycle.confirmDelete(request.params.id.toLowerCase(),ref(request.params),request.body));
  });
 api.post<{Params:{id:string;deletionId:string}}>('/api/projects/:id/deletions/:deletionId/retry',
  {schema:{params:plain({id:uuid,deletionId:uuid}),body:empty,querystring:empty}},async(request,reply)=>{
   const deletion=store.deletion(request.params.deletionId);if(!deletion||deletion.projectId!==request.params.id.toLowerCase())throw new StudioStoreError(404,'STUDIO_NOT_FOUND','Deletion not found in this project');
   return reply.code(202).send(await lifecycle.retryPurge(request.params.id.toLowerCase(),request.params.deletionId));
  });
 api.post<{Params:{id:string;contextId:string};Body:{revision:number;songId:string}}>('/api/projects/:id/edit-contexts/:contextId/retarget-song',
  {schema:{params:plain({id:uuid,contextId:uuid}),body:plain({revision,songId:uuid}),querystring:empty}},request=>store.retargetClipContext(request.params.id,request.params.contextId,request.body.revision,request.body.songId));
}
