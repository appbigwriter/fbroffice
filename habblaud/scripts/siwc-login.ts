// Login explícito do usuário; apenas callback em loopback. Nunca copia a sessão do Codex.
import http from 'node:http';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { beginLogin, finishLogin, hostId, readSession, SiwcError, writePrivate } from '../server/hosted/siwc';
import { tr } from '../shared/i18n';

const args = process.argv.slice(2);
const value = (flag: string) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
const output = resolve(value('--output') ?? join(homedir(), '.config', 'fbr-office', 'credentials-siwc.json'));
const host = value('--host-id') ?? hostId(join(homedir(), '.config', 'fbr-office', 'host-id.json'));
const previous = readSession(output);
const registrationFile = output + '.registration.json';
const registration = existsSync(registrationFile) ? JSON.parse(readFileSync(registrationFile, 'utf8')) as { client_id: string; host: string } : undefined;
if (registration && (registration.host !== host || !/^oaiapp_[a-zA-Z0-9_-]{1,200}$/.test(registration.client_id))) throw new SiwcError(tr('Registro da aplicação incompleto ou diferente do esperado.'));
const minutes = Number(value('--timeout-minutes') ?? '10');
if (!Number.isInteger(minutes) || minutes < 1 || minutes > 30) throw new SiwcError(tr('Autorização expirada ou estado inválido.'));
const timeoutMs = minutes * 60_000;
if (previous && previous.ext_agent_host_id !== host) throw new Error(tr('A credencial pertence a outro servidor.'));
let handling = false;
let attempt: ReturnType<typeof beginLogin>;
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer');
  if (url.pathname !== '/auth/callback' || req.method !== 'GET') { res.writeHead(404); res.end(); return; }
  if (handling || url.searchParams.get('state') !== attempt.state) { res.writeHead(400); res.end(tr('Estado de autorização inválido.')); return; }
  handling = true;
  try {
    const session = await finishLogin(attempt, url, client => writePrivate(registrationFile, { client_id: client, host })); writePrivate(output, session);
    res.end(tr('FBR autorizado. Pode fechar esta aba.'));
    console.log(tr('Credencial FBR salva em {0}. Não envie esse arquivo no chat ou ao GitHub.', [output]));
  } catch (error) {
    const message = error instanceof SiwcError ? error.message : tr('A autorização falhou. Execute o login novamente.');
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(message); console.error(message); process.exitCode = 1;
    if (error instanceof SiwcError && error.diagnostic) console.error(JSON.stringify(error.diagnostic));
  }
  finally { clearTimeout(timer); server.close(); }
});
const timer = setTimeout(() => { console.error(tr('O login expirou. Execute novamente.')); process.exitCode = 1; server.close(); }, timeoutMs);
server.on('error', () => { clearTimeout(timer); console.error(tr('Não foi possível iniciar o callback local.')); process.exitCode = 1; });
server.listen(0, '127.0.0.1', () => {
  const address = server.address(); if (!address || typeof address === 'string') return;
  attempt = beginLogin(host, `http://127.0.0.1:${address.port}/auth/callback`, previous ?? registration, timeoutMs);
  console.log(tr('Continue com ChatGPT: abra o endereço abaixo no navegador.'));
  console.log(attempt.url);
});
