/**
 * The entire client, served as one document.
 *
 * Deliberately dependency free and build free. `npx specdeck` has to work with
 * no bundler step. Client code below avoids template literals so this file can
 * stay a plain template string without escaping.
 */
export const APP_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>specdeck</title>
<style>
  /* Light is the base. Dark is applied either by explicit choice or by system
     preference when no explicit choice has been made, so the toggle can always
     win in both directions. */
  :root {
    --bg: #fbfbfc; --panel: #ffffff; --lane: #f2f4f7; --line: #e3e6ec;
    --ink: #16191f; --muted: #6b7382; --faint: #99a1b0;
    --accent: #3862e0; --accent-soft: #e7edfd;
    --warn: #a2680d; --err: #c23b30;
    --thumb: #ccd2dc; --thumb-hover: #b0b8c6;
    --shadow: 0 1px 2px rgba(16,20,28,.05), 0 8px 24px rgba(16,20,28,.06);
  }
  :root[data-theme="dark"],
  html:not([data-theme]) {
    color-scheme: light;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg: #0f1116; --panel: #171a21; --lane: #14171d; --line: #262b35;
      --ink: #e6e9ef; --muted: #949cab; --faint: #6d7583;
      --accent: #7093ff; --accent-soft: #1d2740;
      --warn: #e2a949; --err: #f0736a;
      --thumb: #333a47; --thumb-hover: #454e5e;
      --shadow: 0 1px 2px rgba(0,0,0,.3), 0 8px 24px rgba(0,0,0,.35);
      color-scheme: dark;
    }
  }
  :root[data-theme="dark"] {
    --bg: #0f1116; --panel: #171a21; --lane: #14171d; --line: #262b35;
    --ink: #e6e9ef; --muted: #949cab; --faint: #6d7583;
    --accent: #7093ff; --accent-soft: #1d2740;
    --warn: #e2a949; --err: #f0736a;
    --thumb: #333a47; --thumb-hover: #454e5e;
    --shadow: 0 1px 2px rgba(0,0,0,.3), 0 8px 24px rgba(0,0,0,.35);
    color-scheme: dark;
  }

  * { box-sizing: border-box; }

  /* The hidden attribute only takes effect through the user agent's display
     rule, which any author rule with an explicit display beats. Several views
     here are flex containers, so without this they stay visible when hidden and
     stack on top of one another. */
  [hidden] { display: none !important; }

  /* No default scrollbars anywhere. Thin, quiet, and the track is invisible. */
  * { scrollbar-width: thin; scrollbar-color: var(--thumb) transparent; }
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--thumb); border-radius: 99px; border: 2px solid transparent; background-clip: content-box; }
  ::-webkit-scrollbar-thumb:hover { background: var(--thumb-hover); background-clip: content-box; }
  ::-webkit-scrollbar-corner { background: transparent; }

  html, body { height: 100%; }
  body {
    margin: 0; background: var(--bg); color: var(--ink);
    font: 14px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    display: flex; flex-direction: column; overflow: hidden;
  }

  header {
    display: flex; align-items: center; gap: 10px; flex-wrap: wrap; flex: 0 0 auto;
    padding: 10px 16px; border-bottom: 1px solid var(--line); background: var(--panel);
  }
  h1 { font-size: 15px; margin: 0; font-weight: 650; letter-spacing: -.01em; }
  h1 button#brand {
    font: inherit; font-weight: 650; border: 0; background: transparent; color: var(--ink);
    padding: 0; cursor: pointer; border-radius: 4px;
  }
  h1 button#brand:hover { color: var(--accent); border-color: transparent; }
  .setrow { display: flex; gap: 12px; align-items: flex-start; padding: 12px 0; border-bottom: 1px solid var(--line); }
  .setrow .k { flex: 0 0 190px; font-weight: 600; font-size: 13px; }
  .setrow .v { flex: 1; }
  .setrow .hint { font-size: 12px; color: var(--muted); margin-top: 3px; }
  h1 em { font-style: normal; color: var(--muted); font-weight: 450; }
  .grow { flex: 1; }
  .muted { color: var(--muted); }
  .chip {
    font-size: 12px; padding: 3px 9px; border-radius: 99px; white-space: nowrap;
    border: 1px solid var(--line); background: var(--bg); color: var(--muted);
  }
  button {
    font: inherit; font-size: 13px; padding: 5px 10px; border-radius: 7px; cursor: pointer;
    border: 1px solid var(--line); background: var(--bg); color: var(--ink);
    transition: border-color .12s, background .12s;
  }
  button:hover { border-color: var(--accent); }
  button.icon { padding: 5px 9px; }
  input {
    font: inherit; font-size: 13px; padding: 6px 9px; border-radius: 7px;
    border: 1px solid var(--line); background: var(--bg); color: var(--ink);
  }
  input:focus { outline: none; border-color: var(--accent); }
  #path { min-width: 240px; }
  #filter { min-width: 150px; }

  .banner { padding: 9px 16px; border-bottom: 1px solid var(--line); font-size: 13px; flex: 0 0 auto; }
  .banner.err { background: color-mix(in srgb, var(--err) 12%, var(--bg)); }
  .banner.warn { background: color-mix(in srgb, var(--warn) 16%, var(--bg)); }

  /* The board scrolls horizontally. Each lane scrolls its own cards vertically.
     The page itself never scrolls. */
  .board {
    flex: 1 1 auto; min-height: 0;
    display: flex; gap: 10px; padding: 14px 16px; overflow-x: auto; overflow-y: hidden;
  }
  .lane {
    display: flex; flex-direction: column; min-height: 0;
    flex: 0 0 244px; width: 244px;
    background: var(--lane); border: 1px solid var(--line); border-radius: 11px;
  }
  .lane > h2 {
    flex: 0 0 auto; margin: 0; padding: 11px 12px 8px;
    font-size: 11px; font-weight: 650; text-transform: uppercase; letter-spacing: .07em;
    color: var(--muted); display: flex; justify-content: space-between; align-items: center;
  }
  .lane > h2 b { color: var(--faint); font-weight: 600; }
  .cards { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 0 10px 10px; }

  .card {
    background: var(--panel); border: 1px solid var(--line); border-radius: 9px;
    padding: 10px 11px; margin-bottom: 8px; cursor: pointer;
    transition: border-color .12s, transform .08s;
  }
  .card:hover { border-color: var(--accent); }
  .card:active { transform: scale(.995); }
  .card.active { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft); }
  .card .name { font-weight: 600; word-break: break-word; letter-spacing: -.01em; }
  .card .meta { font-size: 12px; color: var(--muted); margin-top: 3px; }
  .bar { height: 4px; border-radius: 99px; background: var(--line); margin-top: 9px; overflow: hidden; }
  .bar > i { display: block; height: 100%; background: var(--accent); border-radius: 99px; }
  .flag { font-size: 11.5px; margin-top: 6px; }
  .flag.err { color: var(--err); }
  .flag.warn { color: var(--warn); }
  .empty { color: var(--faint); font-size: 12px; padding: 4px 2px 8px; }

  /* The panel itself never scrolls. Header and tabs are fixed, and only the tab
     body scrolls, so no scrollbar can ever run alongside the tab strip. */
  aside {
    position: fixed; top: 0; right: 0; height: 100vh; width: min(600px, 94vw);
    background: var(--panel); border-left: 1px solid var(--line);
    z-index: 10; box-shadow: var(--shadow);
    display: flex; flex-direction: column; overflow: hidden;
  }
  .ahead {
    flex: 0 0 auto; padding: 16px 20px 12px;
    display: flex; align-items: flex-start; gap: 12px;
  }
  .ahead h2 { margin: 0 0 2px; font-size: 18px; letter-spacing: -.02em; }

  /* A fixed set of tabs. Capabilities live inside Specs rather than each
     claiming a tab, so the strip never needs to scroll no matter how many
     capabilities a change touches. */
  .tabs {
    flex: 0 0 auto; display: flex; gap: 2px; padding: 0 14px;
    border-bottom: 1px solid var(--line);
  }
  .tabs button {
    border: 0; border-radius: 0; background: transparent; white-space: nowrap;
    padding: 9px 11px; color: var(--muted); font-size: 13px; font-weight: 550;
    border-bottom: 2px solid transparent; margin-bottom: -1px;
  }
  .tabs button:hover { color: var(--ink); border-color: transparent; border-bottom-color: var(--line); }
  .tabs button.on { color: var(--accent); border-bottom-color: var(--accent); }
  .tabs button .n { color: var(--faint); font-weight: 500; margin-left: 5px; }
  .tabs button.on .n { color: var(--accent); }

  .abody { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 4px 20px 40px; }

  /* Capability sub-navigation. Wraps rather than scrolling. */
  .pills { display: flex; flex-wrap: wrap; gap: 6px; margin: 14px 0 4px; }
  .pills button {
    font-size: 12px; padding: 4px 9px; border-radius: 99px;
    background: var(--bg); color: var(--muted); font-weight: 550;
  }
  .pills button.on { background: var(--accent-soft); color: var(--accent); border-color: transparent; }
  .pills button .n { margin-left: 5px; color: var(--faint); font-weight: 500; }
  .pills button.on .n { color: var(--accent); }

  .stats { display: flex; gap: 8px; flex-wrap: wrap; margin: 16px 0 4px; }
  .stat {
    flex: 1 1 140px; border: 1px solid var(--line); border-radius: 9px;
    padding: 9px 11px; background: var(--bg);
  }
  .stat .k {
    font-size: 10.5px; font-weight: 650; text-transform: uppercase;
    letter-spacing: .07em; color: var(--muted);
  }
  .stat .v { font-size: 19px; font-weight: 650; letter-spacing: -.02em; margin-top: 2px; }
  .stat .v small { font-size: 13px; font-weight: 500; color: var(--faint); }
  .stat .bar { margin-top: 7px; }
  .abody h3 {
    margin: 22px 0 8px; font-size: 11px; font-weight: 650;
    text-transform: uppercase; letter-spacing: .07em; color: var(--muted);
  }
  .row { display: flex; gap: 10px; align-items: baseline; padding: 3px 0; font-size: 13px; }
  .row > b { flex: 0 0 96px; font-weight: 500; color: var(--muted); }
  .row code { word-break: break-all; }

  /* Tasks */
  .tgroup { border: 1px solid var(--line); border-radius: 9px; margin-bottom: 8px; background: var(--bg); overflow: hidden; }
  .thead {
    display: flex; align-items: center; gap: 9px; width: 100%; text-align: left;
    padding: 9px 11px; background: transparent; border: 0; border-radius: 0; cursor: pointer;
    font-size: 13.5px; font-weight: 650; color: var(--ink); letter-spacing: -.01em;
  }
  .thead:hover { background: var(--lane); border-color: transparent; }
  .thead .caret { flex: 0 0 auto; color: var(--faint); transition: transform .15s; font-size: 11px; }
  .tgroup.open .thead .caret { transform: rotate(90deg); }
  .thead .tcount { margin-left: auto; font-weight: 500; font-size: 12px; color: var(--muted); }
  .thead .tdone { color: var(--accent); }
  .tlist { padding: 2px 11px 10px 30px; border-top: 1px solid var(--line); }
  .tgroup:not(.open) .tlist { display: none; }
  .task { display: flex; gap: 8px; padding: 3px 0; font-size: 13px; align-items: baseline; }
  .task .box { flex: 0 0 auto; color: var(--faint); font-size: 12px; }
  .task.done { color: var(--muted); text-decoration: line-through; text-decoration-color: var(--faint); }
  .task.done .box { color: var(--accent); }
  .task .tid { color: var(--faint); font-variant-numeric: tabular-nums; }

  /* Requirements */
  .req { border: 1px solid var(--line); border-radius: 9px; padding: 11px; margin-bottom: 8px; background: var(--bg); }
  .req .op {
    display: inline-block; font-size: 10px; font-weight: 700; letter-spacing: .08em;
    text-transform: uppercase; color: var(--accent); background: var(--accent-soft);
    padding: 2px 6px; border-radius: 4px; margin-bottom: 6px;
  }
  .req .rname { font-weight: 600; letter-spacing: -.01em; }
  .req .rtext { color: var(--muted); font-size: 13px; margin-top: 3px; }
  .scn { border-left: 2px solid var(--line); margin: 9px 0 0 2px; padding: 2px 0 2px 11px; }
  .scn .sname { font-size: 12.5px; font-weight: 550; }
  .scn pre { margin: 3px 0 0; white-space: pre-wrap; font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--muted); }

  code { background: var(--lane); padding: 1px 5px; border-radius: 4px; font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; }

  /* Tasks are buttons because clicking one writes to tasks.md. */
  button.task {
    width: 100%; text-align: left; border: 0; border-radius: 5px; background: transparent;
    color: inherit; padding: 3px 4px; margin-left: -4px;
  }
  button.task:hover { background: var(--lane); border-color: transparent; }
  button.task.busy { opacity: .5; pointer-events: none; }

  .seg { display: inline-flex; border: 1px solid var(--line); border-radius: 7px; overflow: hidden; }
  .seg button { border: 0; border-radius: 0; background: var(--bg); }
  .seg button + button { border-left: 1px solid var(--line); }
  .seg button.on { background: var(--accent-soft); color: var(--accent); font-weight: 600; }

  .act {
    margin-top: 9px; width: 100%; font-size: 12px; padding: 5px 8px;
    background: var(--accent-soft); color: var(--accent); border-color: transparent; font-weight: 600;
  }
  .act:hover { border-color: var(--accent); }

  .specs { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 16px; }
  .cap {
    background: var(--panel); border: 1px solid var(--line); border-radius: 10px;
    padding: 14px 16px; margin: 0 auto 10px; max-width: 900px;
  }
  .cap h3 { margin: 0; font-size: 15px; letter-spacing: -.01em; }
  .cap .purpose { color: var(--muted); font-size: 13px; margin-top: 3px; }
  .cap .used { font-size: 12px; color: var(--muted); margin-top: 6px; }

  .modal {
    position: fixed; inset: 0; background: rgba(8,10,14,.5); z-index: 20;
    display: flex; align-items: center; justify-content: center; padding: 20px;
  }
  .sheet {
    background: var(--panel); border: 1px solid var(--line); border-radius: 12px;
    box-shadow: var(--shadow); width: min(620px, 96vw); padding: 18px 20px 20px;
  }
  .sheet h3 { margin: 0 0 4px; font-size: 16px; }
  .sheet pre {
    background: var(--bg); border: 1px solid var(--line); border-radius: 8px;
    padding: 11px; margin: 12px 0; white-space: pre-wrap; word-break: break-word;
    font: 12.5px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  .sheet .actions { display: flex; gap: 8px; justify-content: flex-end; }
  .toast {
    position: fixed; bottom: 18px; left: 50%; transform: translateX(-50%); z-index: 30;
    background: var(--panel); border: 1px solid var(--line); border-radius: 8px;
    padding: 9px 14px; box-shadow: var(--shadow); font-size: 13px; max-width: 90vw;
  }
  .toast.err { border-color: var(--err); color: var(--err); }

  .drop {
    border: 2px dashed var(--accent); border-radius: 11px; background: var(--accent-soft);
    display: flex; align-items: center; justify-content: center; text-align: center;
    color: var(--accent); font-weight: 600; font-size: 13px; padding: 18px 10px;
  }
  .card.dragging { opacity: .45; }
  .tl { border-left: 2px solid var(--line); margin-left: 6px; padding-left: 14px; }
  .tl .ev { position: relative; padding: 5px 0; font-size: 13px; }
  .tl .ev::before {
    content: ''; position: absolute; left: -21px; top: 12px;
    width: 7px; height: 7px; border-radius: 99px; background: var(--accent);
  }
  .tl .when { color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
  .art { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 13px; }
  .art .aname { flex: 0 0 132px; color: var(--muted); }
  .art .grow2 { flex: 1; }

  /* First-run view for a folder with no OpenSpec. */
  .setup { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 26px 16px 40px; }
  .setup .inner { max-width: 720px; margin: 0 auto; }
  .setup h2 { margin: 0 0 4px; font-size: 20px; letter-spacing: -.02em; }
  .setup .path { font-size: 13px; color: var(--muted); margin-bottom: 18px; word-break: break-all; }
  .tools {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 6px;
    max-height: 320px; overflow-y: auto; padding: 4px;
    border: 1px solid var(--line); border-radius: 10px; background: var(--panel);
  }
  .tool {
    display: flex; align-items: center; gap: 8px; padding: 7px 9px;
    border-radius: 7px; cursor: pointer; font-size: 13px;
  }
  .tool:hover { background: var(--lane); }
  .tool input { min-width: 0; }
  .tool .warnflag { font-size: 11px; color: var(--warn); }
  .tool .found { font-size: 11px; color: var(--accent); }
  .setup pre {
    background: var(--panel); border: 1px solid var(--line); border-radius: 8px;
    padding: 11px; margin: 14px 0; white-space: pre-wrap; word-break: break-word;
    font: 12.5px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  .setup .go { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }

  /* Projects home. */
  .home { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 24px 16px 40px; }
  .home .inner { max-width: 1040px; margin: 0 auto; }
  .home .top { display: flex; align-items: center; gap: 12px; margin-bottom: 4px; flex-wrap: wrap; }
  .home h2 { margin: 0; font-size: 20px; letter-spacing: -.02em; }
  .home .sub { color: var(--muted); font-size: 13px; margin-bottom: 18px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }
  .pcard {
    border: 1px solid var(--line); border-radius: 11px; background: var(--panel);
    padding: 14px 15px; cursor: pointer; transition: border-color .12s, transform .08s;
    display: flex; flex-direction: column; gap: 3px;
  }
  .pcard:hover { border-color: var(--accent); }
  .pcard:active { transform: scale(.996); }
  .pcard.current { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft); }
  .pcard .pname { font-weight: 650; font-size: 15px; letter-spacing: -.01em; }
  .pcard .ppath { font-size: 11.5px; color: var(--faint); word-break: break-all; }
  .pcard .pstats { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 9px; font-size: 12px; color: var(--muted); }
  .pcard .pstats b { color: var(--ink); font-weight: 650; font-variant-numeric: tabular-nums; }
  .pcard .plane { display: flex; gap: 4px; margin-top: 9px; flex-wrap: wrap; }
  .pcard .plane span {
    font-size: 11px; padding: 1px 7px; border-radius: 99px;
    background: var(--lane); color: var(--muted);
  }
  .pcard .pfoot { display: flex; gap: 8px; align-items: center; margin-top: 10px; flex-wrap: wrap; }
  .pcard .broken { color: var(--warn); font-size: 12px; margin-top: 8px; }
  .pcard.draggable { cursor: grab; }
  .pcard.dragging { opacity: .4; }
  .pcard.dropbefore { box-shadow: -3px 0 0 var(--accent); }
  .pcard.dropafter { box-shadow: 3px 0 0 var(--accent); }
  .pcard.nodrop { opacity: .55; border-style: dashed; }
  .pcard .ptop { display: flex; align-items: flex-start; gap: 8px; }
  .pcard .ptop .pname { flex: 1; }
  .star {
    flex: 0 0 auto; border: 0; background: transparent; padding: 0 2px;
    font-size: 15px; line-height: 1; color: var(--faint); cursor: pointer;
  }
  .star:hover { color: var(--warn); border-color: transparent; }
  .star.on { color: var(--warn); }
  .move { display: flex; gap: 4px; }
  .move button { font-size: 11px; padding: 1px 6px; color: var(--faint); line-height: 1.5; }
  .move button:hover:not(:disabled) { color: var(--accent); }
  .move button:disabled { opacity: .35; cursor: default; border-color: var(--line); }
  .home .controls { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-bottom: 14px; }
  .home .controls .lbl { font-size: 12px; color: var(--muted); }
  .pcard .remove {
    margin-left: auto; font-size: 11px; padding: 2px 7px; color: var(--faint);
  }
  .pcard .remove:hover { color: var(--err); border-color: var(--err); }

  /* Sync indicators. Never red, because nothing here is an error. Lanes already
     own colour, so sync gets a glyph, a count, and a tooltip instead. */
  .sync { display: flex; gap: 5px; margin-top: 7px; flex-wrap: wrap; }
  .tok {
    font-size: 11px; font-variant-numeric: tabular-nums; padding: 1px 6px;
    border-radius: 99px; border: 1px solid var(--line); color: var(--muted);
    background: var(--bg); font-weight: 600;
  }
  .tok.uncommitted { color: var(--warn); border-color: color-mix(in srgb, var(--warn) 40%, var(--line)); }
  .tok.ahead { color: var(--muted); }
  .tok.behind { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 40%, var(--line)); }

  .syncbar {
    flex: 0 0 auto; display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
    padding: 7px 16px; border-bottom: 1px solid var(--line);
    background: var(--panel); font-size: 12.5px; color: var(--muted);
  }
  .syncbar b { color: var(--ink); font-weight: 600; }
  .syncbar .warnish { color: var(--warn); }

  /* A change that exists on the remote but not in this checkout. Dashed, because
     it is real work that is not on your disk yet. */
  .ghost {
    border-style: dashed; background: transparent; cursor: default;
  }
  .ghost:hover { border-color: var(--accent); }
  .ghost .name { color: var(--muted); }
</style>
</head>
<body>
<header>
  <h1><button id="brand">specdeck</button> <small id="ver" class="muted" style="font-weight:450;font-size:11px"></small> <em id="pname"></em></h1>
  <span class="chip" id="scan">scanning</span>
  <span class="chip" id="counts"></span>
  <span class="grow"></span>
  <span class="seg">
    <button id="viewHome">Projects</button>
    <button id="viewBoard" class="on">Board</button>
    <button id="viewSpecs">Specs</button>
    <button id="viewSettings">Settings</button>
  </span>
  <input id="filter" placeholder="Filter" />
  <button class="icon" id="themeBtn" title="Theme"></button>
</header>
<div id="banners"></div>
<div class="syncbar" id="syncbar" hidden></div>
<div class="board" id="board"></div>
<div class="specs" id="specs" hidden></div>
<div class="setup" id="setup" hidden></div>
<div class="home" id="home" hidden></div>
<div class="home" id="settings" hidden></div>
<div id="panel"></div>
<div id="modal"></div>
<div id="toast"></div>

<script>
var LANES = ['draft','proposed','specified','ready','in-progress','done','archived'];
var LABELS = {
  draft:'Draft', proposed:'Proposed', specified:'Specified', ready:'Ready',
  'in-progress':'In Progress', done:'Done', archived:'Archived'
};
var THEMES = ['auto','light','dark'];
var THEME_ICON = { auto:'\\u25d0 Auto', light:'\\u2600 Light', dark:'\\u263e Dark' };

var state = null, selected = null, scannedAt = null, filterText = '', view = 'board';
var dragging = null, dragHint = null, historyByChange = null, taskHistory = {};
var dispatched = {};
var groupOverrides = {};
var activeTab = {};
var activeCapability = {};

function toast(message, isError) {
  var host = document.getElementById('toast');
  host.innerHTML = '';
  var box = el('div','toast' + (isError ? ' err' : ''), esc(message));
  host.appendChild(box);
  setTimeout(function(){ if (host.firstChild === box) host.innerHTML = ''; }, 4000);
}

try { groupOverrides = JSON.parse(localStorage.getItem('specdeck.groups') || '{}'); } catch (e) { groupOverrides = {}; }

function saveGroups() {
  try { localStorage.setItem('specdeck.groups', JSON.stringify(groupOverrides)); } catch (e) {}
}

/* Theme: an explicit choice is stamped on the root so it beats the system
   preference in both directions. "auto" removes the attribute entirely. */
function currentTheme() {
  try { return localStorage.getItem('specdeck.theme') || 'auto'; } catch (e) { return 'auto'; }
}
function applyTheme(name) {
  if (name === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', name);
  document.getElementById('themeBtn').textContent = THEME_ICON[name];
}
function cycleTheme() {
  var next = THEMES[(THEMES.indexOf(currentTheme()) + 1) % THEMES.length];
  try { localStorage.setItem('specdeck.theme', next); } catch (e) {}
  applyTheme(next);
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function el(tag, cls, html) {
  var n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}
function ago(iso) {
  if (!iso) return 'never';
  var s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime())/1000));
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.round(s/60) + 'm ago';
  return Math.round(s/3600) + 'h ago';
}
function issuesOf(change) {
  var all = (change.issues || []).slice();
  (change.deltaSpecs || []).forEach(function(d){ all = all.concat(d.issues || []); });
  return all.concat(change.tasks && change.tasks.issues ? change.tasks.issues : []);
}

/* A group is open unless the user said otherwise. Finished groups default to
   collapsed, so a long task list shows what is left rather than what is done. */
function groupKey(changeName, index) { return changeName + '#' + index; }
function isGroupOpen(changeName, index, group) {
  var key = groupKey(changeName, index);
  if (Object.prototype.hasOwnProperty.call(groupOverrides, key)) return groupOverrides[key];
  var total = group.tasks.length;
  var done = group.tasks.filter(function(t){ return t.completed; }).length;
  return !(total > 0 && done === total);
}
function setGroupOpen(changeName, index, open) {
  groupOverrides[groupKey(changeName, index)] = open;
  saveGroups();
}

/* Every view is rebuilt wholesale on each update, which resets the scroll of
   anything that scrolls. While an agent is writing files this fires every few
   seconds, so a reader gets thrown back to the top constantly. Positions are
   captured before a rebuild and restored after, keyed by something stable
   across rebuilds rather than by element identity. */
function captureScroll() {
  var map = {};
  ['specs', 'home', 'setup', 'settings'].forEach(function (id) {
    var e = document.getElementById(id);
    if (e) map[id] = e.scrollTop;
  });
  var body = document.querySelector('.abody');
  if (body) map.abody = body.scrollTop;
  // Lanes are keyed by their name, not their index, so adding or removing a
  // lane cannot shift positions onto the wrong column.
  [].slice.call(document.querySelectorAll('.lane')).forEach(function (lane) {
    var h = lane.querySelector('h2');
    var cards = lane.querySelector('.cards');
    if (h && cards) map['lane:' + h.textContent.replace(/[0-9]+$/, '')] = cards.scrollTop;
  });
  return map;
}

function restoreScroll(map) {
  if (!map) return;
  ['specs', 'home', 'setup', 'settings'].forEach(function (id) {
    var e = document.getElementById(id);
    if (e && map[id]) e.scrollTop = map[id];
  });
  [].slice.call(document.querySelectorAll('.lane')).forEach(function (lane) {
    var h = lane.querySelector('h2');
    var cards = lane.querySelector('.cards');
    if (!h || !cards) return;
    var key = 'lane:' + h.textContent.replace(/[0-9]+$/, '');
    if (map[key]) cards.scrollTop = map[key];
  });
}

/* Switching views clears the filter. Carrying one across a switch is how a
   user ends up staring at an empty board wondering what broke. */
function switchView(next) {
  view = next;
  filterText = '';
  var box = document.getElementById('filter');
  if (box) box.value = '';
  render();
}

function goHome() {
  switchView('home');
}

function hideAllViews() {
  ['board','specs','setup','home','settings'].forEach(function(id){ document.getElementById(id).hidden = true; });
  document.getElementById('syncbar').hidden = true;
}

function render() {
  if (!state) return;
  var scroll = captureScroll();
  var res = state.project;
  document.getElementById('banners').innerHTML = '';

  document.getElementById('viewHome').className = view === 'home' ? 'on' : '';
  document.getElementById('viewSettings').className = view === 'settings' ? 'on' : '';
  document.getElementById('viewBoard').className = view === 'board' ? 'on' : '';
  document.getElementById('viewSpecs').className = view === 'specs' ? 'on' : '';

  if (view === 'settings') {
    hideAllViews();
    document.getElementById('settings').hidden = false;
    document.getElementById('pname').textContent = '';
    document.getElementById('counts').hidden = true;
    renderSettings();
    restoreScroll(scroll);
    tick();
    return;
  }

  if (view === 'home') {
    hideAllViews();
    document.getElementById('home').hidden = false;
    document.getElementById('pname').textContent = '';
    document.getElementById('counts').hidden = true;
    renderHome();
    restoreScroll(scroll);
    tick();
    return;
  }

  if (!res.ok) {
    document.getElementById('pname').textContent = '';
    document.getElementById('counts').textContent = '';
    document.getElementById('board').innerHTML = '';
    document.getElementById('board').hidden = true;
    document.getElementById('specs').hidden = true;
    document.getElementById('syncbar').hidden = true;

    // A folder without OpenSpec is not an error, it is a folder that has not
    // started yet. Showing an error banner over an empty board would be both
    // discouraging and useless.
    if (res.failure.problem === 'not-openspec') {
      hideAllViews();
      renderSetup(res.failure);
      return;
    }

    document.getElementById('setup').hidden = true;
    banner('err', esc(res.failure.message));
    return;
  }
  document.getElementById('setup').hidden = true;

  var snap = res.snapshot;
  scannedAt = snap.scannedAt;
  document.getElementById('pname').textContent = snap.name;
  var badge = document.getElementById('ver');
  if (badge && state.version) badge.textContent = 'v' + state.version;
  document.getElementById('counts').textContent =
    snap.changes.length + ' changes \\u00b7 ' + snap.capabilities.length + ' capabilities';

  if (state.openspec && state.openspec.status !== 'supported') {
    banner(state.openspec.usable ? 'warn' : 'err', esc(state.openspec.message));
  }

  renderSyncBar();

  var needle = filterText.toLowerCase();
  var board = document.getElementById('board');
  var specs = document.getElementById('specs');

  // Hide everything, then reveal exactly one view. Toggling views individually
  // is how a leftover screen ends up stacked under the current one.
  hideAllViews();
  document.getElementById('syncbar').hidden = false;
  if (view === 'specs') specs.hidden = false; else board.hidden = false;

  if (view === 'specs') {
    renderSpecs(snap, needle);
    restoreScroll(scroll);
    tick();
    return;
  }

  board.innerHTML = '';

  LANES.forEach(function(lane) {
    var inLane = snap.changes.filter(function(c) {
      return c.lane === lane && (!needle || c.name.toLowerCase().indexOf(needle) !== -1);
    });
    // Remote-only changes have no local files, so nothing derives a lane for
    // them. They sit in Draft as ghosts, because that is where an unstarted
    // change would be if you had it.
    var ghosts = lane === 'draft'
      ? ((state.remoteOnly || []).filter(function(g){
          return !needle || g.name.toLowerCase().indexOf(needle) !== -1;
        }))
      : [];

    var col = el('div','lane');
    col.appendChild(el('h2', null, esc(LABELS[lane]) + '<b>' + (inLane.length + ghosts.length) + '</b>'));
    var cards = el('div','cards');
    if (inLane.length === 0 && ghosts.length === 0) {
      cards.appendChild(el('div','empty', needle ? 'no match' : 'empty'));
    }
    inLane.forEach(function(c){ cards.appendChild(card(c)); });
    ghosts.forEach(function(g){ cards.appendChild(ghostCard(g)); });

    // The archive drop zone appears only while a finished change is being
    // dragged, because archiving is the one lane transition that is a real
    // filesystem mutation rather than a derived state.
    if (lane === 'archived') {
      var zone = el('div','drop','Drop here to archive');
      zone.hidden = true;
      zone.id = 'dropzone';
      zone.ondragover = function(e){ e.preventDefault(); };
      zone.ondrop = function(e){
        e.preventDefault();
        if (dragging) openArchive(dragging);
      };
      cards.appendChild(zone);
    }
    col.appendChild(cards);
    board.appendChild(col);
  });

  // A dispatch is cleared when the change actually moves, never on a timer.
  // A timer would mean shipping a board state whose truth condition is elapsed
  // seconds rather than anything on disk.
  snap.changes.forEach(function(c){
    var sent = dispatched[c.name];
    if (sent && sent.lane !== undefined && sent.lane !== c.lane) delete dispatched[c.name];
    else if (sent && sent.lane === undefined) sent.lane = c.lane;
  });

  if (selected) {
    var still = snap.changes.filter(function(c){ return c.name === selected; })[0];
    if (still) openPanel(still); else closePanel();
  }
  restoreScroll(scroll);
  tick();
}

function banner(kind, html) {
  document.getElementById('banners').appendChild(el('div','banner ' + kind, html));
}

/* Sync indicators carry a glyph, a count, and a text tooltip, so nothing here
   depends on colour alone. */
function token(kind, glyph, count, title) {
  var t = el('span','tok ' + kind, glyph + ' ' + count);
  t.title = title;
  return t;
}

/* Remote state is a snapshot, so its age is permanent chrome rather than an
   occasional warning. An "in sync" claim is only as good as the last fetch. */
function renderSyncBar() {
  var bar = document.getElementById('syncbar');
  var sync = state && state.sync;
  if (!sync) { bar.hidden = true; return; }
  bar.hidden = false;
  bar.innerHTML = '';

  if (!sync.available) {
    bar.appendChild(el('span', null, esc(sync.reason || 'Sync state is unavailable.')));
    bar.appendChild(el('span','muted','No sync indicators are shown.'));
    return;
  }

  if (sync.branch) {
    bar.appendChild(el('span', null, '<b>' + esc(sync.branch) + '</b>'
      + (sync.remoteRef ? ' \\u2194 ' + esc(sync.remoteRef) : '')));
  }

  if (sync.remoteRef) {
    var freshness = sync.neverFetched
      ? 'never fetched since clone'
      : 'fetched ' + ago(new Date(Date.now() - (sync.fetchAgeMs || 0)).toISOString());
    bar.appendChild(el('span', sync.neverFetched ? 'warnish' : null, esc(freshness)));
  } else if (sync.problem === 'no-remote-ref') {
    bar.appendChild(el('span','warnish','no remote branch resolved, so only uncommitted work is shown'));
  }

  var counts = state.changeSync || {};
  var dirty = 0, ahead = 0, behind = 0;
  Object.keys(counts).forEach(function(k){
    if (counts[k].uncommitted) dirty++;
    if (counts[k].ahead) ahead++;
    if (counts[k].behind) behind++;
  });
  var bits = [];
  if (dirty) bits.push(dirty + ' with uncommitted work');
  if (ahead) bits.push(ahead + ' not pushed');
  if (behind) bits.push(behind + ' with remote-only files');
  bar.appendChild(el('span', null, esc(bits.length ? bits.join(' \\u00b7 ') : 'everything in sync')));

  bar.appendChild(el('span','grow'));
  var refresh = el('button','icon','Refresh remote');
  refresh.onclick = function() {
    refresh.disabled = true;
    refresh.textContent = 'Fetching';
    fetch('/api/fetch', { method: 'POST' })
      .then(function(r){ return r.json(); })
      .then(function(res){
        state = res.state;
        if (!res.ok) toast(res.message || 'Could not reach the remote.', true);
        render();
      })
      .catch(function(){ toast('Could not reach specdeck.', true); render(); });
  };
  bar.appendChild(refresh);
}

function card(c) {
  var n = el('div','card' + (c.name === selected ? ' active' : ''));
  n.appendChild(el('div','name', esc(c.name)));

  var bits = [];
  if (c.tasks && c.tasks.total > 0) bits.push(c.tasks.completed + '/' + c.tasks.total + ' tasks');
  var doneCount = (c.artifacts || []).filter(function(a){ return a.status === 'done'; }).length;
  if (c.artifacts && c.artifacts.length) bits.push(doneCount + '/' + c.artifacts.length + ' artifacts');
  if (c.capabilities && c.capabilities.length) bits.push(c.capabilities.length + ' caps');
  if (c.archivedOn) bits.push(c.archivedOn);
  n.appendChild(el('div','meta', esc(bits.join(' \\u00b7 '))));

  if (c.tasks && c.tasks.total > 0) {
    var bar = el('div','bar');
    var fill = el('i');
    fill.style.width = Math.round(100 * c.tasks.completed / c.tasks.total) + '%';
    bar.appendChild(fill);
    n.appendChild(bar);
  }

  var sync = (state.changeSync || {})[c.name];
  if (sync && !sync.synced) {
    var row = el('div','sync');
    if (sync.uncommitted) row.appendChild(token('uncommitted', '\\u2022', sync.uncommitted,
      sync.uncommitted + ' file(s) written but not committed'));
    if (sync.ahead) row.appendChild(token('ahead', '\\u2191', sync.ahead,
      sync.ahead + ' file(s) committed but not pushed'));
    if (sync.behind) row.appendChild(token('behind', '\\u2193', sync.behind,
      sync.behind + ' file(s) on the remote that you do not have'));
    n.appendChild(row);
  }

  var sent = dispatched[c.name];
  if (sent) {
    var waiting = (c.artifacts || []).filter(function(a){ return a.status !== 'done'; })[0];
    var note = el('div','flag');
    note.style.color = 'var(--accent)';
    note.innerHTML = esc('Handed off ' + ago(new Date(sent.at).toISOString()) + ' via ' + sent.method)
      + (waiting ? '<br><span class="muted">waiting for ' + esc(waiting.outputPath) + '</span>' : '');
    var clear = el('button','icon','Not running');
    clear.style.fontSize = '11px';
    clear.style.marginTop = '4px';
    clear.title = 'Clear this. specdeck never clears it on a timer.';
    clear.onclick = function(e){ e.stopPropagation(); delete dispatched[c.name]; render(); };
    note.appendChild(document.createElement('br'));
    note.appendChild(clear);
    n.appendChild(note);
  }

  var iss = issuesOf(c);
  var errs = iss.filter(function(i){ return i.severity === 'error'; }).length;
  var warns = iss.length - errs;
  if (errs) n.appendChild(el('div','flag err', errs + (errs === 1 ? ' problem' : ' problems')));
  else if (warns) n.appendChild(el('div','flag warn', warns + (warns === 1 ? ' warning' : ' warnings')));

  if (c.location !== 'archived') {
    var missing = (c.artifacts || []).filter(function(a){ return a.status !== 'done'; }).map(function(a){ return a.id; });
    var remaining = c.tasks ? c.tasks.total - c.tasks.completed : 0;
    var verb = missing.length ? 'propose' : (remaining > 0 ? 'apply' : 'archive');
    var label = missing.length
      ? 'Write ' + missing[0]
      : (remaining > 0 ? 'Continue implementing' : 'Ready to archive');
    var act = el('button','act', esc(label));
    act.onclick = function(e){ e.stopPropagation(); openHandoff(c, verb); };
    n.appendChild(act);
  }

  // Only a finished change can be dragged, and only onto Archive. Every other
  // lane is derived from files, so dragging there would be theatre.
  if (c.lane === 'done') {
    n.draggable = true;
    n.ondragstart = function(){
      dragging = c;
      n.classList.add('dragging');
      var zone = document.getElementById('dropzone');
      if (zone) zone.hidden = false;
    };
    n.ondragend = function(){
      dragging = null;
      n.classList.remove('dragging');
      var zone = document.getElementById('dropzone');
      if (zone) zone.hidden = true;
    };
  } else if (c.location !== 'archived') {
    // Teach once, rather than letting a dead drag feel broken.
    n.onmousedown = function(){ dragHint = c.lane; };
  }

  n.tabIndex = 0;
  n.setAttribute('role','button');
  var pick = function(){ selected = c.name; render(); };
  n.onclick = pick;
  n.onkeydown = function(e){
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); }
  };
  return n;
}

function loadHistory(change) {
  fetch('/api/history').then(function(r){ return r.json(); }).then(function(res){
    historyByChange = res;
    if (selected === change.name) openPanel(change);
  }).catch(function(){ historyByChange = { available: false, reason: 'Could not read history.', changes: {} }; });
}

function loadTaskHistory(change) {
  taskHistory[change.name] = undefined;
  fetch('/api/history/tasks?change=' + encodeURIComponent(change.name))
    .then(function(r){ return r.json(); })
    .then(function(res){
      taskHistory[change.name] = res;
      if (selected === change.name) openPanel(change);
    })
    .catch(function(){ taskHistory[change.name] = { available: false, reason: 'Could not read history.', events: [] }; });
}

/* Archiving is the only destructive thing specdeck can do, and OpenSpec has no
   unarchive. So everything the interactive CLI would have asked is put in front
   of the user here instead, before anything runs. */
function openArchive(change) {
  var host = document.getElementById('modal');
  var back = el('div','modal');
  var sheet = el('div','sheet');
  sheet.appendChild(el('h3', null, 'Archive ' + esc(change.name)));
  sheet.appendChild(el('div','muted','Checking...'));
  back.appendChild(sheet);
  back.onclick = function(e){ if (e.target === back) host.innerHTML = ''; };
  host.innerHTML = '';
  host.appendChild(back);

  fetch('/api/archive/preflight?change=' + encodeURIComponent(change.name))
    .then(function(r){ return r.json(); })
    .then(function(pre){
      sheet.innerHTML = '';
      sheet.appendChild(el('h3', null, 'Archive ' + esc(change.name)));
      sheet.appendChild(el('div','muted',
        'This merges its specs into openspec/specs and moves the change into the archive. '
        + 'OpenSpec has no unarchive, so git is the only way back.'));

      if (pre.incompleteTasks > 0) {
        sheet.appendChild(el('div','flag warn',
          esc(pre.incompleteTasks + ' of ' + pre.totalTasks + ' tasks are still unticked.')));
      }
      if (pre.validationIssues && pre.validationIssues.length) {
        sheet.appendChild(el('div','flag err','Validation reported problems:'));
        pre.validationIssues.slice(0, 6).forEach(function(issue){
          sheet.appendChild(el('div','flag err', esc(issue)));
        });
      }
      sheet.appendChild(el('pre', null, esc(pre.command)));

      var actions = el('div','actions');
      var cancel = el('button', null, 'Cancel');
      cancel.onclick = function(){ host.innerHTML = ''; };
      var copy = el('button', null, 'Copy command');
      copy.onclick = function(){
        navigator.clipboard.writeText(pre.command).then(function(){ toast('Copied.'); },
          function(){ toast('Could not reach the clipboard.', true); });
      };
      var go = el('button','act', pre.incompleteTasks > 0 ? 'Archive anyway' : 'Archive');
      go.style.width = 'auto';
      go.style.marginTop = '0';
      go.onclick = function(){
        go.disabled = true;
        go.textContent = 'Archiving';
        fetch('/api/archive', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ change: change.name })
        }).then(function(r){ return r.json(); }).then(function(res){
          state = res.state;
          host.innerHTML = '';
          selected = null;
          if (res.ok) toast(res.message);
          else showCommandFailure('The archive did not complete', res);
          render();
        }).catch(function(){ host.innerHTML = ''; toast('Could not reach specdeck.', true); });
      };
      actions.appendChild(cancel);
      actions.appendChild(copy);
      actions.appendChild(go);
      sheet.appendChild(actions);
    })
    .catch(function(){ host.innerHTML = ''; toast('Could not check this change.', true); });
}

/* Command failures show the command, the exit status, and the real output.
   A paraphrase would hide the one thing that lets someone fix it. */
function showCommandFailure(title, res) {
  var host = document.getElementById('modal');
  var back = el('div','modal');
  var sheet = el('div','sheet');
  sheet.appendChild(el('h3', null, esc(title)));
  if (res.message) sheet.appendChild(el('div','muted', esc(res.message)));
  // Newlines are built with fromCharCode rather than an escape sequence. This
  // file is one big template literal, and a backslash escape here has already
  // been mangled once into a literal line break that broke the whole client.
  var nl = String.fromCharCode(10);
  sheet.appendChild(el('pre', null, esc([
    res.command || '',
    '',
    'exit code ' + (res.exitCode === undefined ? '?' : res.exitCode),
    '',
    res.output || res.detail || 'no output',
  ].join(nl))));
  var actions = el('div','actions');
  var close = el('button', null, 'Close');
  close.onclick = function(){ host.innerHTML = ''; };
  actions.appendChild(close);
  sheet.appendChild(actions);
  back.appendChild(sheet);
  back.onclick = function(e){ if (e.target === back) host.innerHTML = ''; };
  host.innerHTML = '';
  host.appendChild(back);
}

/* The editor picker.

   specdeck asks rather than guessing, because guessing is what produced the
   original fault: on a machine with no file association for markdown, the file
   was handed to the operating system, nothing appeared, and nothing was
   reported. */
function openFile(path) {
  fetch('/api/editor', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: path })
  }).then(function(r){ return r.json().then(function(b){ return { status: r.status, body: b }; }); })
    .then(function(res){
      if (res.body.needsChoice) { askForEditor(path, null); return; }
      if (res.status === 200) { toast(res.body.message); return; }
      // A remembered application that no longer launches must not fail quietly.
      askForEditor(path, res.body);
    })
    .catch(function(){ toast('Could not reach specdeck.', true); });
}

function baseNameOf(path) {
  return path.split(String.fromCharCode(92)).join('/').split('/').pop();
}

function askForEditor(path, failure) {
  fetch('/api/editors').then(function(r){ return r.json(); }).then(function(info){
    var host = document.getElementById('modal');
    var back = el('div','modal');
    var sheet = el('div','sheet');

    sheet.appendChild(el('h3', null, 'Open with'));
    if (failure && failure.message) {
      sheet.appendChild(el('div','flag err', esc(failure.message)));
      if (failure.attempted) sheet.appendChild(el('pre', null, esc(failure.attempted)));
    }
    sheet.appendChild(el('div','muted', esc(baseNameOf(path))));

    var chosen = { command: null, system: false, label: null };
    var pills = el('div','pills');

    function select(button, next) {
      chosen = next;
      [].slice.call(pills.querySelectorAll('button')).forEach(function(x){ x.className = ''; });
      if (button) button.className = 'on';
    }

    (info.editors || []).forEach(function(e){
      var b = el('button', null, esc(e.label));
      b.title = e.command;
      b.onclick = function(){ select(b, { command: e.command, system: false, label: e.label }); };
      pills.appendChild(b);
    });

    var sys = el('button', null, 'System default');
    sys.title = 'Hand the file to your operating system';
    sys.onclick = function(){ select(sys, { command: null, system: true, label: 'System default' }); };
    pills.appendChild(sys);
    sheet.appendChild(pills);

    if (!(info.editors || []).length) {
      sheet.appendChild(el('div','muted',
        'specdeck found no known editor here. Type a command or a full path below.'));
    }

    var custom = document.createElement('input');
    custom.placeholder = 'or a command or path, for example code';
    custom.style.width = '100%';
    custom.style.marginTop = '10px';
    custom.oninput = function(){
      var value = custom.value.trim();
      if (value) select(null, { command: value, system: false, label: value });
    };
    sheet.appendChild(custom);

    var rememberWrap = el('label','tool');
    rememberWrap.style.marginTop = '10px';
    var remember = document.createElement('input');
    remember.type = 'checkbox';
    rememberWrap.appendChild(remember);
    rememberWrap.appendChild(el('span', null, 'Remember this choice'));
    rememberWrap.appendChild(el('span','muted','changeable in Settings'));
    sheet.appendChild(rememberWrap);

    var actions = el('div','actions');
    var cancel = el('button', null, 'Cancel');
    cancel.onclick = function(){ host.innerHTML = ''; };
    var go = el('button','act','Open');
    go.style.width = 'auto';
    go.style.marginTop = '0';
    go.onclick = function(){
      if (!chosen.command && !chosen.system) { toast('Pick an application first.', true); return; }
      var payload = { path: path, remember: remember.checked };
      if (chosen.system) payload.system = true; else payload.command = chosen.command;
      if (chosen.label) payload.label = chosen.label;

      fetch('/api/editor', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function(r){ return r.json().then(function(b){ return { status: r.status, body: b }; }); })
        .then(function(res){
          if (res.status === 200) {
            host.innerHTML = '';
            toast(res.body.message + (remember.checked ? ' Remembered.' : ''));
            if (remember.checked) load();
          } else {
            // Stay open so another application can be picked immediately.
            askForEditor(path, res.body);
          }
        })
        .catch(function(){ toast('Could not reach specdeck.', true); });
    };
    actions.appendChild(cancel);
    actions.appendChild(go);
    sheet.appendChild(actions);

    back.appendChild(sheet);
    back.onclick = function(e){ if (e.target === back) host.innerHTML = ''; };
    host.innerHTML = '';
    host.appendChild(back);
  });
}

/* Settings. A preference that can only be changed by triggering the action it
   governs is one the user cannot undo. */
function renderSettings() {
  var host = document.getElementById('settings');
  host.innerHTML = '';
  var inner = el('div','inner');
  inner.appendChild(el('h2', null, 'Settings'));
  inner.appendChild(el('div','sub',
    'These apply to specdeck itself. Nothing here is written into any project.'));

  var remembered = state.config && state.config.defaults && state.config.defaults.editor;

  var editorRow = el('div','setrow');
  editorRow.appendChild(el('div','k','Open documents with'));
  var ev = el('div','v');
  ev.appendChild(el('div', null, remembered
    ? esc(remembered.label || (remembered.kind === 'system' ? 'System default' : remembered.command))
    : 'Ask every time'));
  ev.appendChild(el('div','hint', remembered
    ? 'Used for every project. Clear it to be asked again.'
    : 'specdeck asks which application to use, and can remember your answer.'));

  var evActions = el('div','pills');
  var change = el('button', null, remembered ? 'Change' : 'Choose');
  change.onclick = function(){ chooseEditorPreference(); };
  evActions.appendChild(change);
  if (remembered) {
    var clear = el('button', null, 'Clear');
    clear.onclick = function(){
      fetch('/api/settings/editor', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clear: true })
      }).then(function(r){ return r.json(); }).then(function(s){
        state = s; toast('Cleared. specdeck will ask again.'); render();
      });
    };
    evActions.appendChild(clear);
  }
  ev.appendChild(evActions);
  editorRow.appendChild(ev);
  inner.appendChild(editorRow);

  var handoffRow = el('div','setrow');
  handoffRow.appendChild(el('div','k','Handoff method'));
  var hv = el('div','v');
  var current = (state.config && state.config.defaults && state.config.defaults.handoffMethod) || 'auto';
  var hp = el('div','pills');
  [['auto','Automatic'],['attach','Send to a running session'],['terminal','Open in a new terminal'],['clipboard','Copy the prompt']]
    .forEach(function(pair){
      var b = el('button', current === pair[0] ? 'on' : null, esc(pair[1]));
      b.onclick = function(){
        fetch('/api/settings', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ handoffMethod: pair[0], scope: 'global' })
        }).then(function(r){ return r.json(); }).then(function(s){ state = s; render(); });
      };
      hp.appendChild(b);
    });
  hv.appendChild(hp);
  hv.appendChild(el('div','hint',
    'Anything specdeck cannot do for your tool falls back to copying, and says so.'));
  handoffRow.appendChild(hv);
  inner.appendChild(handoffRow);

  host.appendChild(inner);
}

/* Choosing a preference from settings, with no document to open yet. */
function chooseEditorPreference() {
  fetch('/api/editors').then(function(r){ return r.json(); }).then(function(info){
    var host = document.getElementById('modal');
    var back = el('div','modal');
    var sheet = el('div','sheet');
    sheet.appendChild(el('h3', null, 'Open documents with'));
    sheet.appendChild(el('div','muted','Applies to every project. You can clear it later.'));

    function choose(payload, label) {
      fetch('/api/settings/editor', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function(r){ return r.json(); }).then(function(s){
        state = s; host.innerHTML = ''; toast('Documents will open in ' + label + '.'); render();
      });
    }

    var pills = el('div','pills');
    (info.editors || []).forEach(function(e){
      var b = el('button', null, esc(e.label));
      b.title = e.command;
      b.onclick = function(){ choose({ command: e.command, label: e.label }, e.label); };
      pills.appendChild(b);
    });
    var sys = el('button', null, 'System default');
    sys.onclick = function(){ choose({ system: true }, 'your system default'); };
    pills.appendChild(sys);
    sheet.appendChild(pills);

    var custom = document.createElement('input');
    custom.placeholder = 'or a command or path';
    custom.style.width = '100%';
    custom.style.marginTop = '10px';
    custom.onkeydown = function(e){
      var value = custom.value.trim();
      if (e.key === 'Enter' && value) choose({ command: value, label: value }, value);
    };
    sheet.appendChild(custom);

    var actions = el('div','actions');
    var close = el('button', null, 'Cancel');
    close.onclick = function(){ host.innerHTML = ''; };
    actions.appendChild(close);
    sheet.appendChild(actions);

    back.appendChild(sheet);
    back.onclick = function(e){ if (e.target === back) host.innerHTML = ''; };
    host.innerHTML = '';
    host.appendChild(back);
  });
}

/* The projects home. Overviews cost a full project read each, so they are
   fetched when this screen is opened rather than on every board render. */
var overviews = null;
var placements = [];
var projectSort = 'manual';
var draggingProject = null;
var dragPending = false;
/* A rearrangement rebuilds the grid, which throws away the focused card. The
   card that moved is refocused afterwards so a second key press keeps working. */
var pendingFocus = null;

try {
  var savedSort = localStorage.getItem('specdeck.projectSort');
  if (savedSort) projectSort = savedSort;
} catch (e) {}

function saveSort(value) {
  projectSort = value;
  try { localStorage.setItem('specdeck.projectSort', value); } catch (e) {}
}

function openProject(path) {
  fetch('/api/open', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: path })
  }).then(function(r){ return r.json(); }).then(function(s){
    state = s;
    selected = null;
    initSelection = null;
    view = 'board';
    render();
  });
}

function loadOverviews() {
  fetch('/api/overview?sort=' + encodeURIComponent(projectSort))
    .then(function(r){ return r.json(); })
    .then(function(res){
      overviews = res.overviews;
      placements = res.placements || [];
      if (view === 'home') renderHome();
    });
}

function pickFolder(button) {
  var original = button.textContent;
  button.disabled = true;
  button.textContent = 'Choose a folder';
  fetch('/api/browse', { method: 'POST' })
    .then(function(r){ return r.json(); })
    .then(function(res){
      button.disabled = false;
      button.textContent = original;
      if (res.ok && res.state) {
        state = res.state;
        selected = null;
        initSelection = null;
        overviews = null;
        view = 'board';
        render();
        loadOverviews();
        return;
      }
      if (res.cancelled) return;
      if (res.unsupported) { promptForPath(res.message); return; }
      if (res.message) toast(res.message, true);
    })
    .catch(function(){
      button.disabled = false;
      button.textContent = original;
      promptForPath();
    });
}

/* Fallback for a machine with no native picker, so the feature degrades to
   typing a path rather than simply being unavailable. */
function promptForPath(reason) {
  var host = document.getElementById('modal');
  var back = el('div','modal');
  var sheet = el('div','sheet');
  sheet.appendChild(el('h3', null, 'Open a project folder'));
  sheet.appendChild(el('div','muted', esc(reason
    || 'specdeck could not open your system folder picker here, so type the path instead.')));

  var input = document.createElement('input');
  input.placeholder = 'C:/Projects/my-project';
  input.style.width = '100%';
  input.style.marginTop = '12px';
  sheet.appendChild(input);

  var actions = el('div','actions');
  var cancel = el('button', null, 'Cancel');
  cancel.onclick = function(){ host.innerHTML = ''; };
  var go = el('button','act','Open');
  go.style.width = 'auto';
  go.style.marginTop = '0';
  var submit = function(){
    var value = input.value.trim();
    if (!value) return;
    host.innerHTML = '';
    openProject(value);
  };
  go.onclick = submit;
  input.onkeydown = function(e){ if (e.key === 'Enter') submit(); };
  actions.appendChild(cancel);
  actions.appendChild(go);
  sheet.appendChild(actions);

  back.appendChild(sheet);
  back.onclick = function(e){ if (e.target === back) host.innerHTML = ''; };
  host.innerHTML = '';
  host.appendChild(back);
  input.focus();
}

var SORTS = [
  { id:'manual', label:'Manual' },
  { id:'name', label:'Name' },
  { id:'activity', label:'Activity' },
  { id:'tasks', label:'Tasks' }
];

function isStarred(path) {
  for (var i = 0; i < placements.length; i++) {
    if (placements[i].path === path) return placements[i].starred === true;
  }
  return false;
}

/* Starred projects are a block above the rest, so a move across that boundary
   cannot be honoured. Refusing it out loud beats a card that springs back. */
function sameGroup(a, b) {
  return isStarred(a) === isStarred(b);
}

function visibleProjects() {
  var needle = filterText.toLowerCase();
  if (!needle) return overviews;
  return overviews.filter(function(o){
    return o.name.toLowerCase().indexOf(needle) !== -1
      || o.path.toLowerCase().indexOf(needle) !== -1;
  });
}

/* Rearranging is offered only when what you see is what you are arranging.
   Under a sort the arrangement would be overwritten on the next read, and under
   a filter the hidden projects have positions this list cannot speak for. */
function canRearrange() {
  return projectSort === 'manual' && !filterText;
}

function indexOfPath(list, path) {
  for (var i = 0; i < list.length; i++) if (list[i].path === path) return i;
  return -1;
}

function focusCard(path) {
  var nodes = document.getElementById('home').getElementsByClassName('pcard');
  for (var i = 0; i < nodes.length; i++) {
    if (nodes[i].getAttribute('data-path') === path) { nodes[i].focus(); return; }
  }
}

function clearDropHints() {
  var nodes = document.getElementById('home').getElementsByClassName('pcard');
  for (var i = 0; i < nodes.length; i++) {
    nodes[i].classList.remove('dropbefore');
    nodes[i].classList.remove('dropafter');
    nodes[i].classList.remove('nodrop');
  }
}

/* A control inside a card must not also trigger the card. The click is stopped
   where it is handled, and the key press here, because the card itself acts on
   Enter and Space. */
function isolate(button) {
  button.onkeydown = function(e){
    if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
  };
  return button;
}

function sortControls() {
  var row = el('div','controls');
  row.appendChild(el('span','lbl','Sort'));

  var seg = el('span','seg');
  SORTS.forEach(function(s){
    var b = el('button', projectSort === s.id ? 'on' : null, esc(s.label));
    b.onclick = function(){
      if (projectSort === s.id) return;
      saveSort(s.id);
      renderHome();
      loadOverviews();
    };
    seg.appendChild(b);
  });
  row.appendChild(seg);

  if (projectSort !== 'manual') {
    row.appendChild(el('span','lbl','Switch to Manual to rearrange.'));
  } else if (filterText) {
    row.appendChild(el('span','lbl','Clear the filter to rearrange.'));
  }
  return row;
}

function toggleStar(o, starred) {
  pendingFocus = o.path;
  fetch('/api/projects/star', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: o.path, starred: starred })
  }).then(function(r){ return r.json(); }).then(function(res){
    if (res && res.error) { toast(res.error, true); return; }
    // The server owns the ordering rule, so the list is read back rather than
    // rearranged here against a second copy of that rule.
    loadOverviews();
  }).catch(function(){ toast('Could not save that.', true); });
}

/* The new arrangement is shown at once and saved behind it. The client already
   knows the resulting order, so reading every project again after a move would
   cost a full scan each for nothing new. */
function applyOrder(next, focusPath) {
  overviews = next;
  var paths = next.map(function(o){ return o.path; });

  placements = placements.slice();
  paths.forEach(function(path, index){
    var found = false;
    for (var i = 0; i < placements.length; i++) {
      if (placements[i].path === path) {
        placements[i] = { path: path, starred: placements[i].starred, order: index };
        found = true;
      }
    }
    if (!found) placements.push({ path: path, order: index });
  });

  pendingFocus = focusPath || null;
  renderHome();

  fetch('/api/projects/order', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ paths: paths })
  }).then(function(r){ return r.json(); }).then(function(res){
    if (res && res.error) toast(res.error, true);
  }).catch(function(){ toast('Could not save the new order.', true); });
}

function moveProject(path, delta) {
  if (!canRearrange()) return;
  var list = visibleProjects();
  var from = indexOfPath(list, path);
  var to = from + delta;
  if (from < 0 || to < 0 || to >= list.length) return;
  if (!sameGroup(list[from].path, list[to].path)) {
    toast('Starred projects always sit above the rest.');
    return;
  }
  var next = list.slice();
  next.splice(to, 0, next.splice(from, 1)[0]);
  applyOrder(next, path);
}

function dropProject(sourcePath, targetPath, after) {
  if (!canRearrange()) return;
  var list = visibleProjects();
  var from = indexOfPath(list, sourcePath);
  if (from < 0 || indexOfPath(list, targetPath) < 0) return;
  if (!sameGroup(sourcePath, targetPath)) {
    toast('Starred projects always sit above the rest.');
    return;
  }
  var next = list.slice();
  var moved = next.splice(from, 1)[0];
  next.splice(indexOfPath(next, targetPath) + (after ? 1 : 0), 0, moved);
  applyOrder(next, sourcePath);
}

function renderHome() {
  /* A rescan arriving mid drag would rebuild the grid out from under the
     pointer and cancel the drag. The rebuild waits for the drag to end. */
  if (draggingProject !== null) { dragPending = true; return; }

  var host = document.getElementById('home');
  host.innerHTML = '';

  var inner = el('div','inner');
  var top = el('div','top');
  top.appendChild(el('h2', null, 'Projects'));
  top.appendChild(el('span','grow'));

  var add = el('button','act','Open a project folder');
  add.style.width = 'auto';
  add.style.marginTop = '0';
  add.onclick = function(){ pickFolder(add); };
  top.appendChild(add);

  var refresh = el('button','icon','Refresh');
  refresh.onclick = function(){ overviews = null; renderHome(); loadOverviews(); };
  top.appendChild(refresh);
  inner.appendChild(top);

  inner.appendChild(el('div','sub',
    'Every OpenSpec project you have opened. Click one to work in it.'));

  if (overviews === null) {
    inner.appendChild(el('div','empty','Reading your projects...'));
    host.appendChild(inner);
    loadOverviews();
    return;
  }

  if (!overviews.length) {
    inner.appendChild(el('div','empty','No projects yet. Open a folder to get started.'));
    host.appendChild(inner);
    return;
  }

  inner.appendChild(sortControls());

  var shown = visibleProjects();
  if (!shown.length) {
    inner.appendChild(el('div','empty',
      'No project matches ' + esc(filterText) + '. Clear the filter to see them all.'));
    host.appendChild(inner);
    return;
  }

  var grid = el('div','grid');
  shown.forEach(function(o, index){ grid.appendChild(projectCard(o, index, shown)); });
  inner.appendChild(grid);
  host.appendChild(inner);

  if (pendingFocus) {
    var target = pendingFocus;
    pendingFocus = null;
    focusCard(target);
  }
}

function projectCard(o, index, shown) {
  var starred = isStarred(o.path);
  var arrange = canRearrange() && shown.length > 1;
  var n = el('div','pcard' + (o.path === state.activeProject ? ' current' : '')
    + (arrange ? ' draggable' : ''));
  n.setAttribute('data-path', o.path);

  var head = el('div','ptop');
  head.appendChild(el('div','pname', esc(o.name)));

  var star = isolate(el('button','star' + (starred ? ' on' : ''),
    starred ? '\\u2605' : '\\u2606'));
  star.title = starred
    ? 'Starred. Click to let it sort with the rest.'
    : 'Star this project to keep it on top.';
  star.setAttribute('aria-pressed', starred ? 'true' : 'false');
  star.setAttribute('aria-label', starred ? 'Unstar ' + o.name : 'Star ' + o.name);
  star.onclick = function(e){ e.stopPropagation(); toggleStar(o, !starred); };
  head.appendChild(star);
  n.appendChild(head);

  n.appendChild(el('div','ppath', esc(o.path)));

  if (!o.ok) {
    n.appendChild(el('div','broken', esc(o.message || 'This project could not be read.')));
  } else {
    var stats = el('div','pstats');
    stats.appendChild(el('span', null, '<b>' + o.changes + '</b> changes'));
    stats.appendChild(el('span', null, '<b>' + o.capabilities + '</b> capabilities'));
    if (o.tasksTotal > 0) {
      stats.appendChild(el('span', null, '<b>' + o.tasksCompleted + '/' + o.tasksTotal + '</b> tasks'));
    }
    n.appendChild(stats);

    var lanes = el('div','plane');
    LANES.forEach(function(l){
      if (o.lanes[l]) lanes.appendChild(el('span', null, esc(LABELS[l]) + ' ' + o.lanes[l]));
    });
    if (lanes.childNodes.length) n.appendChild(lanes);

    var foot = el('div','pfoot');
    if (o.syncAvailable) {
      if (o.dirty) foot.appendChild(token('uncommitted','\\u2022', o.dirty, o.dirty + ' change(s) with uncommitted work'));
      if (o.unpushed) foot.appendChild(token('ahead','\\u2191', o.unpushed, o.unpushed + ' change(s) not pushed'));
      if (o.incoming) foot.appendChild(token('behind','\\u2193', o.incoming, o.incoming + ' file(s) waiting on the remote'));
      if (!o.dirty && !o.unpushed && !o.incoming) foot.appendChild(el('span','muted','in sync'));
    } else {
      foot.appendChild(el('span','muted','no git'));
    }
    if (o.lastActivity) {
      foot.appendChild(el('span','muted','last commit ' + ago(o.lastActivity)));
    }
    if (foot.childNodes.length) n.appendChild(foot);
  }

  var footer = el('div','pfoot');

  if (arrange) {
    var move = el('div','move');
    var earlier = isolate(el('button', null, '\\u2190'));
    earlier.title = 'Move earlier. Alt and Left does the same.';
    earlier.setAttribute('aria-label', 'Move ' + o.name + ' earlier');
    earlier.disabled = index === 0 || !sameGroup(o.path, shown[index - 1].path);
    earlier.onclick = function(e){ e.stopPropagation(); moveProject(o.path, -1); };

    var later = isolate(el('button', null, '\\u2192'));
    later.title = 'Move later. Alt and Right does the same.';
    later.setAttribute('aria-label', 'Move ' + o.name + ' later');
    later.disabled = index === shown.length - 1 || !sameGroup(o.path, shown[index + 1].path);
    later.onclick = function(e){ e.stopPropagation(); moveProject(o.path, 1); };

    move.appendChild(earlier);
    move.appendChild(later);
    footer.appendChild(move);
  }

  var remove = isolate(el('button','remove','Remove'));
  remove.title = 'Forget this project. Nothing on disk is touched.';
  remove.onclick = function(e) {
    e.stopPropagation();
    fetch('/api/projects', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: o.path })
    }).then(function(r){ return r.json(); }).then(function(s){
      state = s;
      overviews = overviews.filter(function(x){ return x.path !== o.path; });
      renderHome();
    });
  };
  footer.appendChild(remove);
  n.appendChild(footer);

  n.tabIndex = 0;
  n.setAttribute('role','button');
  n.onclick = function(){ openProject(o.path); };
  n.onkeydown = function(e){
    if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowUp')) {
      e.preventDefault(); moveProject(o.path, -1); return;
    }
    if (e.altKey && (e.key === 'ArrowRight' || e.key === 'ArrowDown')) {
      e.preventDefault(); moveProject(o.path, 1); return;
    }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openProject(o.path); }
  };

  if (arrange) {
    n.draggable = true;
    n.ondragstart = function(e){
      draggingProject = o.path;
      dragPending = false;
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        // Firefox starts no drag at all unless the transfer carries something.
        try { e.dataTransfer.setData('text/plain', o.path); } catch (err) {}
      }
      n.classList.add('dragging');
    };
    n.ondragend = function(){
      draggingProject = null;
      n.classList.remove('dragging');
      clearDropHints();
      if (dragPending) { dragPending = false; renderHome(); }
    };
    n.ondragover = function(e){
      if (draggingProject === null || draggingProject === o.path) return;
      e.preventDefault();
      clearDropHints();

      // A drop that will be refused says so while the pointer is still moving,
      // rather than showing an insertion marker it has no intention of honouring.
      if (!sameGroup(draggingProject, o.path)) {
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
        n.classList.add('nodrop');
        return;
      }

      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      // Which half of the card the pointer is over decides which side of it the
      // dragged project lands on, so the last position is reachable too.
      var box = n.getBoundingClientRect();
      n.classList.add((e.clientX - box.left) > box.width / 2 ? 'dropafter' : 'dropbefore');
    };
    n.ondragleave = function(){
      n.classList.remove('dropbefore');
      n.classList.remove('dropafter');
      n.classList.remove('nodrop');
    };
    n.ondrop = function(e){
      e.preventDefault();
      // The board's own drop handler would otherwise explain that lanes cannot
      // be reordered, which has nothing to do with this.
      e.stopPropagation();
      var source = draggingProject;
      draggingProject = null;
      clearDropHints();
      if (!source || source === o.path) return;
      var box = n.getBoundingClientRect();
      dropProject(source, o.path, (e.clientX - box.left) > box.width / 2);
    };
  }
  return n;
}

/* The first-run view: a folder with no OpenSpec in it yet.
   Both affordances are offered deliberately. Some people want the button, and
   some want to see and run the command themselves, which is also the escape
   hatch when the button fails. */
var initSelection = null;

function renderSetup(failure) {
  var host = document.getElementById('setup');
  host.hidden = false;
  host.innerHTML = '';

  var tools = state.initTools || [];
  if (initSelection === null) {
    initSelection = {};
    tools.forEach(function(t){ if (t.detected) initSelection[t.id] = true; });
  }

  var inner = el('div','inner');
  inner.appendChild(el('h2', null, 'No OpenSpec here yet'));
  inner.appendChild(el('div','path', esc(state.activeProject)));
  inner.appendChild(el('div','muted',
    'Pick the AI tools you use in this project. OpenSpec writes its workflow files for each one, '
    + 'and specdeck uses those to hand work off later. You can change this later by running the '
    + 'command again.'));

  var grid = el('div','tools');
  grid.style.marginTop = '14px';
  tools.forEach(function(t){
    var label = el('label','tool');
    var box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = !!initSelection[t.id];
    box.onchange = function(){ initSelection[t.id] = box.checked; renderSetup(failure); };
    label.appendChild(box);
    label.appendChild(el('span', null, esc(t.label)));
    if (t.detected) label.appendChild(el('span','found','found'));
    if (t.writesOutsideProject) {
      label.appendChild(el('span','warnflag','writes to your home folder'));
      label.title = 'This tool keeps its commands outside the project, in your home directory.';
    }
    grid.appendChild(label);
  });
  inner.appendChild(grid);

  var chosen = tools.filter(function(t){ return initSelection[t.id]; }).map(function(t){ return t.id; });
  var outside = tools.filter(function(t){ return initSelection[t.id] && t.writesOutsideProject; });

  inner.appendChild(el('pre', null,
    esc('openspec init . --tools ' + (chosen.length ? chosen.join(',') : 'none'))));

  if (outside.length) {
    inner.appendChild(el('div','flag warn',
      esc(outside.map(function(t){ return t.label; }).join(', '))
      + ' keeps its files outside this folder, in your home directory.'));
  }

  var go = el('div','go');
  var run = el('button','act','Initialize OpenSpec here');
  run.style.width = 'auto';
  run.onclick = function() {
    run.disabled = true;
    run.textContent = 'Initializing';
    fetch('/api/init', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tools: chosen })
    }).then(function(r){ return r.json(); }).then(function(res){
      state = res.state;
      if (res.ok) { initSelection = null; toast(res.message); }
      else showInitFailure(res);
      render();
    }).catch(function(){ toast('Could not reach specdeck.', true); render(); });
  };
  var copy = el('button', null, 'Copy command');
  copy.onclick = function() {
    var cmd = 'openspec init . --tools ' + (chosen.length ? chosen.join(',') : 'none');
    navigator.clipboard.writeText(cmd).then(function(){ toast('Copied. Run it in ' + state.activeProject); },
      function(){ toast('Could not reach the clipboard.', true); });
  };
  go.appendChild(run);
  go.appendChild(copy);
  go.appendChild(el('span','muted','or run it yourself, either works'));
  inner.appendChild(go);

  host.appendChild(inner);
}

function showInitFailure(res) {
  var host = document.getElementById('modal');
  var back = el('div','modal');
  var sheet = el('div','sheet');
  sheet.appendChild(el('h3', null, 'Initialization did not complete'));
  sheet.appendChild(el('div','muted', esc(res.message)));
  sheet.appendChild(el('pre', null, esc(res.command + '\\n\\nexit code ' + res.exitCode + '\\n\\n' + (res.output || 'no output'))));
  var actions = el('div','actions');
  var close = el('button', null, 'Close');
  close.onclick = function(){ host.innerHTML = ''; };
  actions.appendChild(close);
  sheet.appendChild(actions);
  back.appendChild(sheet);
  back.onclick = function(e){ if (e.target === back) host.innerHTML = ''; };
  host.innerHTML = '';
  host.appendChild(back);
}

/* A change someone else has pushed that this checkout does not have. There is
   no local directory to read, so all specdeck can honestly show is that it
   exists and how to get it. */
function ghostCard(g) {
  var n = el('div','card ghost');
  n.appendChild(el('div','name', esc(g.name)));
  n.appendChild(el('div','meta','on ' + esc((state.sync && state.sync.remoteRef) || 'the remote') +
    ', not in your checkout'));
  var row = el('div','sync');
  row.appendChild(token('behind', '\\u2193', g.fileCount, g.fileCount + ' file(s) you do not have'));
  n.appendChild(row);

  var pull = el('button','act','Pull this into your checkout');
  pull.onclick = function(e){ e.stopPropagation(); openPull(g); };
  n.appendChild(pull);

  n.tabIndex = 0;
  n.setAttribute('role','button');
  n.onclick = function(){ openPull(g); };
  n.onkeydown = function(e){
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPull(g); }
  };
  return n;
}

/* Pulling affects the whole branch, not just the change whose card was clicked,
   so the sheet says so before anything runs. */
function openPull(g) {
  var host = document.getElementById('modal');
  var back = el('div','modal');
  var sheet = el('div','sheet');

  sheet.appendChild(el('h3', null, 'Pull ' + esc(g.name)));
  sheet.appendChild(el('div','muted',
    'This brings your whole branch up to date with '
    + esc((state.sync && state.sync.remoteRef) || 'the remote')
    + ', not just this change. specdeck only fast-forwards, so if your branch has moved too it '
    + 'will stop and tell you rather than creating a merge.'));
  sheet.appendChild(el('pre', null, 'git pull --ff-only'));

  var actions = el('div','actions');
  var copy = el('button', null, 'Copy command');
  copy.onclick = function() {
    navigator.clipboard.writeText('git pull --ff-only').then(function(){ toast('Copied.'); },
      function(){ toast('Could not reach the clipboard.', true); });
  };
  var cancel = el('button', null, 'Cancel');
  cancel.onclick = function(){ host.innerHTML = ''; };
  var go = el('button','act','Pull');
  go.style.width = 'auto';
  go.style.marginTop = '0';
  go.onclick = function() {
    go.disabled = true;
    go.textContent = 'Pulling';
    fetch('/api/pull', { method: 'POST' })
      .then(function(r){ return r.json(); })
      .then(function(res){
        state = res.state;
        host.innerHTML = '';
        if (res.ok) toast(res.message || 'Pulled.');
        else showPullFailure(res);
        render();
      })
      .catch(function(){ host.innerHTML = ''; toast('Could not reach specdeck.', true); });
  };

  actions.appendChild(cancel);
  actions.appendChild(copy);
  actions.appendChild(go);
  sheet.appendChild(actions);

  back.appendChild(sheet);
  back.onclick = function(e){ if (e.target === back) host.innerHTML = ''; };
  host.innerHTML = '';
  host.appendChild(back);
}

/* A failed pull shows git's own output. Paraphrasing it would hide the one
   piece of information that lets someone fix it. */
function showPullFailure(res) {
  var host = document.getElementById('modal');
  var back = el('div','modal');
  var sheet = el('div','sheet');
  sheet.appendChild(el('h3', null, 'The pull did not run'));
  sheet.appendChild(el('div','muted', esc(res.message)));
  if (res.detail) sheet.appendChild(el('pre', null, esc(res.detail)));
  var actions = el('div','actions');
  var close = el('button', null, 'Close');
  close.onclick = function(){ host.innerHTML = ''; };
  actions.appendChild(close);
  sheet.appendChild(actions);
  back.appendChild(sheet);
  back.onclick = function(e){ if (e.target === back) host.innerHTML = ''; };
  host.innerHTML = '';
  host.appendChild(back);
}

/* Capabilities as OpenSpec has accumulated them, with the changes that touch
   each one. A capability a change introduces does not exist here until that
   change is archived, so those are listed separately rather than hidden. */
function renderSpecs(snap, needle) {
  var host = document.getElementById('specs');
  host.innerHTML = '';

  var known = {};
  snap.capabilities.forEach(function(cap){ known[cap.id] = true; });

  var pending = {};
  snap.changes.forEach(function(c){
    (c.capabilities || []).forEach(function(id){
      if (!known[id]) { pending[id] = pending[id] || []; pending[id].push(c.name); }
    });
  });

  var matches = snap.capabilities.filter(function(cap){
    return !needle || cap.id.toLowerCase().indexOf(needle) !== -1;
  });

  if (!matches.length && !Object.keys(pending).length) {
    host.appendChild(el('div','empty','No capabilities yet. They appear here once a change is archived.'));
    return;
  }

  matches.forEach(function(cap){
    var box = el('div','cap');
    box.appendChild(el('h3', null, esc(cap.id)));
    if (cap.purpose) box.appendChild(el('div','purpose', esc(cap.purpose)));
    var users = snap.changes.filter(function(c){ return (c.capabilities || []).indexOf(cap.id) !== -1; });
    if (users.length) {
      box.appendChild(el('div','used','Changed by ' + esc(users.map(function(c){ return c.name; }).join(', '))));
    }
    cap.requirements.forEach(function(r){
      var req = el('div','req');
      req.appendChild(el('div','rname', esc(r.name)));
      if (r.text) req.appendChild(el('div','rtext', esc(r.text)));
      r.scenarios.forEach(function(sc){
        var w = el('div','scn');
        w.appendChild(el('div','sname', esc(sc.name)));
        w.appendChild(el('pre', null, esc(sc.body)));
        req.appendChild(w);
      });
      box.appendChild(req);
    });
    if (!cap.requirements.length) box.appendChild(el('div','empty','No requirements.'));
    host.appendChild(box);
  });

  var pendingIds = Object.keys(pending).filter(function(id){
    return !needle || id.toLowerCase().indexOf(needle) !== -1;
  }).sort();
  if (pendingIds.length) {
    var note = el('div','cap');
    note.appendChild(el('h3', null, 'Not created yet'));
    note.appendChild(el('div','purpose','These capabilities are proposed by active changes and become specs once those changes are archived.'));
    pendingIds.forEach(function(id){
      note.appendChild(el('div','used', esc(id) + ' \\u00b7 from ' + esc(pending[id].join(', '))));
    });
    host.appendChild(note);
  }
}

function copyPayload(payload) {
  navigator.clipboard.writeText(payload).then(
    function(){ toast('Copied. Paste it into your agent.'); },
    function(){ toast('Could not reach the clipboard.', true); });
}

/* The payload is always copied first, whatever method is used. Even the session
   and terminal paths only open a place to paste, because there is no verified
   way to push a message into a running conversation. */
function runDispatch(change, verb, payload, method, sessionId) {
  copyPayload(payload);
  var harness = ((state.harnesses || []).filter(function(h){ return h.state === 'configured'; })[0] || {}).id || '';

  var body = { harness: harness, method: method };
  if (sessionId) body.session = sessionId;

  fetch('/api/handoff', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  }).then(function(r){ return r.json(); }).then(function(res){
    document.getElementById('modal').innerHTML = '';
    // Always says which method was actually used, including on success, so a
    // silent fall through is still visible.
    toast(res.message, !res.ok);
    if (!res.ok && res.detail) showCommandFailure('Handoff did not complete', res);
    if (res.ok && res.method !== 'clipboard') {
      dispatched[change.name] = { method: res.method, verb: verb, at: Date.now() };
      render();
    }
  }).catch(function(){ toast('Could not reach specdeck.', true); });
}

function openHandoff(change, verb) {
  var harnesses = (state && state.harnesses) || [];
  var configured = harnesses.filter(function(h){ return h.state === 'configured'; })[0];
  var command = null;
  if (configured) {
    for (var i = 0; i < configured.commands.length; i++) {
      if (configured.commands[i].indexOf(verb) !== -1) { command = configured.commands[i]; break; }
    }
  }
  var payload = command
    ? command + ' ' + change.name
    : 'Work on the OpenSpec change "' + change.name + '": run openspec status --change '
      + change.name + ' --json, then follow the ' + verb + ' workflow.';

  var note = configured
    ? (command
        ? configured.label + ' has this workflow. Run the command in your session.'
        : configured.label + ' is set up for OpenSpec but has no generated "' + verb + '" command. Paste this instead.')
    : 'No AI tool is wired into OpenSpec here. Paste this into whichever agent you use.';

  var host = document.getElementById('modal');
  var back = el('div','modal');
  var sheet = el('div','sheet');
  sheet.appendChild(el('h3', null, 'Hand off ' + esc(change.name)));
  sheet.appendChild(el('div','muted', esc(note)));
  sheet.appendChild(el('pre', null, esc(payload)));

  var sessions = state.sessions || [];
  var current = (state.config && state.config.defaults && state.config.defaults.handoffMethod) || 'auto';

  // A method with no running session, or no known terminal command, is a
  // capability gap. Those options are simply not offered rather than shown
  // broken.
  var options = [['auto','Automatic']];
  if (sessions.length) options.push(['attach','Send to a running session']);
  options.push(['terminal','Open in a new terminal']);
  options.push(['clipboard','Copy the prompt']);

  var methods = el('div','pills');
  options.forEach(function(pair){
    var b = el('button', current === pair[0] ? 'on' : null, esc(pair[1]));
    b.title = 'How specdeck should hand work to your agent';
    b.onclick = function(){
      fetch('/api/settings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ handoffMethod: pair[0], scope: 'global' })
      }).then(function(r){ return r.json(); }).then(function(s){
        state = s;
        openHandoff(change, verb);
      });
    };
    methods.appendChild(b);
  });
  sheet.appendChild(methods);

  if (sessions.length) {
    var list = el('div','pills');
    sessions.slice(0, 4).forEach(function(s){
      var b = el('button', null, esc(s.name || s.id.slice(0, 8)));
      b.title = 'Open this running session. The prompt is copied, not sent.';
      b.onclick = function(){ runDispatch(change, verb, payload, 'attach', s.id); };
      list.appendChild(b);
    });
    sheet.appendChild(list);
  }

  var actions = el('div','actions');
  var cancel = el('button', null, 'Close');
  cancel.onclick = function(){ host.innerHTML = ''; };
  var copy = el('button', null, 'Copy only');
  copy.onclick = function(){ copyPayload(payload); host.innerHTML = ''; };
  var send = el('button','act','Hand off');
  send.style.width = 'auto';
  send.style.marginTop = '0';
  send.onclick = function(){
    runDispatch(change, verb, payload, current, sessions.length ? sessions[0].id : null);
  };
  actions.appendChild(cancel);
  actions.appendChild(copy);
  actions.appendChild(send);
  sheet.appendChild(actions);

  back.appendChild(sheet);
  back.onclick = function(e){ if (e.target === back) host.innerHTML = ''; };
  host.innerHTML = '';
  host.appendChild(back);
}

function openPanel(c) {
  var panel = document.getElementById('panel');

  // The scrolling element is .abody, not the aside. The aside became a flex
  // column with a fixed header and tab strip when the tabs were stopped from
  // scrolling, which silently moved the scroll to its body. Reading the aside
  // here always returned 0, so every rescan threw the reader back to the top,
  // which is unbearable while an agent is writing files every few seconds.
  var previousBody = panel.querySelector('.abody');
  var scrollTop = previousBody ? previousBody.scrollTop : 0;

  var a = el('aside');

  var head = el('div','ahead');
  var titles = el('div');
  titles.appendChild(el('h2', null, esc(c.name)));
  titles.appendChild(el('div','muted', esc(LABELS[c.lane]) + ' \\u00b7 ' + esc(c.metadata.schema)));
  head.appendChild(titles);
  head.appendChild(el('div','grow'));
  var close = el('button','icon','\\u2715');
  close.title = 'Close (Esc)';
  close.onclick = closePanel;
  head.appendChild(close);
  a.appendChild(head);

  var iss = issuesOf(c);

  /* One tab per section, plus one per capability the change touches. Keeping a
     capability's requirements on their own tab is the difference between
     reading a spec and scrolling past it. */
  var groupStats = taskGroupStats(c);
  var reqTotal = (c.deltaSpecs || []).reduce(function(n, d){ return n + d.requirements.length; }, 0);

  var tabs = [{ id: 'overview', label: 'Overview' }];
  if (c.tasks && c.tasks.total > 0) {
    tabs.push({ id: 'tasks', label: 'Tasks', count: c.tasks.completed + '/' + c.tasks.total });
  }
  if ((c.deltaSpecs || []).length) {
    tabs.push({ id: 'specs', label: 'Specs', count: String(reqTotal) });
  }
  tabs.push({ id: 'timeline', label: 'Timeline' });
  if (iss.length) tabs.push({ id: 'problems', label: 'Problems', count: String(iss.length) });

  var active = activeTab[c.name];
  if (!active || !tabs.some(function(t){ return t.id === active; })) active = tabs[0].id;

  var strip = el('div','tabs');
  tabs.forEach(function(t){
    var b = el('button', t.id === active ? 'on' : null,
      esc(t.label) + (t.count ? '<span class="n">' + esc(t.count) + '</span>' : ''));
    b.onclick = function(){ activeTab[c.name] = t.id; openPanel(c); };
    strip.appendChild(b);
  });
  a.appendChild(strip);

  var body = el('div','abody');

  if (active === 'overview') {
    body.appendChild(el('h3', null, 'Details'));
    if (c.metadata.created) body.appendChild(el('div','row','<b>Created</b><span>' + esc(c.metadata.created) + '</span>'));
    if (c.archivedOn) body.appendChild(el('div','row','<b>Archived</b><span>' + esc(c.archivedOn) + '</span>'));
    body.appendChild(el('div','row','<b>Schema</b><span>' + esc(c.metadata.schema) + '</span>'));
    if (c.capabilities && c.capabilities.length) {
      body.appendChild(el('div','row','<b>Capabilities</b><span>' + esc(c.capabilities.join(', ')) + '</span>'));
    }
    body.appendChild(el('div','row','<b>Folder</b><code>' + esc(c.dir) + '</code>'));

    body.appendChild(el('h3', null, 'Artifacts'));
    (c.artifacts || []).forEach(function(x){
      var row = el('div','art');
      row.appendChild(el('span','aname', esc(x.id)));
      var extra = x.status === 'blocked' && x.missingDeps.length
        ? ' waiting on ' + x.missingDeps.join(', ') : '';
      row.appendChild(el('span','muted', esc(x.status + extra)));

      // Per-artifact sync state, which the card rolls up to a count.
      var fileState = (state.sync && state.sync.files) || {};
      (x.existingPaths || []).forEach(function(abs){
        var key = Object.keys(fileState).filter(function(rel){
          return abs.split(String.fromCharCode(92)).join('/').indexOf(rel) !== -1;
        })[0];
        if (!key) return;
        var kind = fileState[key];
        var glyph = kind === 'uncommitted' ? '•' : (kind === 'ahead' ? '↑' : '↓');
        row.appendChild(token(kind, glyph, '', kind));
      });

      row.appendChild(el('span','grow2'));
      if (x.existingPaths && x.existingPaths.length) {
        var open = el('button','icon','Open');
        open.title = 'Open in your editor';
        open.onclick = function(){ openFile(x.existingPaths[0]); };
        row.appendChild(open);
      }
      body.appendChild(row);
    });
    if (!c.artifacts || !c.artifacts.length) body.appendChild(el('div','empty','No schema resolved.'));
  }

  if (active === 'tasks' && c.tasks) {
    var stats = el('div','stats');
    stats.appendChild(statBox('Task groups', groupStats.done, groupStats.total));
    stats.appendChild(statBox('Tasks', c.tasks.completed, c.tasks.total));
    body.appendChild(stats);

    var th = el('h3', null, 'Breakdown');
    th.style.display = 'flex';
    th.style.alignItems = 'center';
    th.style.gap = '8px';
    th.appendChild(el('span','grow'));
    var expandAll = el('button','icon','Expand all');
    expandAll.style.textTransform = 'none';
    expandAll.style.letterSpacing = '0';
    expandAll.onclick = function(){ setAllGroups(c, true); };
    var collapseAll = el('button','icon','Collapse all');
    collapseAll.style.textTransform = 'none';
    collapseAll.style.letterSpacing = '0';
    collapseAll.onclick = function(){ setAllGroups(c, false); };
    th.appendChild(expandAll);
    th.appendChild(collapseAll);
    body.appendChild(th);

    c.tasks.groups.forEach(function(g, index){ body.appendChild(taskGroup(c, g, index)); });
  }

  if (active === 'specs') {
    var specs = c.deltaSpecs || [];
    var chosen = activeCapability[c.name];
    if (chosen && !specs.some(function(d){ return d.capability === chosen; })) chosen = null;

    var pills = el('div','pills');
    var all = el('button', chosen ? null : 'on', 'All<span class="n">' + specs.length + '</span>');
    all.onclick = function(){ activeCapability[c.name] = null; openPanel(c); };
    pills.appendChild(all);
    specs.forEach(function(d){
      var b = el('button', chosen === d.capability ? 'on' : null,
        esc(d.capability) + '<span class="n">' + d.requirements.length + '</span>');
      b.onclick = function(){ activeCapability[c.name] = d.capability; openPanel(c); };
      pills.appendChild(b);
    });
    body.appendChild(pills);

    specs
      .filter(function(d){ return !chosen || d.capability === chosen; })
      .forEach(function(d){
        body.appendChild(el('h3', null, esc(d.capability) + ' \\u00b7 ' + d.requirements.length + ' requirements'));
        d.requirements.forEach(function(r){
          var box = el('div','req');
          box.appendChild(el('div','op', esc(r.operation)));
          box.appendChild(el('div','rname', esc(r.name)));
          if (r.text) box.appendChild(el('div','rtext', esc(r.text)));
          r.scenarios.forEach(function(sc){
            var w = el('div','scn');
            w.appendChild(el('div','sname', esc(sc.name)));
            w.appendChild(el('pre', null, esc(sc.body)));
            box.appendChild(w);
          });
          sd(box, r);
          body.appendChild(box);
        });
        if (!d.requirements.length) body.appendChild(el('div','empty','No requirements parsed.'));
      });
  }

  if (active === 'timeline') {
    body.appendChild(el('h3', null, 'Timeline'));
    var entry = historyByChange && historyByChange.changes ? historyByChange.changes[c.name] : undefined;

    if (historyByChange === null) {
      body.appendChild(el('div','empty','Reading git history...'));
      loadHistory(c);
    } else if (!historyByChange.available) {
      body.appendChild(el('div','muted', esc(historyByChange.reason || 'Git history is unavailable.')));
      if (c.metadata.created) {
        body.appendChild(el('div','row','<b>Created</b><span>' + esc(c.metadata.created)
          + ' <span class="muted">from .openspec.yaml, date only</span></span>'));
      }
    } else if (entry === undefined) {
      body.appendChild(el('div','muted',
        'Nothing in this change has been committed yet, so there is no history to read.'));
      if (c.metadata.created) {
        body.appendChild(el('div','row','<b>Created</b><span>' + esc(c.metadata.created) + '</span>'));
      }
    } else {
      body.appendChild(el('div','row','<b>First worked</b><span>' + esc(entry.firstWorked.replace('T',' ').slice(0,16))
        + ' <span class="muted">' + ago(entry.firstWorked) + '</span></span>'));
      body.appendChild(el('div','row','<b>Last worked</b><span>' + esc(entry.lastWorked.replace('T',' ').slice(0,16))
        + ' <span class="muted">' + ago(entry.lastWorked) + '</span></span>'));
      body.appendChild(el('div','row','<b>Commits</b><span>' + entry.commits + '</span>'));
      var elapsed = Math.round(
        (new Date(entry.lastWorked).getTime() - new Date(entry.firstWorked).getTime()) / 86400000);
      body.appendChild(el('div','row','<b>Elapsed</b><span>' + (elapsed < 1 ? 'under a day' : elapsed + ' days') + '</span>'));
    }

    body.appendChild(el('h3', null, 'Task completions'));
    var events = taskHistory[c.name];
    if (events === undefined) {
      body.appendChild(el('div','empty','Reading task history...'));
      loadTaskHistory(c);
    } else if (!events.available) {
      body.appendChild(el('div','muted', esc(events.reason || 'No task history available.')));
    } else if (!events.events.length) {
      body.appendChild(el('div','muted','No tasks have been ticked in a commit yet.'));
    } else {
      var tl = el('div','tl');
      events.events.forEach(function(ev){
        var row = el('div','ev');
        row.appendChild(el('div', null, esc((ev.id ? ev.id + ' ' : '') + ev.text)));
        row.appendChild(el('div','when', esc(ev.when.replace('T',' ').slice(0,16)) + ' · ' + ago(ev.when)));
        tl.appendChild(row);
      });
      body.appendChild(tl);
    }
  }

  if (active === 'problems') {
    body.appendChild(el('h3', null, 'Problems'));
    iss.forEach(function(i){
      body.appendChild(el('div','flag ' + (i.severity === 'error' ? 'err' : 'warn'),
        esc(i.message) + (i.line ? ' <span class="muted">line ' + i.line + '</span>' : '')));
    });
  }

  a.appendChild(body);
  panel.innerHTML = '';
  panel.appendChild(a);

  // Restore onto the element that actually scrolls, and only after it is in the
  // document, since an element with no layout cannot take a scroll position.
  body.scrollTop = scrollTop;
}

/* A group counts as done only when it has tasks and every one is ticked, which
   is the same rule that decides whether it collapses by default. */
function taskGroupStats(change) {
  var groups = (change.tasks && change.tasks.groups) || [];
  var done = groups.filter(function(g){
    return g.tasks.length > 0 && g.tasks.every(function(t){ return t.completed; });
  }).length;
  return { done: done, total: groups.length };
}

function statBox(label, done, total) {
  var box = el('div','stat');
  box.appendChild(el('div','k', esc(label)));
  box.appendChild(el('div','v', done + '<small>/' + total + '</small>'));
  var bar = el('div','bar');
  var fill = el('i');
  fill.style.width = (total > 0 ? Math.round(100 * done / total) : 0) + '%';
  bar.appendChild(fill);
  box.appendChild(bar);
  return box;
}

/* Removed and renamed requirements carry fields that only exist in a delta. */
function sd(box, r) {
  if (r.reason) box.appendChild(el('div','rtext','Reason: ' + esc(r.reason)));
  if (r.migration) box.appendChild(el('div','rtext','Migration: ' + esc(r.migration)));
  if (r.renamedFrom || r.renamedTo) {
    box.appendChild(el('div','rtext', esc(r.renamedFrom || '?') + ' \\u2192 ' + esc(r.renamedTo || '?')));
  }
}

function taskGroup(change, g, index) {
  var open = isGroupOpen(change.name, index, g);
  var total = g.tasks.length;
  var done = g.tasks.filter(function(t){ return t.completed; }).length;

  var wrap = el('div','tgroup' + (open ? ' open' : ''));

  var head = el('button','thead');
  head.appendChild(el('span','caret','\\u25b6'));
  head.appendChild(el('span', null, esc((g.number ? g.number + '. ' : '') + g.title)));
  head.appendChild(el('span','tcount' + (total > 0 && done === total ? ' tdone' : ''),
    done + '/' + total));
  head.onclick = function() {
    setGroupOpen(change.name, index, !wrap.classList.contains('open'));
    wrap.classList.toggle('open');
  };
  wrap.appendChild(head);

  var tasksPath = tasksFileOf(change);

  var list = el('div','tlist');
  g.tasks.forEach(function(t){
    var row = el('button','task' + (t.completed ? ' done' : ''));
    row.appendChild(el('span','box', t.completed ? '\\u2713' : '\\u25cb'));
    if (t.id) row.appendChild(el('span','tid', esc(t.id)));
    row.appendChild(el('span', null, esc(t.text)));
    row.title = tasksPath ? 'Click to toggle in tasks.md' : 'No tasks file resolved';
    if (tasksPath) row.onclick = function(){ toggleTask(row, tasksPath, t); };
    list.appendChild(row);
  });
  wrap.appendChild(list);
  return wrap;
}

/* The tasks file comes from the artifact the schema tracks, so a project using
   a schema that tracks something other than tasks.md still works. */
function tasksFileOf(change) {
  var found = null;
  (change.artifacts || []).forEach(function(a){
    (a.existingPaths || []).forEach(function(p){
      if (/tasks\\.md$/i.test(p)) found = p;
    });
  });
  return found;
}

/* No optimistic update. The write happens, then the watcher reports it, then the
   board re-renders. A refused write therefore leaves the box exactly where it
   was, which is the correct outcome when an agent has edited the file. */
function toggleTask(row, tasksPath, task) {
  row.classList.add('busy');
  fetch('/api/task/toggle', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      path: tasksPath, line: task.line, text: task.text, completed: !task.completed
    })
  }).then(function(r){ return r.json().then(function(b){ return { status: r.status, body: b }; }); })
    .then(function(res){
      row.classList.remove('busy');
      if (res.status !== 200) toast(res.body.message || res.body.error || 'Could not update the task.', true);
    })
    .catch(function(){ row.classList.remove('busy'); toast('Could not reach specdeck.', true); });
}

function setAllGroups(change, open) {
  change.tasks.groups.forEach(function(_g, index){ setGroupOpen(change.name, index, open); });
  openPanel(change);
}

function closePanel() {
  selected = null;
  document.getElementById('panel').innerHTML = '';
  render();
}

function tick() {
  document.getElementById('scan').textContent = 'scanned ' + ago(scannedAt);
}

function load() {
  fetch('/api/state').then(function(r){ return r.json(); }).then(function(s){
    state = s;
    render();
  });
}

document.getElementById('filter').addEventListener('input', function(e){
  filterText = e.target.value.trim();
  render();
});
document.getElementById('themeBtn').onclick = cycleTheme;
document.getElementById('brand').onclick = function(){ goHome(); };
document.getElementById('viewHome').onclick = function(){ goHome(); };
document.getElementById('viewSettings').onclick = function(){ switchView('settings'); };
document.getElementById('viewBoard').onclick = function(){ switchView('board'); };
document.getElementById('viewSpecs').onclick = function(){ switchView('specs'); };
document.addEventListener('dragover', function(e){ e.preventDefault(); });
document.addEventListener('drop', function(e){
  e.preventDefault();
  // A drop anywhere other than the archive zone is rejected. Lanes are derived
  // from files, so moving a card between them would be undone on the next read.
  if (dragging) {
    toast('Lanes come from your files, so cards cannot be moved between them. Only Archive is a real action.');
    dragging = null;
    render();
  }
});
document.addEventListener('mouseup', function(){
  if (dragHint) {
    dragHint = null;
  }
});

document.addEventListener('keydown', function(e){
  if (e.key === 'Escape') {
    var modal = document.getElementById('modal');
    if (modal.firstChild) { modal.innerHTML = ''; return; }
    closePanel();
  }
  if (e.key === '/' && document.activeElement.tagName !== 'INPUT') {
    e.preventDefault();
    document.getElementById('filter').focus();
  }
});

applyTheme(currentTheme());
var events = new EventSource('/api/events');
events.addEventListener('change', load);
load();
setInterval(tick, 1000);
</script>
</body>
</html>`;
