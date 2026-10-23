import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {expect,test} from 'vitest';
const read=(path:string)=>readFileSync(path,'utf8');
test('notices distinguish source/code/weights/outputs/codec and preserve pinned upstream identities',()=>{
 const notice=read('THIRD_PARTY_NOTICES.md');
 for(const phrase of ['Application source','Model weights and outputs','Provider CLIs','Python / GPU','FFmpeg','Kirsty','not legal advice','CC BY-NC 4.0','Applicable Territory','unknown external','MIT','full licence text'])expect(notice).toContain(phrase);
 for(const path of ['integrations/h3/models.json','integrations/yue2/models.json'])for(const model of JSON.parse(read(path)).models){expect(notice).toContain(model.repository);expect(notice).toContain(model.revision);}
 const manifest=JSON.parse(read('integrations/tool-manifest.json'));for(const provider of Object.values(manifest.providers) as {package:string;version:string}[])expect(notice).toContain(`${provider.package}@${provider.version}`);
 expect(notice).toContain('No blanket claim');expect(notice).toContain('not an exemption');
});
test('notices inventory includes every locked npm distribution and Python name/version without a network lookup',()=>{
 const notice=read('THIRD_PARTY_NOTICES.md');
 for(const path of ['package-lock.json','integrations/provider-cli/package-lock.json'])for(const [key,value] of Object.entries(JSON.parse(read(path)).packages) as [string,{version?:string}][]){if(!key)continue;const name=key.split('node_modules/').at(-1);expect(notice,`${path}: ${name}`).toContain(`${name}@${value.version}`);}
 for(const kind of ['comfyui','yue2','analysis'])for(const line of read(`integrations/${kind}/requirements.lock`).split('\n')){const match=/^([a-zA-Z0-9-]+)==([^ \\]+)/.exec(line);if(match)expect(notice,`${kind}: ${match[1]}`).toContain(`${match[1]}@${match[2]}`);}
});
test('client bundle includes complete original React family notices independently of npm development installs',()=>{
 const browser=read('apps/web/public/THIRD_PARTY_NOTICES.txt');
 for(const packageName of ['react','react-dom','scheduler']){const license=read(`node_modules/${packageName}/LICENSE`).trim();expect(browser).toContain(license);expect(browser).toContain(packageName);}
 expect(browser).toContain('MIT License');expect(browser).toContain('Meta Platforms');
});
test('retained upstream licence texts have explicit source and byte hashes, rather than treating package SPDX labels as clearance',()=>{
 const sources=JSON.parse(read('integrations/licenses/sources.json')) as {path:string;url:string;sha256:string}[];
 expect(sources.length).toBeGreaterThanOrEqual(5);
 for(const source of sources){expect(source.url).toMatch(/^https:\/\//);expect(createHash('sha256').update(readFileSync(source.path)).digest('hex')).toBe(source.sha256);}
});
test('historical Kirsty is bundled byte-for-byte with its author licence and scoped to headings',()=>{
 const font=readFileSync('apps/web/public/fonts/kirsty__.ttf');
 expect(createHash('sha256').update(font).digest('hex')).toBe('f879b17aa6787ea4546aff3298a1ece251dfd733b7cbaac490f30cd823a44496');
 const provenance=JSON.parse(read('apps/web/public/fonts/provenance.json')) as {sha256:string;source:string;packageSha256:string;originalPath:string;modified:boolean};
 expect(provenance.sha256).toBe(createHash('sha256').update(font).digest('hex'));expect(provenance.source).toBe('https://archive.ubuntu.com/ubuntu/pool/multiverse/f/fonts-larabie/fonts-larabie-straight_20011216-6_all.deb');expect(provenance.packageSha256).toMatch(/^[a-f0-9]{64}$/);expect(provenance.originalPath).toBe('usr/share/fonts/truetype/larabie/kirsty__.ttf');expect(provenance.modified).toBe(false);
 const license=read('apps/web/public/fonts/READ_ME.TXT');expect(license).toContain('in any medium');expect(license).toContain('give any other  recipients of the');expect(read('apps/web/public/fonts/copyright')).toContain('Ray Larabie');
 const css=read('apps/web/src/styles.css');expect(css).toMatch(/@font-face\s*\{[^}]*font-family:\s*["']?Kirsty["']?;[^}]*url\(["']?\/fonts\/kirsty__\.ttf["']?\)[^}]*font-display:\s*swap/s);
 expect(css).toMatch(/h1,h2,h3\{font-family:var\(--title\)/);expect(css.match(/:root\{font-family:([^;]+)/)?.[1]).not.toContain('Kirsty');
 expect(css).not.toMatch(/(?:body|button|input|textarea|p)\s*\{[^}]*font-family:\s*(?:Kirsty|var\(--title\))/);
});
