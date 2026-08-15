// One-shot: splits the legacy single-file client into src/client/ sources.
// Reads the compiled module so the extracted text is byte-identical to what the
// server was serving, rather than a regex guess at the template literal.
import { writeFileSync } from 'node:fs';

const { APP_HTML } = await import('../dist/server/app-html.js');

const styleOpen = APP_HTML.indexOf('<style>');
const styleClose = APP_HTML.indexOf('</style>');
const scriptOpen = APP_HTML.indexOf('<script>');
const scriptClose = APP_HTML.indexOf('</script>');

const styles = APP_HTML.slice(styleOpen + '<style>'.length, styleClose);
const script = APP_HTML.slice(scriptOpen + '<script>'.length, scriptClose);

const shell =
  APP_HTML.slice(0, styleOpen + '<style>'.length) +
  '\n/*STYLES*/\n' +
  APP_HTML.slice(styleClose, scriptOpen + '<script>'.length) +
  '\n/*SCRIPT*/\n' +
  APP_HTML.slice(scriptClose);

const tidy = (text) => text.replace(/^\n+/, '').replace(/\s+$/, '') + '\n';

writeFileSync('src/client/styles.css', tidy(styles), 'utf8');
writeFileSync('src/client/app.js', tidy(script), 'utf8');
writeFileSync('src/client/shell.html', shell, 'utf8');

console.log('styles', styles.length, 'script', script.length, 'shell', shell.length);
console.log('backslash escapes in script:', (script.match(/\\/g) ?? []).length);
console.log('template literals in script:', (script.match(/`/g) ?? []).length);
