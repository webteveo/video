// Boot + frame loop. Each output frame = S jittered sub-frames spread across the shutter interval.
import { Engine } from './engine/engine.js';
import { VarFont } from './engine/glyphs.js';

const W = 1920, H = 1080, FPS = 60;
const params = new URLSearchParams(location.search);
const JOB = params.get('job') || '0';
const SAMPLES = params.get('samples') ? +params.get('samples') : null;
// Which film to render: the showreel lives at the root of src/, other reels under src/reels/<name>/.
const REEL = params.get('reel') || 'showreel';
const PATHS = REEL === 'showreel'
  ? { cues: './data/cues.json', module: './reel.js' }
  : { cues: `./reels/${REEL}/cues.json`, module: `./reels/${REEL}/reel.js` };

const FONTS = [
  ['Archivo', 'Archivo-normal.woff2', { weight: '100 900', stretch: '62% 125%' }],
  ['Instrument Serif', 'InstrumentSerif-italic.woff2', { style: 'italic' }],
  ['Instrument Serif', 'InstrumentSerif-normal.woff2', {}],
  ['JetBrains Mono', 'JetBrainsMono-normal.woff2', { weight: '100 800' }],
  ['Big Shoulders', 'BigShoulders-normal.woff2', { weight: '100 900' }],
  ['Big Shoulders Stencil', 'BigShouldersStencil-normal.woff2', { weight: '100 900' }],
];

const halton = (i, b) => { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; };

async function boot() {
  for (const [fam, file, desc] of FONTS) {
    const ff = new FontFace(fam, `url(../assets/fonts/${file})`, desc);
    await ff.load();
    document.fonts.add(ff);
  }
  const glyphs = await (await fetch('./data/glyphs.json')).json();
  const cues = await (await fetch(PATHS.cues)).json();
  const { Reel } = await import(PATHS.module);
  const engine = new Engine(document.getElementById('gl'), W, H);
  const reel = new Reel(engine, { archivo: new VarFont(glyphs.Archivo), cues, params });
  if (reel.init) await reel.init();

  function renderFrame(f) {
    const t0 = f / FPS;
    const { S, shutter } = reel.sampling(t0);
    const n = SAMPLES || S;
    engine.subN = n;
    engine.clearAccum();
    for (let j = 0; j < n; j++) {
      const t = n > 1 ? t0 + ((j + 0.5) / n - 0.5) * (shutter / FPS) : t0;
      engine.jitter = n > 1 ? [halton(j + 1, 2) - 0.5, halton(j + 1, 3) - 0.5] : [0, 0];
      engine.sub = j;
      reel.renderStage(t, j);
      engine.accumulate(1 / n, reel.camera(t));
    }
    reel.overlay(engine.octx, t0, f);
    engine.post(reel.post(t0), f);
    return engine.read();
  }

  window.renderFrames = async (frames) => {
    for (const f of frames) {
      const px = renderFrame(f);
      const r = await fetch(`/frame?job=${JOB}&f=${f}`, { method: 'POST', body: px });
      if (!r.ok) throw new Error('frame sink failed: ' + (await r.text()));
    }
  };
  window.timings = () => reel.timings();
  window.__ready = true;
}

boot().catch((e) => { window.__error = String((e && e.stack) || e); console.error(window.__error); });
