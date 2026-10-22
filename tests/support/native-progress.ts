/** Proof helper, not production job state. H3 additionally requires a fresh
 * matching running-prompt observation from the owned native queue at the callsite. */
export function activeNativeProgress(tool: 'yue2' | 'h3', log: string,
  receipt: { state?: string; calls?: Array<{ stage: string; state: string }> }): { active: boolean; line: string | null } {
  const lines = log.split(/[\r\n]/).map(line => line.trim()).filter(Boolean);
  if (tool === 'yue2') {
    const line = lines.filter(line => line.includes('Generating song:')).at(-1) ?? null;
    const stage = receipt.calls?.at(-1);
    return { active: receipt.state === 'running' && stage?.stage === 'semantic' && stage.state === 'running' &&
      !!line && /\[YuE2\] Running Generating song: [1-9]\d* tokens/.test(line), line };
  }
  const line = lines.filter(line => /\b\d+\/20\s+\[|Prompt executed|Processing interrupted|Error occurred when executing/.test(line)).at(-1) ?? null;
  const step = line?.match(/\b(\d+)\/20\s+\[/);
  return { active: receipt.state === 'running' && !!step && Number(step[1]) > 0 && Number(step[1]) < 20, line };
}
