/** Owned Comfy launch/receipt contracts run the real helper with explicit Python
 * mocks. No network, providers, Comfy process, model load or GPU execution. */
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {expect,test} from 'vitest';
const fixture=fileURLToPath(new URL('../diagnostics/test_h3_polling.py',import.meta.url));
test.each([
 'test_gpu_owned_launch_and_receipt_capture_conservative_host_memory_flags',
 'test_explicit_cpu_fixture_keeps_same_owned_memory_policy_without_model_loading',
])('owned H3 memory policy: %s',name=>{
 const result=spawnSync('/usr/bin/python3',[fixture,`PollingTest.${name}`],{encoding:'utf8',timeout:15000,maxBuffer:1000000});
 expect(result.error).toBeUndefined();expect(result.signal).toBeNull();
 expect(result.status,result.stderr).toBe(0);expect(result.stderr).toMatch(/Ran 1 test/);
});
