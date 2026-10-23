import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {expect,test} from 'vitest';
test('prompt references install independently and never re-download existing weights/documents',()=>{
 const script=fileURLToPath(new URL('../diagnostics/test_h3_prompt_guides.py',import.meta.url));
 const result=spawnSync('/usr/bin/python3',[script],{encoding:'utf8',timeout:15000,maxBuffer:1000000});
 expect(result.error).toBeUndefined();expect(result.status,result.stderr).toBe(0);expect(result.stderr).toContain('Ran 1 test');
});
