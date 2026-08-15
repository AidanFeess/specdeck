#!/usr/bin/env node
import { resolve } from 'node:path';

import { startServer } from '../server/server.js';
import { checkBundledOpenSpec } from '../core/openspec/installed.js';
import { specdeckVersion } from '../core/version.js';

/**
 * `npx specdeck` entry point.
 *
 * Starts the local server, prints the URL, and opens a browser. Everything it
 * needs comes from the working directory, so there is nothing to configure
 * before the first run.
 */

interface Args {
  project: string;
  port?: number;
  open: boolean;
  help: boolean;
  version: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { project: process.cwd(), open: true, help: false, version: false };
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === undefined) continue;
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--version' || arg === '-v') args.version = true;
    else if (arg === '--no-open') args.open = false;
    else if (arg === '--port' || arg === '-p') {
      const value = Number(argv[i + 1]);
      if (Number.isInteger(value) && value > 0 && value < 65536) {
        args.port = value;
        i += 1;
      }
    } else if (!arg.startsWith('-')) positional.push(arg);
  }

  const first = positional[0];
  if (first !== undefined) args.project = resolve(first);
  return args;
}

const HELP = `specdeck - a local dashboard for OpenSpec projects

Usage
  specdeck [project-folder] [options]

Options
  -p, --port <number>   Port to listen on (defaults to any free port)
      --no-open         Do not open a browser
  -h, --help            Show this help
  -v, --version         Show the version

Reads your OpenSpec files and shows what you have and where each change is.
It never writes into the project it is reading.
`;

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);

  if (args.help) {
    console.log(HELP);
    return;
  }

  if (args.version) {
    const compatibility = checkBundledOpenSpec();
    // specdeck's own version first. `npx` caches per version and resolves
    // latest, so "which one am I actually running" is a question users have to
    // be able to answer.
    console.log(
      `specdeck ${specdeckVersion()} (bundled OpenSpec ${
        compatibility.version ? formatted(compatibility) : 'unknown'
      })`,
    );
    return;
  }

  const compatibility = checkBundledOpenSpec();
  if (!compatibility.usable) {
    console.error(compatibility.message);
    process.exitCode = 1;
    return;
  }
  if (compatibility.status !== 'supported') {
    console.warn(compatibility.message);
  }

  const options: Parameters<typeof startServer>[0] = { initialProject: args.project };
  if (args.port !== undefined) options.port = args.port;

  const running = await startServer(options);
  console.log(`specdeck ${specdeckVersion()} is running at ${running.url}`);
  console.log(`Reading ${args.project}`);
  console.log('Press Ctrl+C to stop.');

  if (args.open) {
    try {
      const { default: open } = await import('open');
      await open(running.url);
    } catch {
      // A browser that will not launch is not a reason to fail. The URL is
      // already printed, which is all the user actually needs.
    }
  }

  const shutdown = (): void => {
    void running.close().then(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

function formatted(result: ReturnType<typeof checkBundledOpenSpec>): string {
  const version = result.version;
  return version ? `${version.major}.${version.minor}.${version.patch}` : 'unknown';
}

await main();
