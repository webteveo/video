#!/usr/bin/env node
// Offline renderer: serves the project, drives headless Chromium (WebGL2 via SwiftShader) and
// streams raw frames either to PNG stills or to an ffmpeg master encode.
//
//   node tools/render.mjs stills --frames 0,30,60-90:5 [--samples 8] [--dir out/stills] [--reel showreel]
//   node tools/render.mjs video  [--from 0 --to 900] [--jobs 2] [--samples 8] [--out out/master.mkv] [--reel …]
//   node tools/render.mjs timings [--reel …]        (derived event times for the score)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const W = 1920, H = 1080, FPS = 60;

let chromium;
try { ({ chromium } = await import('playwright')); }
catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

const FFMPEG = process.env.FFMPEG || 'ffmpeg';

// ---------- args ----------
const argv = process.argv.slice(2);
const mode = argv[0];
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const samples = opt('samples', '');
const jobs = parseInt(opt('jobs', '1'), 10);
const REEL = opt('reel', 'showreel');
const CUES = JSON.parse(fs.readFileSync(path.join(ROOT, REEL === 'showreel' ? 'src/data/cues.json' : `src/reels/${REEL}/cues.json`), 'utf8'));
const TOTAL = Math.round(CUES.duration * FPS);
const PREFIX = REEL === 'showreel' ? '' : `${REEL}_`;

function parseFrames(spec) {
  const out = [];
  for (const part of spec.split(',')) {
    const m = part.match(/^(\d+)(?:-(\d+)(?::(\d+))?)?$/);
    if (!m) throw new Error('bad frame spec ' + part);
    const a = +m[1], b = m[2] ? +m[2] : a, st = m[3] ? +m[3] : 1;
    for (let f = a; f <= b; f += st) out.push(f);
  }
  return out;
}

// ---------- tiny PNG writer (bottom-up RGBA → top-down RGB PNG) ----------
const CRC_TABLE = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (buf) => { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(rgba, w, h) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const src = (h - 1 - y) * w * 4, dst = y * (w * 3 + 1);
    raw[dst] = 0;
    for (let x = 0; x < w; x++) {
      raw[dst + 1 + x * 3] = rgba[src + x * 4];
      raw[dst + 2 + x * 3] = rgba[src + x * 4 + 1];
      raw[dst + 3 + x * 3] = rgba[src + x * 4 + 2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- static server + frame sink ----------
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
  '.woff2': 'font/woff2', '.png': 'image/png', '.wav': 'audio/wav' };
const sinks = new Map(); // job id → async (frame, buffer) => void

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'POST' && url.pathname === '/frame') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      try {
        const sink = sinks.get(url.searchParams.get('job'));
        await sink(+url.searchParams.get('f'), Buffer.concat(chunks));
        res.writeHead(200); res.end('ok');
      } catch (e) { console.error(e); res.writeHead(500); res.end(String(e)); }
    });
    return;
  }
  const file = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;

async function runJob(id, frames, sink) {
  sinks.set(String(id), sink);
  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-watchdog'],
  });
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  page.on('console', (m) => { const t = m.text(); if (!/GPU stall|GL Driver Message/.test(t)) console.log(`[job${id}] ${t}`); });
  page.on('pageerror', (e) => console.error(`[job${id}] PAGE ERROR`, e));
  const q = new URLSearchParams({ job: String(id), reel: REEL });
  if (samples) q.set('samples', samples);
  for (let i = 0; i < argv.length; i++) if (argv[i] === '--param') { const [k, v] = argv[i + 1].split('='); q.set(k, v); }
  await page.goto(`http://127.0.0.1:${PORT}/src/index.html?${q}`);
  await page.waitForFunction(() => window.__ready === true || window.__error, null, { timeout: 120000 });
  const err = await page.evaluate(() => window.__error);
  if (err) throw new Error(err);
  await page.evaluate((fr) => window.renderFrames(fr), frames);
  await browser.close();
}

function eta(start, done, total) {
  const el = (Date.now() - start) / 1000, per = el / Math.max(1, done);
  return `${done}/${total}  ${per.toFixed(2)}s/f  eta ${Math.round(per * (total - done))}s`;
}

try {
  if (mode === 'stills') {
    const frames = parseFrames(opt('frames', '0'));
    const dir = path.resolve(ROOT, opt('dir', `out/${PREFIX}stills`));
    fs.mkdirSync(dir, { recursive: true });
    const t0 = Date.now(); let n = 0;
    await runJob(0, frames, async (f, buf) => {
      fs.writeFileSync(path.join(dir, `f${String(f).padStart(4, '0')}.png`), encodePNG(buf, W, H));
      n++; process.stdout.write(`\r${eta(t0, n, frames.length)}   `);
    });
    console.log(`\nwrote ${frames.length} stills to ${dir}`);
  } else if (mode === 'video') {
    const from = parseInt(opt('from', '0'), 10), to = parseInt(opt('to', String(TOTAL)), 10);
    const out = path.resolve(ROOT, opt('out', `out/${PREFIX}master.mkv`));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const per = Math.ceil((to - from) / jobs);
    const t0 = Date.now(); let n = 0;
    const segs = [];
    await Promise.all(Array.from({ length: jobs }, async (_, k) => {
      const a = from + k * per, b = Math.min(to, a + per);
      if (a >= b) return;
      const seg = jobs === 1 ? out : `${out}.part${k}.mkv`;
      segs[k] = seg;
      const ff = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`,
        '-r', String(FPS), '-i', '-', '-vf', 'vflip', '-c:v', 'libx264rgb', '-preset', 'veryfast', '-crf', '3', seg],
        { stdio: ['pipe', 'inherit', 'inherit'] });
      const done = new Promise((r, j) => ff.on('close', (c) => (c === 0 ? r() : j(new Error('ffmpeg exit ' + c)))));
      let expect = a;
      await runJob(k, Array.from({ length: b - a }, (_, i) => a + i), async (f, buf) => {
        if (f !== expect) throw new Error(`out of order frame ${f} (expected ${expect})`);
        expect++;
        if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
        n++; process.stdout.write(`\r${eta(t0, n, to - from)}   `);
      });
      ff.stdin.end();
      await done;
    }));
    if (jobs > 1) {
      const list = out + '.txt';
      fs.writeFileSync(list, segs.filter(Boolean).map((s) => `file '${s}'`).join('\n'));
      await new Promise((r, j) => spawn(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', out],
        { stdio: 'inherit' }).on('close', (c) => (c === 0 ? r() : j(new Error('concat failed')))));
      for (const s of segs.filter(Boolean)) fs.unlinkSync(s);
      fs.unlinkSync(list);
    }
    console.log(`\nwrote ${out} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  } else if (mode === 'timings') {
    const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
    const page = await browser.newPage();
    page.on('pageerror', (e) => console.error('PAGE ERROR', e));
    await page.goto(`http://127.0.0.1:${PORT}/src/index.html?job=0&reel=${REEL}`);
    await page.waitForFunction(() => window.__ready === true || window.__error, null, { timeout: 120000 });
    const tm = await page.evaluate(() => window.timings());
    const out = path.resolve(ROOT, opt('out', `audio/${PREFIX}timings.json`));
    fs.writeFileSync(out, JSON.stringify(tm, null, 1));
    console.log('wrote', out);
    await browser.close();
  } else {
    console.log('usage: render.mjs stills|video|timings ...');
  }
} finally {
  server.close();
}
