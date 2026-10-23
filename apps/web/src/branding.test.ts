import {expect,test} from 'vitest';
import {readFileSync,readdirSync} from 'node:fs';
const read=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');

test('Cutwork is the browser and project identity with a matching vector favicon',()=>{
 const html=read('../index.html');
 expect(html).toContain('<title>Cutwork — Music video studio</title>');
 expect(html).toMatch(/rel="icon"[^>]*href="\/cutwork-mark.svg"/);
 expect(JSON.parse(read('../../../package.json')).name).toBe('cutwork');
 const lock=JSON.parse(read('../../../package-lock.json'));expect(lock.name).toBe('cutwork');expect(lock.packages[''].name).toBe('cutwork');
});

test('the original clapperboard mark is self-contained vector art, not an external asset',()=>{
 const svg=read('../public/cutwork-mark.svg');
 expect(svg).toContain('viewBox="0 0 64 64"');expect(svg).toContain('Cutwork');
 expect(svg).toContain('<pattern');expect(svg).toContain('hazard');expect(svg).toContain('<rect');
 expect(svg).not.toMatch(/<(?:script|image|foreignObject)|https?:\/\/(?!www\.w3\.org\/2000\/svg)/);
});

test('application actions use button treatments rather than underlined link styling',()=>{
 const root=new URL('.',import.meta.url);
 for(const file of readdirSync(root).filter(name=>name.endsWith('.tsx'))){
  expect(read(`./${file}`),file).not.toMatch(/className="text-button(?:\s|")/);
 }
 for(const file of ['ArtifactControls.tsx','ClipComposer.tsx','LivePreview.tsx'])expect(read(`./${file}`)).toContain('className="button secondary small');
});
