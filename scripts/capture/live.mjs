/**
 * Records the live update behaviour.
 *
 *   node scripts/capture/live.mjs <base-url> <project-dir> <out.gif>
 *
 * This is the one thing prose cannot convey: a file changes on disk and the
 * board has already moved. The recording ticks tasks in a tasks file the same
 * way an agent would, and captures the browser while it happens. Nothing is
 * staged in the browser, so what the frames show is the real reaction.
 *
 * Needs ffmpeg on PATH for the last step.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { launch } from './cdp.mjs';

const base = process.argv[2] ?? 'http://127.0.0.1:7788';
const project = resolve(process.argv[3] ?? 'E:/Projects/specdeck-demo/orbit');
const outGif = resolve(process.argv[4] ?? 'docs/media/live-update.gif');

const WIDTH = 1040;
const HEIGHT = 480;
const FPS = 8;
const FRAME_MS = Math.round(1000 / FPS);

const tasksFile = join(project, 'openspec', 'changes', 'add-endpoint-rotation', 'tasks.md');
const original = readFileSync(tasksFile, 'utf8');

/** Ticks the next unticked task, the way an agent finishing one would. */
function tickNext(count = 1) {
  let text = readFileSync(tasksFile, 'utf8');
  for (let i = 0; i < count; i++) text = text.replace('- [ ]', '- [x]');
  writeFileSync(tasksFile, text, 'utf8');
}

// When each edit lands, in seconds from the start of the recording. The gaps
// are long enough to read the board between them.
const script = [
  { at: 1.4, tick: 1 },
  { at: 3.0, tick: 2 },
  { at: 4.6, tick: 2 },
  { at: 6.2, tick: 1 },
];
const DURATION = 8.4;

const frames = resolve('.frames-live');
rmSync(frames, { recursive: true, force: true });
mkdirSync(frames, { recursive: true });

const page = await launch({ width: WIDTH, height: HEIGHT, scale: 1 });

try {
  await page.goto(base);
  await page.waitFor("document.querySelectorAll('#board .card').length > 0");
  await page.setTheme('dark');
  await page.evaluate("specdeck.switchView('board'); true");
  await page.waitFor("document.querySelectorAll('#board .card').length > 0");

  // Frame on the lanes the card travels through, rather than on the whole
  // board. The scroll position survives a rescan, so this holds for the whole
  // recording.
  await page.evaluate(`(function(){
    var lanes = document.querySelectorAll('#board .lane');
    var ready = lanes[3];
    document.getElementById('board').scrollLeft = ready.offsetLeft - 16;
    return true;
  })()`);

  const started = Date.now();
  let next = 0;
  let index = 0;

  for (;;) {
    const elapsed = (Date.now() - started) / 1000;
    if (elapsed > DURATION) break;

    while (next < script.length && elapsed >= script[next].at) {
      tickNext(script[next].tick);
      next += 1;
    }

    const frame = join(frames, `f${String(index).padStart(4, '0')}.png`);
    writeFileSync(frame, await page.screenshot());
    index += 1;

    const drift = (Date.now() - started) / 1000 - elapsed;
    await new Promise((r) => setTimeout(r, Math.max(0, FRAME_MS - drift * 1000)));
  }

  console.log(`${index} frames`);
} finally {
  await page.close();
  writeFileSync(tasksFile, original, 'utf8');
}

// Two passes: build a palette from the whole clip, then map onto it. One pass
// picks a palette per frame, which makes a static interface shimmer.
mkdirSync(resolve(outGif, '..'), { recursive: true });
const palette = join(frames, 'palette.png');
execFileSync(
  'ffmpeg',
  [
    '-y',
    '-i',
    join(frames, 'f%04d.png'),
    '-vf',
    'palettegen=max_colors=128:stats_mode=diff',
    palette,
  ],
  { stdio: 'ignore' },
);
execFileSync(
  'ffmpeg',
  [
    '-y',
    '-framerate',
    String(FPS),
    '-i',
    join(frames, 'f%04d.png'),
    '-i',
    palette,
    '-lavfi',
    'paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle',
    '-loop',
    '0',
    outGif,
  ],
  { stdio: 'ignore' },
);

rmSync(frames, { recursive: true, force: true });
console.log(outGif);
