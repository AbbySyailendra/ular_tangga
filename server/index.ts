import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { Server } from 'socket.io';
import { RoomManager } from './RoomManager';

const PORT = Number(process.env.PORT ?? 3001);
/** CORS: isi dengan domain client saat deploy (mis. https://game.contoh.com); default longgar untuk dev */
const ORIGIN = process.env.CLIENT_ORIGIN ? process.env.CLIENT_ORIGIN.split(',') : true;
const DIST = resolve(process.cwd(), 'dist');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const manager = new RoomManager();

// Bila `npm run build` sudah dijalankan, server ini sekaligus menyajikan client (satu port, cocok untuk LAN).
const http = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: manager.roomCount() }));
    return;
  }
  if (!existsSync(DIST)) {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Server multiplayer Snake & Ladder 3D aktif. Jalankan "npm run dev:all" untuk client + server, atau "npm start" agar server ini menyajikan client.');
    return;
  }
  const path = normalize(decodeURIComponent((req.url ?? '/').split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  let file = join(DIST, path);
  if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});

const io = new Server(http, { cors: { origin: ORIGIN } });
io.on('connection', (socket) => manager.attach(socket));

http.listen(PORT, () => console.log(`[server] Snake & Ladder 3D multiplayer di http://localhost:${PORT}`));
