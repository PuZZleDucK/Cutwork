// Synthetic loopback wire fixture only. No Comfy code, model, GPU or scheduler.
// It lives in a separate PID so tests cannot confuse client and server ownership.
import { createServer } from 'node:http';

if (!process.send) throw new Error('Launch only as an IPC child fixture');
const promptId = process.argv[2];
let bytes = 0, requests = 0;
const sockets = new Set();
const server = createServer((request, response) => {
  requests++;
  request.resume();
  request.on('end', () => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(request.method === 'POST' ? { cancelled: true } : { id: promptId, status: 'in_progress' }));
  });
});
server.on('connection', socket => {
  sockets.add(socket);
  socket.on('data', chunk => { bytes += chunk.length; });
  socket.on('close', () => sockets.delete(socket));
});
server.listen(0, '127.0.0.1', () => process.send({ type: 'ready', port: server.address().port }));
function close() {
  server.close(() => process.exit(0));
  server.closeAllConnections();
  for (const socket of sockets) socket.destroy();
}
process.on('message', message => {
  if (message?.type === 'snapshot') process.send({ type: 'snapshot', bytes, requests });
  else if (message?.type === 'close') close();
});
process.on('disconnect', close);
