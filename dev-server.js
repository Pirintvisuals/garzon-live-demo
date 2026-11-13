/*
 * Helyi fejlesztői szerver: statikus fájlok + az /api végpontok ugyanazzal a kóddal, ami a Vercelen fut.
 * Indítás: node dev-server.js   (a kulcsokat a .env.local fájlból olvassa)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 8790;

const envFile = path.join(ROOT, '.env.local');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !line.trim().startsWith('#') && m[2] !== '' && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.pdf': 'application/pdf', '.svg': 'image/svg+xml' };
const BLOCKED = /^\/(forras|api\/_|\.|node_modules|dev-server\.js|package\.json)/;

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  res.status = c => { res.statusCode = c; return res; };
  res.json = o => { res.setHeader('content-type', 'application/json; charset=utf-8'); res.end(JSON.stringify(o)); };

  // Csak helyben: a feldolgozott eredmény mentése tartaléknak (data/mentett.json).
  if (url.pathname === '/__save' && req.method === 'POST') {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => { fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true }); fs.writeFileSync(path.join(ROOT, 'data', 'mentett.json'), Buffer.concat(chunks)); res.json({ ok: true }); });
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    const name = url.pathname.slice(5).replace(/[^a-z0-9-]/gi, '');
    const file = path.join(ROOT, 'api', name + '.js');
    if (!name || name.startsWith('_') || !fs.existsSync(file)) return res.status(404).json({ error: 'Nincs ilyen végpont.' });
    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', async () => {
      // Helyi kulcs nélkül a kérést az élő telepítés szolgálja ki (a jelszót a böngésző küldi).
      if (!process.env.GEMINI_API_KEY) {
        try {
          const r = await fetch((process.env.REMOTE_API || 'https://garzon-live-demo.vercel.app') + '/api/' + name, { method: 'POST', headers: { 'content-type': 'application/json', 'x-demo-key': req.headers['x-demo-key'] || '' }, body: raw });
          res.statusCode = r.status; res.setHeader('content-type', 'application/json; charset=utf-8'); return res.end(await r.text());
        } catch (e) { return res.status(502).json({ error: 'Az élő szerver nem érhető el: ' + e.message }); }
      }
      try { req.body = raw ? JSON.parse(raw) : {}; } catch (e) { return res.status(400).json({ error: 'Hibás JSON.' }); }
      try { delete require.cache[require.resolve(file)]; await require(file)(req, res); }
      catch (e) { console.error(e); if (!res.writableEnded) res.status(500).json({ error: String(e.message || e) }); }
    });
    return;
  }

  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(ROOT, p));
  if (BLOCKED.test(p) || !file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; return res.end('Nem található'); }
  res.setHeader('content-type', TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
  res.setHeader('cache-control', 'no-store');
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log('garzon-live: http://localhost:' + PORT + (process.env.GEMINI_API_KEY ? '' : '  (GEMINI_API_KEY nincs beállítva)')));
