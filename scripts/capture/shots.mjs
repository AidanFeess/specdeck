/**
 * Takes the README screenshots.
 *
 *   node scripts/capture/shots.mjs <base-url> <out-dir>
 *
 * Each shot is captured in both themes and framed to its own content, so
 * re-running this after an interface change produces the same framing rather
 * than a slightly different one. Nothing is cropped by hand afterwards.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { launch } from './cdp.mjs';

/**
 * Quantizes a capture to a palette.
 *
 * These are flat interface screenshots with very few distinct colours, so a
 * palette costs nothing visible and roughly halves the file. Images cannot be
 * taken back out of git history, so their size is worth spending a step on.
 */
function shrink(file) {
  if (process.env.SPECDECK_NO_OPTIMIZE === '1') return;
  const before = statSync(file).size;
  const palette = `${file}.palette.png`;
  try {
    const quiet = { stdio: 'ignore' };
    execFileSync(
      'ffmpeg',
      ['-y', '-i', file, '-vf', 'palettegen=max_colors=200:stats_mode=full', palette],
      quiet,
    );
    execFileSync(
      'ffmpeg',
      [
        '-y',
        '-i',
        file,
        '-i',
        palette,
        '-lavfi',
        'paletteuse=dither=none',
        '-compression_level',
        '100',
        `${file}.opt.png`,
      ],
      quiet,
    );
    execFileSync(
      'node',
      [
        '-e',
        `require('fs').renameSync(${JSON.stringify(`${file}.opt.png`)}, ${JSON.stringify(file)})`,
      ],
      quiet,
    );
    console.log(`  ${Math.round(before / 1024)}kB -> ${Math.round(statSync(file).size / 1024)}kB`);
  } catch {
    console.log('  ffmpeg not available, left uncompressed');
  } finally {
    rmSync(palette, { force: true });
  }
}

const base = process.argv[2] ?? 'http://127.0.0.1:7788';
const out = resolve(process.argv[3] ?? 'docs/media');
/** Optional: capture one shot under a different name, for a different project. */
const only = process.argv[4];
const rename = process.argv[5];

const BOARD_READY = "document.querySelectorAll('#board .card').length > 0";

/**
 * Closes anything left open by the previous shot.
 *
 * Everything here drives the interface through `window.specdeck`, the surface
 * the client exposes for exactly this. The client is bundled, so its internals
 * are inside a closure and are no longer reachable as globals.
 */
const CLEAR = 'specdeck.clear(); true';

const shots = [
  {
    // Six lanes fit exactly at this width. Cutting a lane in half looks like a
    // mistake rather than like the horizontal scroll it actually is.
    name: 'board',
    width: 1560,
    height: 520,
    async prepare(page) {
      await page.evaluate(CLEAR);
      await page.evaluate("specdeck.switchView('board'); true");
      await page.waitFor(BOARD_READY);
    },
  },
  {
    name: 'change-tasks',
    width: 1560,
    height: 660,
    async prepare(page) {
      await page.evaluate(CLEAR);
      await page.evaluate("specdeck.switchView('board'); true");
      await page.waitFor(BOARD_READY);
      await page.evaluate("specdeck.openChange('add-webhook-retries', 'tasks'); true");
      await page.waitFor("document.querySelectorAll('#panel .tgroup').length > 0");
    },
  },
  {
    name: 'projects',
    width: 1400,
    height: 460,
    async prepare(page) {
      await page.evaluate(CLEAR);
      await page.evaluate("specdeck.switchView('home'); true");
      await page.waitFor("document.querySelectorAll('#home .pcard').length > 1");
    },
  },
  {
    name: 'specs',
    width: 1400,
    height: 700,
    async prepare(page) {
      await page.evaluate(CLEAR);
      await page.evaluate("specdeck.switchView('specs'); true");
      await page.waitFor("document.querySelectorAll('#specs .cap').length > 0");
    },
  },
  {
    // A change signed off, and one signed off before a later edit. Those two
    // states next to each other are the whole point of approval.
    name: 'approval',
    width: 1560,
    height: 560,
    async prepare(page) {
      await page.evaluate(CLEAR);
      await page.evaluate("specdeck.switchView('board'); true");
      await page.waitFor(BOARD_READY);
      await page.evaluate('specdeck.loadApprovals(); true');
      await page.waitFor("document.querySelectorAll('#board .card .tok.ok').length > 0");
      await page.evaluate("specdeck.openChange('add-endpoint-rotation', 'overview'); true");
      await page.waitFor("document.querySelectorAll('#panel .approval').length > 0");
      // Scrolled to the end rather than to the approval itself. The approval is
      // the last thing on this tab, so the panel ends cleanly on it, and the
      // rows above, which carry the absolute path of whoever ran the capture,
      // are left off the top.
      await page.evaluate(`(function(){
        var body = document.querySelector('#panel .abody');
        body.scrollTop = body.scrollHeight;
        return true;
      })()`);
    },
  },
  {
    // The artifact reader: a proposal read as a document rather than as a file.
    name: 'change-files',
    width: 1560,
    height: 660,
    async prepare(page) {
      await page.evaluate(CLEAR);
      await page.evaluate("specdeck.switchView('board'); true");
      await page.waitFor(BOARD_READY);
      await page.evaluate("specdeck.openChange('add-webhook-retries', 'files'); true");
      await page.waitFor("document.querySelectorAll('#panel .fdoc h2').length > 0");
    },
  },
  {
    // The editor takes the page, with the change still readable beside it.
    name: 'editor',
    width: 1560,
    height: 660,
    async prepare(page) {
      await page.evaluate(CLEAR);
      await page.evaluate("specdeck.switchView('board'); true");
      await page.waitFor(BOARD_READY);
      await page.evaluate("specdeck.openChange('add-webhook-retries', 'files'); true");
      await page.waitFor("document.querySelectorAll('#panel .fbar').length > 0");
      await page.evaluate(`(function(){
        var edit = [].slice.call(document.querySelectorAll('#panel .fbar button'))
          .filter(function(b){ return b.textContent === 'Edit'; })[0];
        edit.click();
        return true;
      })()`);
      await page.waitFor("document.querySelectorAll('#editor .cm-line').length > 0");
    },
  },
  {
    name: 'list',
    width: 1400,
    height: 520,
    async prepare(page) {
      await page.evaluate(CLEAR);
      await page.evaluate("specdeck.switchView('list'); true");
      await page.waitFor("document.querySelectorAll('#list .ltable tbody tr').length > 0");
    },
  },
];

const page = await launch({ width: 1560, height: 660, scale: 2 });
mkdirSync(out, { recursive: true });

try {
  await page.goto(base);
  await page.waitFor('window.specdeck && specdeck.read().state && specdeck.read().state.project');

  for (const shot of shots) {
    if (only !== undefined && shot.name !== only) continue;
    for (const theme of ['light', 'dark']) {
      await page.resize(shot.width, shot.height);
      await page.setTheme(theme);
      await shot.prepare(page);
      // The scan chip counts seconds since the last read, so a capture taken a
      // minute into a session says so. Freezing it keeps the images comparable.
      await page.evaluate("document.getElementById('scan').textContent = 'scanned just now'; true");
      const file = join(out, `${rename ?? shot.name}-${theme}.png`);
      writeFileSync(file, await page.screenshot());
      console.log(file);
      shrink(file);
    }
  }
} finally {
  await page.close();
}
