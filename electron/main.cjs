const { app, BrowserWindow, dialog } = require('electron');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const MAX_ROM = 64 * 1024 * 1024;
let rom = null;
let swap16 = false;

function decoderPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'native', 'amm_decode.exe')
    : path.join(app.getAppPath(), 'native', 'amm_decode.exe');
}

function logicalView(data, swap) {
  const view = Buffer.from(data);
  if (swap) for (let i = 0; i + 1 < view.length; i += 2) {
    const b = view[i]; view[i] = view[i + 1]; view[i + 1] = b;
  }
  return view;
}

function phraseCandidates(data, swap) {
  const view = logicalView(data, swap), found = [];
  for (let phrase = 0; phrase < Math.min(256, Math.floor(view.length / 4)); phrase++) {
    const h = phrase * 4;
    const allFF = view[h] === 0xff && view[h + 1] === 0xff && view[h + 2] === 0xff && view[h + 3] === 0xff;
    const offset = ((view[h] & 1) * 0x1000000) + (view[h + 1] << 16) + (view[h + 2] << 8) + view[h + 3];
    if (!allFF && (view[h] & 0x0e) === 0 && offset > 0 && offset < view.length) found.push({ phrase, offset });
  }
  return found;
}

function runDecoder(args, timeout = 30000) {
  return new Promise(resolve => {
    const child = spawn(decoderPath(), args, { windowsHide: true });
    let stdout = '', stderr = '', settled = false;
    const timer = setTimeout(() => { child.kill(); finish(-1); }, timeout);
    function finish(code) {
      if (settled) return; settled = true; clearTimeout(timer); resolve({ code, stdout, stderr });
    }
    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { stderr += d; });
    child.on('error', e => { stderr += e.message; finish(-1); });
    child.on('close', finish);
  });
}

async function validatePhrases(data, swap, dir) {
  const candidates = phraseCandidates(data, swap), groups = new Map();
  for (const item of candidates) {
    if (!groups.has(item.offset)) groups.set(item.offset, []);
    groups.get(item.offset).push(item.phrase);
  }
  const romPath = path.join(dir, 'rom.bin');
  fs.writeFileSync(romPath, data);
  const playable = [];
  for (const phrases of groups.values()) {
    const args = [romPath, String(phrases[0]), path.join(dir, 'unused.wav'), '--probe'];
    if (swap) args.push('--swap16');
    const result = await runDecoder(args, 5000);
    if (result.code === 0) playable.push(...phrases);
  }
  playable.sort((a, b) => a - b);
  return { playable, candidates: candidates.length, unique: groups.size };
}

function json(res, status, value) {
  const body = Buffer.from(JSON.stringify(value));
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': body.length, 'Cache-Control': 'no-store' });
  res.end(body);
}

function collect(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_ROM) { reject(new Error('ROM must be 1-64 MiB')); req.destroy(); }
      else chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function mime(file) {
  return ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' })[path.extname(file)] || 'application/octet-stream';
}

async function handler(req, res) {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (req.method === 'POST' && url.pathname === '/api/rom') {
      const data = await collect(req);
      if (!data.length) return json(res, 400, { error: 'ROM must be 1-64 MiB' });
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ymz770-load-'));
      try {
        const selectedSwap = req.headers['x-swap16'] === '1';
        const result = await validatePhrases(data, selectedSwap, dir);
        rom = data; swap16 = selectedSwap;
        return json(res, 200, { bytes: data.length, swap16, phrases: result.playable,
          tableCandidates: result.candidates, uniquePointers: result.unique,
          unusedPhrases: result.candidates - result.playable.length });
      } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    }
    if (req.method === 'GET' && url.pathname === '/api/phrase') {
      if (!rom) return json(res, 409, { error: 'load a ROM first' });
      const phrase = Number(url.searchParams.get('n'));
      if (!Number.isInteger(phrase) || phrase < 0 || phrase > 255) return json(res, 400, { error: 'invalid phrase' });
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ymz770-decode-'));
      try {
        const rp = path.join(dir, 'rom.bin'), wp = path.join(dir, 'phrase.wav');
        fs.writeFileSync(rp, rom);
        const args = [rp, String(phrase), wp]; if (swap16) args.push('--swap16');
        const result = await runDecoder(args);
        if (result.code !== 0 || !fs.existsSync(wp)) return json(res, 422, { error: result.stderr.trim() || 'decode failed' });
        const wav = fs.readFileSync(wp);
        res.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': wav.length, 'X-AMMSL-Meta': result.stdout.trim(), 'Cache-Control': 'no-store' });
        return res.end(wav);
      } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    }
    const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    const root = app.getAppPath(), file = path.resolve(root, relative);
    if (!file.startsWith(path.resolve(root) + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); return res.end('Not found');
    }
    const body = fs.readFileSync(file);
    res.writeHead(200, { 'Content-Type': mime(file), 'Content-Length': body.length, 'Cache-Control': 'no-store' });
    res.end(body);
  } catch (error) { if (!res.headersSent) json(res, 500, { error: error.message }); else res.end(); }
}

app.whenReady().then(() => {
  if (!fs.existsSync(decoderPath())) {
    dialog.showErrorBox('YMZ770 Workbench', `AMM decoder not found:\n${decoderPath()}`);
    app.quit(); return;
  }
  const server = http.createServer(handler);
  server.listen(0, '127.0.0.1', () => {
    const port = server.address().port;
    const win = new BrowserWindow({ width: 1420, height: 960, minWidth: 980, minHeight: 700,
      backgroundColor: '#171d1b', autoHideMenuBar: true,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
    win.loadURL(`http://127.0.0.1:${port}/`);
  });
  app.on('before-quit', () => server.close());
});

app.on('window-all-closed', () => app.quit());
