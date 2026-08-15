/**
 * A very small Chrome DevTools Protocol client.
 *
 * Screenshots are taken from a headless browser rather than from a desktop, so
 * what lands in the repository is the application and nothing else: no window
 * decoration, no tab strip, no notification, no other window. That removes the
 * whole class of accidental disclosure a desktop capture invites, and it means
 * anyone can regenerate the images by running a script.
 *
 * Node has a WebSocket client built in now, so this needs no dependency.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BROWSERS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

function findBrowser() {
  const found = BROWSERS.find((path) => existsSync(path));
  if (found === undefined) {
    throw new Error(`No Chromium based browser found. Looked in:\n  ${BROWSERS.join('\n  ')}`);
  }
  return found;
}

async function endpoint(port, attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      const body = await response.json();
      if (typeof body.webSocketDebuggerUrl === 'string') return body.webSocketDebuggerUrl;
    } catch {
      // Not listening yet.
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('The browser never opened its debugging port.');
}

/**
 * Launches a headless browser and returns a handle for driving one page.
 *
 * `width` and `height` are CSS pixels; `scale` is the device pixel ratio, which
 * is what makes text in the image sharp on a high density display rather than
 * soft.
 */
export async function launch({ width = 1440, height = 900, scale = 2 } = {}) {
  const port = 9222 + Math.floor((process.pid % 300) + 1);
  const profile = mkdtempSync(join(tmpdir(), 'specdeck-shot-'));

  const child = spawn(
    findBrowser(),
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      `--window-size=${width},${height}`,
      `--force-device-scale-factor=${scale}`,
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-features=Translate,MediaRouter',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  const socket = new WebSocket(await endpoint(port));
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  let nextId = 1;
  const pending = new Map();
  let sessionId;

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    const waiting = pending.get(message.id);
    if (waiting === undefined) return;
    pending.delete(message.id);
    if (message.error) waiting.reject(new Error(message.error.message));
    else waiting.resolve(message.result);
  });

  const send = (method, params = {}, session = sessionId) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params, sessionId: session }));
    });

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' }, undefined);
  ({ sessionId } = await send('Target.attachToTarget', { targetId, flatten: true }, undefined));

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: scale,
    mobile: false,
  });

  return {
    async goto(url) {
      await send('Page.navigate', { url });
      // The client renders from a fetch after load, so waiting for the load
      // event is not enough on its own. Callers wait on their own condition.
      await new Promise((r) => setTimeout(r, 400));
    },

    /** Runs an expression in the page and returns its value. */
    async evaluate(expression) {
      const result = await send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.exception?.description ?? 'evaluation failed');
      }
      return result.result.value;
    },

    /** Polls an expression until it is true, so nothing is captured mid render. */
    async waitFor(expression, timeoutMs = 15000) {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        if (await this.evaluate(`Boolean(${expression})`)) return;
        if (Date.now() > deadline) throw new Error(`Timed out waiting for: ${expression}`);
        await new Promise((r) => setTimeout(r, 150));
      }
    },

    /** Resizes the viewport, so each shot is framed to its own content. */
    async resize(nextWidth, nextHeight) {
      await send('Emulation.setDeviceMetricsOverride', {
        width: nextWidth,
        height: nextHeight,
        deviceScaleFactor: scale,
        mobile: false,
      });
      await new Promise((r) => setTimeout(r, 150));
    },

    async setTheme(theme) {
      await this.evaluate(`specdeck.applyTheme(${JSON.stringify(theme)}); true`);
      await new Promise((r) => setTimeout(r, 120));
    },

    /** Returns a PNG buffer of the viewport, or of one element. */
    async screenshot({ selector } = {}) {
      let clip;
      if (selector !== undefined) {
        const box = await this.evaluate(`(function(){
          var n = document.querySelector(${JSON.stringify(selector)});
          if (!n) return null;
          var r = n.getBoundingClientRect();
          return { x: r.left, y: r.top, width: r.width, height: r.height };
        })()`);
        if (box === null) throw new Error(`No element matched ${selector}`);
        clip = { ...box, scale: 1 };
      }
      const result = await send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: clip !== undefined,
        ...(clip === undefined ? {} : { clip }),
      });
      return Buffer.from(result.data, 'base64');
    },

    async close() {
      try {
        socket.close();
      } catch {
        // Already gone.
      }
      child.kill();
      await new Promise((r) => setTimeout(r, 300));
      try {
        rmSync(profile, { recursive: true, force: true });
      } catch {
        // Windows can hold the profile briefly.
      }
    },
  };
}
