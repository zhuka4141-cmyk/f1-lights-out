// No packages needed: node preview.cjs, then open http://127.0.0.1:4173
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const types = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.ttf': 'font/ttf', '.json': 'application/json', '.hdr': 'application/octet-stream', '.mp3': 'audio/mpeg' };
http.createServer((req, res) => {
  let file;
  try { file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname)); }
  catch { res.writeHead(400); res.end(); return; }
  if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  if (file === root || fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  fs.readFile(file, (error, bytes) => {
    if (error) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(bytes);
  });
}).listen(4173, '127.0.0.1', () => console.log('LIGHTS OUT: http://127.0.0.1:4173'));
