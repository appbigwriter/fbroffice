import { homedir } from 'node:os';
import { join } from 'node:path';
import { hashPassword } from '../server/remote/password';
import { writePrivate } from '../server/hosted/siwc';
import { tr } from '../shared/i18n';

function hidden(label: string): Promise<string> {
  if (!process.stdin.isTTY) return Promise.reject(new Error(tr('Execute em um terminal interativo.')));
  process.stdout.write(label + ' '); process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.setEncoding('utf8');
  return new Promise((ok, fail) => {
    let value = '';
    const done = () => { process.stdin.off('data', data); process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write('\n'); };
    const data = (chunk: string) => { for (const c of chunk) {
      if (c === '\u0003') { done(); fail(new Error(tr('Operação cancelada.'))); return; }
      if (c === '\r' || c === '\n') { done(); ok(value); return; }
      if (c === '\u007f' || c === '\b') value = value.slice(0, -1); else if (c >= ' ') value += c;
    } };
    process.stdin.on('data', data);
  });
}
try {
  const password = await hidden(tr('Senha do administrador (mínimo de 12 caracteres):'));
  const again = await hidden(tr('Repita a senha:'));
  if (password.length < 12 || password !== again) throw new Error(tr('As senhas devem coincidir e ter pelo menos 12 caracteres.'));
  const file = join(homedir(), '.config', 'fbr-office', 'server-env.json');
  writePrivate(file, { FBR_HOSTED: '1', FBR_ADMIN_USER: 'fbr', FBR_ADMIN_PASSWORD_HASH: await hashPassword(password) });
  console.log(tr('Configuração protegida salva em {0}. Copie os valores para o Environment do Easypanel.', [file]));
} catch (err) { console.error(err instanceof Error ? err.message : tr('Não foi possível configurar o administrador.')); process.exitCode = 1; }
