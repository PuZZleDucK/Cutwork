import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
export async function fixtureH3Guides(runtime:string,source:string){
 const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
 const revision='a'.repeat(40),directory=join(runtime,'references/h3/MiniMax-H3',revision);
 const names=['docs/VIDEO_PROMPT_WRITING_GUIDE_base_en.md','docs/VIDEO_PROMPT_WRITING_GUIDE_ref_en.md','LICENSE'];
 const files=names.map(path=>{const text=`Complete fixture upstream ${path}\nBEGIN\nMIDDLE\nEND\n`;return{path,text,bytes:Buffer.byteLength(text),sha256:hash(text)};});
 const manifest=JSON.stringify({schemaVersion:1,models:[{repository:'MiniMaxAI/MiniMax-H3',revision,files:files.map(({text:_text,...f})=>f)}]});
 await mkdir(join(source,'integrations/h3'),{recursive:true});await writeFile(join(source,'integrations/h3/prompt-guides.json'),manifest);
 for(const file of files){await mkdir(join(directory,file.path,'..'),{recursive:true});await writeFile(join(directory,file.path),file.text);}
 await writeFile(join(directory,'.studio-model-manifest'),hash(manifest)+'\n');
 return{directory,files};
}
