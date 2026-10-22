// Harmless synthetic query: no GPU/network/tool calls or descendants.
// Parent supplies JSON, never evaluated code. All modes self-expire as failure.
const config = JSON.parse(process.argv[2]);
setTimeout(() => process.exit(97), 5000).unref();
if (config.ignoreTerm) process.on('SIGTERM', () => {});
if (config.hang) setInterval(() => {}, 100);
if (config.trickle) setInterval(() => process.stdout.write(' '), 10);
if (config.signal) setTimeout(() => process.kill(process.pid, config.signal), 10);
const send = () => {
  if (config.stdoutHex) process.stdout.write(Buffer.from(config.stdoutHex, 'hex'));
  else if (config.stdout) process.stdout.write(config.stdout);
  if (config.stderr) process.stderr.write(config.stderr);
  if (config.overflow) process.stdout.write('x'.repeat(config.overflow));
  if (!config.hang && !config.trickle && !config.signal) process.exitCode = config.exitCode ?? 0;
};
if (config.delayMs) setTimeout(send, config.delayMs);
else send();
