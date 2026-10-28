// Reúne os avisos dos pacotes realmente instalados, sem executar código de dependências.
import { readFileSync, readdirSync, statSync, existsSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
const missing = [];
const fallback = (name) => name.startsWith('@esbuild/') ? 'esbuild' : name.startsWith('@rolldown/binding-') ? 'rolldown' : ['@xterm/headless', '@xterm/addon-serialize'].includes(name) ? '@xterm/xterm' : undefined;
const notices = (dir) => readdirSync(dir).filter((name) => /^(licen[cs]e|copying|notice|ofl)([.-]|$)/i.test(name) && statSync(join(dir, name)).isFile());
const blocks = [];
for (const path of Object.keys(lock.packages).filter(Boolean).sort()) {
  const dir = join(root, path);
  if (!existsSync(join(dir, 'package.json'))) continue;
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  let source = dir;
  let files = notices(source);
  const related = fallback(pkg.name);
  if (!files.length && related) { source = join(root, 'node_modules', related); files = notices(source); }
  if (!files.length) { missing.push(`${pkg.name}@${pkg.version}`); continue; }
  const repository = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
  blocks.push([`${pkg.name}@${pkg.version}`, `License: ${typeof pkg.license === 'string' ? pkg.license : JSON.stringify(pkg.license)}`, repository ? `Source: ${repository}` : '', related && source !== dir ? `License notice supplied by the same upstream project: ${related}` : '', ...files.map((file) => `\n--- ${file} ---\n${readFileSync(join(source, file), 'utf8')}`)].filter(Boolean).join('\n'));
}
if (missing.length) throw new Error(`Pacotes sem aviso de licença: ${missing.join(', ')}`);
const codexNotices = join(root, 'vendor/codex');
if (existsSync(codexNotices)) blocks.push(['OpenAI Codex 0.165.0 (server image)', 'Source: https://github.com/openai/codex/tree/rust-v0.165.0', ...notices(codexNotices).map(file => `\n--- ${file} ---\n${readFileSync(join(codexNotices, file), 'utf8')}`)].join('\n'));
const output = `Third-party notices — FBR News Office\n\nGenerated from installed packages recorded in package-lock.json.\nThe following components retain their own licenses and copyrights.\nThis inventory includes development tools; not every listed component is shipped at runtime.\n\n${blocks.join('\n\n' + '='.repeat(72) + '\n\n')}\n`;
writeFileSync(join(root, 'THIRD_PARTY_NOTICES.txt'), output);
const target = join(root, 'client/public/legal');
mkdirSync(target, { recursive: true });
for (const [source, destination] of [['LICENSE', 'LICENSE.txt'], ['NOTICE', 'NOTICE.txt'], ['THIRD_PARTY_NOTICES.txt', 'THIRD_PARTY_NOTICES.txt']]) copyFileSync(join(root, source), join(target, destination));
console.log(`Avisos de licença preparados: ${blocks.length} pacotes.`);
