// Canal local do painel para o worker sem privilégios do VPS. Nenhuma porta TCP.
const net = require('node:net');
const socket = net.connect(process.argv[2]);
socket.on('connect', () => {
  socket.write(JSON.stringify({ cwd: process.cwd(), token: process.env.ACCESS_TOKEN }) + '\n');
  process.stdin.pipe(socket); socket.pipe(process.stdout);
});
socket.on('error', () => { process.exitCode = 1; });
socket.on('close', () => process.exit());
process.on('SIGTERM', () => { socket.destroy(); process.exit(); });
