// Executado por root apenas no caminho privado fixo do navegador da VM.
import { constants, openSync, fstatSync, readFileSync, closeSync, existsSync, chownSync } from 'node:fs';
import { readSession, verifyIdentity, writePrivate } from '../server/hosted/siwc';
import { tr } from '../shared/i18n';

const source = '/var/lib/fbroffice-browser/credentials-siwc.json';
const destination = '/srv/fbr-office/credentials-siwc.json';
try {
  const fd = openSync(source, constants.O_RDONLY | constants.O_NOFOLLOW);
  let session;
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > 65536 || stat.uid !== Number(process.env.FBR_BROWSER_UID) || (stat.mode & 0o077)) throw Error('invalid file');
    session = JSON.parse(readFileSync(fd, 'utf8'));
  } finally { closeSync(fd); }
  const expectedHost = JSON.parse(readFileSync('/srv/fbr-office/fbr-host-id.json', 'utf8'));
  if (!session || typeof session.subject !== 'string' || !session.subject || session.ext_agent_host_id !== expectedHost || typeof session.client_id !== 'string' || !session.client_id.startsWith('oaiapp_') || typeof session.id_token !== 'string' || typeof session.access_token !== 'string' || typeof session.refresh_token !== 'string' || !Array.isArray(session.scopes) || !session.scopes.includes('chatgpt.tokens.use.direct') || !session.scopes.includes('resource.invoke') || !Number.isFinite(session.expires_at) || session.expires_at <= Date.now()) throw Error('invalid registration');
  await verifyIdentity(session.id_token, session.client_id, undefined, session.subject);
  const old = existsSync(destination) ? readSession(destination) : undefined;
  if (old && (old.subject !== session.subject || old.client_id !== session.client_id)) throw Error('different account');
  writePrivate(destination, session); chownSync(destination, 1000, 1000);
  console.log(tr('FBR: autorização verificada e instalada na VM.'));
} catch { console.error(tr('FBR: não foi possível validar/importar a autorização. Nenhuma credencial foi exibida.')); process.exitCode = 1; }
