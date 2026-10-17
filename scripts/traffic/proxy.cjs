// Byte-counting TCP proxy in front of the local emulators. It counts every byte in
// both directions per listener, so the totals include protocol overhead (HTTP and
// websocket framing) but not TLS or gzip, which the emulators do not use.
const net = require('net');
const http = require('http');

const routes = [
  { name: 'client_db', listen: 19510, target: 19500 },
  { name: 'admin_db', listen: 19511, target: 19500 },
  { name: 'client_functions', listen: 19512, target: 19501 },
];
const stats = {};
const reset = () => routes.forEach(r => { stats[r.name] = { up: 0, down: 0, connections: 0 }; });
reset();

for (const route of routes) {
  net.createServer(client => {
    stats[route.name].connections += 1;
    const upstream = net.connect(route.target, '127.0.0.1');
    client.on('data', chunk => { stats[route.name].up += chunk.length; upstream.write(chunk); });
    upstream.on('data', chunk => { stats[route.name].down += chunk.length; client.write(chunk); });
    const close = () => { client.destroy(); upstream.destroy(); };
    client.on('error', close); upstream.on('error', close);
    client.on('close', close); upstream.on('close', close);
  }).listen(route.listen, '127.0.0.1');
}

http.createServer((req, res) => {
  if (req.url === '/reset') reset();
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(stats));
}).listen(19519, '127.0.0.1', () => console.log('traffic proxy ready'));
