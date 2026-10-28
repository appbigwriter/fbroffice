// Registro próprio do FBR pelo fluxo público SIWC para aplicativos open source.
// Não lê auth.json do Codex. Endpoints fixos; erros nunca incluem tokens/respostas.
import { createHash, createPublicKey, randomBytes, randomUUID, verify } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { userInfo } from 'node:os';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { tr } from '../../shared/i18n';

const ISSUER = 'https://auth.openai.com';
export const RESOURCE = 'https://api.openai.com/v1';
const TOKEN_ENDPOINT = `${ISSUER}/api/accounts/oauth/token`;
export interface SiwcSession {
  client_id: string; subject: string; email?: string; ext_agent_host_id: string;
  access_token: string; refresh_token: string; id_token: string; scopes: string[];
  saved_at: number; expires_at: number;
}
export function writePrivate(file: string, value: unknown): void {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${randomUUID()}.tmp`;
  writeFileSync(tmp, '', { mode: 0o600, flag: 'wx' });
  try {
    // chmod sozinho não restringe ACLs do Windows. Protege antes de gravar o segredo.
    if (process.platform === 'win32') execFileSync('icacls.exe', [tmp, '/inheritance:r', '/grant:r', `${userInfo().username}:(F)`], { stdio: 'ignore', windowsHide: true });
    writeFileSync(tmp, JSON.stringify(value));
    renameSync(tmp, file); chmodSync(file, 0o600);
  } catch { rmSync(tmp, { force: true }); throw new Error(tr('Não foi possível proteger o arquivo de configuração.')); }
}
export function hostId(file: string): string {
  if (existsSync(file)) {
    const id: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (typeof id !== 'string' || !/^urn:uuid:[a-f0-9-]{36}$/i.test(id)) throw new Error(tr('Identificador do servidor inválido.'));
    return id;
  }
  const id = `urn:uuid:${randomUUID()}`; writePrivate(file, id); return id;
}
export function readSession(file: string): SiwcSession | undefined {
  if (!existsSync(file)) return undefined;
  const s = JSON.parse(readFileSync(file, 'utf8')) as SiwcSession;
  if (!s || typeof s.client_id !== 'string' || s.client_id === 'dynamic_agent_client' || !s.client_id.startsWith('oaiapp_') ||
    !s.subject || !s.access_token || !s.refresh_token || !s.id_token || !Array.isArray(s.scopes) || !Number.isFinite(s.expires_at)) {
    throw new Error(tr('Credencial FBR inválida. Autorize novamente.'));
  }
  return s;
}
export function beginLogin(host: string, redirect: string, previous?: SiwcSession) {
  const target = new URL(redirect);
  if (target.protocol !== 'http:' || target.hostname !== '127.0.0.1' || target.pathname !== '/auth/callback' || target.search || target.hash) throw new Error(tr('Callback de autorização inválido.'));
  if (!/^urn:uuid:[a-f0-9-]{36}$/i.test(host)) throw new Error(tr('Identificador do servidor inválido.'));
  const state = randomBytes(32).toString('base64url'), nonce = randomBytes(32).toString('base64url'), verifier = randomBytes(48).toString('base64url');
  const client = previous?.client_id ?? 'dynamic_agent_client';
  const url = new URL(`${ISSUER}/api/accounts/authorize`);
  for (const [key, value] of Object.entries({ client_id: client, ext_agent_host_id: host, response_type: 'code', redirect_uri: redirect,
    scope: 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct', resource: RESOURCE, state, nonce,
    code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url') })) url.searchParams.set(key, value);
  if (!previous) url.searchParams.set('agent_name_hint', 'FBR News Office');
  // Não enviamos id_token_hint: URLs exibidas ao usuário não contêm credenciais.
  return { url: url.toString(), state, nonce, verifier, redirect, client, host, subject: previous?.subject, expires: Date.now() + 10 * 60_000 };
}
type Attempt = ReturnType<typeof beginLogin>;
export function callbackCode(attempt: Attempt, url: URL) {
  if (Date.now() > attempt.expires || url.pathname !== '/auth/callback' || url.searchParams.get('state') !== attempt.state) throw new Error(tr('Autorização expirada ou estado inválido.'));
  if (url.searchParams.has('error')) throw new Error(tr('Autorização recusada.'));
  const client = url.searchParams.get('client_id') || attempt.client;
  if (!client.startsWith('oaiapp_') || (attempt.client !== 'dynamic_agent_client' && client !== attempt.client)) throw new Error(tr('Registro da aplicação incompleto ou diferente do esperado.'));
  const code = url.searchParams.get('code');
  if (!code || code.length > 4096) throw new Error(tr('Código de autorização ausente.'));
  return { client, code };
}
async function jsonFetch(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(tr('A autorização OpenAI falhou (HTTP {0}).', [response.status]));
  return await response.json() as Record<string, unknown>;
}
export async function verifyIdentity(jwt: string, client: string, nonce?: string, expectedSubject?: string, keys?: Record<string, unknown>[]) {
  const parts = jwt.split('.');
  if (parts.length !== 3) throw new Error(tr('Identidade OpenAI inválida.'));
  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as Record<string, unknown>;
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new Error(tr('Assinatura de identidade não suportada.'));
  const jwks = keys ?? (await jsonFetch(`${ISSUER}/.well-known/jwks.json`)).keys as Record<string, unknown>[];
  const key = Array.isArray(jwks) ? jwks.find(k => k.kid === header.kid && k.kty === 'RSA' && (!k.use || k.use === 'sig') && (!k.alg || k.alg === 'RS256')) : undefined;
  if (!key || !verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({ key, format: 'jwk' }), Buffer.from(parts[2], 'base64url'))) throw new Error(tr('Assinatura da identidade inválida.'));
  const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<string, unknown>;
  const now = Date.now() / 1000;
  if (claims.iss !== ISSUER || !(claims.aud === client || (Array.isArray(claims.aud) && claims.aud.includes(client))) ||
    typeof claims.exp !== 'number' || claims.exp <= now - 5 || typeof claims.iat !== 'number' || claims.iat > now + 5 ||
    (typeof claims.nbf === 'number' && claims.nbf > now + 5) || (nonce !== undefined && claims.nonce !== nonce) ||
    typeof claims.sub !== 'string' || !claims.sub || (expectedSubject !== undefined && claims.sub !== expectedSubject)) throw new Error(tr('Identidade ou permissão da conta não confere.'));
  return { subject: claims.sub, email: typeof claims.email === 'string' ? claims.email : undefined };
}
async function tokenRequest(params: Record<string, string>) {
  return jsonFetch(TOKEN_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ...params, resource: RESOURCE }) });
}
function sessionFromToken(data: Record<string, unknown>, identity: { subject: string; email?: string }, client: string, host: string, old?: SiwcSession): SiwcSession {
  const scopes = typeof data.scope === 'string' ? data.scope.split(/\s+/) : old?.scopes ?? [];
  if (!scopes.includes('chatgpt.tokens.use.direct') || !scopes.includes('resource.invoke') || typeof data.access_token !== 'string' || typeof data.refresh_token !== 'string' || data.token_type?.toString().toLowerCase() !== 'bearer' || typeof data.expires_in !== 'number' || data.expires_in <= 0) throw new Error(tr('Uso da assinatura não foi autorizado.'));
  return { client_id: client, ...identity, ext_agent_host_id: host, access_token: data.access_token, refresh_token: data.refresh_token,
    id_token: typeof data.id_token === 'string' ? data.id_token : old?.id_token ?? '', scopes, saved_at: Date.now(), expires_at: Date.now() + data.expires_in * 1000 };
}
export async function finishLogin(attempt: Attempt, callback: URL): Promise<SiwcSession> {
  const { client, code } = callbackCode(attempt, callback);
  const data = await tokenRequest({ grant_type: 'authorization_code', client_id: client, code, code_verifier: attempt.verifier, redirect_uri: attempt.redirect });
  if (typeof data.id_token !== 'string') throw new Error(tr('Identidade OpenAI ausente.'));
  const identity = await verifyIdentity(data.id_token, client, attempt.nonce, attempt.subject);
  return sessionFromToken(data, identity, client, attempt.host);
}
export class SiwcStore {
  private refreshing?: Promise<SiwcSession>;
  constructor(readonly file: string, readonly host: string) {}
  read() { const s = readSession(this.file); if (s && s.ext_agent_host_id !== this.host) throw new Error(tr('A credencial pertence a outro servidor.')); return s; }
  async access(): Promise<SiwcSession> {
    const s = this.read();
    if (!s) throw new Error(tr('Autorize sua assinatura ChatGPT primeiro.'));
    if (!s.scopes.includes('chatgpt.tokens.use.direct')) throw new Error(tr('Uso da assinatura não foi autorizado.'));
    if (s.expires_at > Date.now() + 120_000) return s;
    if (!this.refreshing) this.refreshing = this.refresh(s).finally(() => { this.refreshing = undefined; });
    return this.refreshing;
  }
  private async refresh(s: SiwcSession) {
    const data = await tokenRequest({ grant_type: 'refresh_token', client_id: s.client_id, refresh_token: s.refresh_token });
    const identity = typeof data.id_token === 'string' ? await verifyIdentity(data.id_token, s.client_id, undefined, s.subject) : { subject: s.subject, email: s.email };
    const next = sessionFromToken(data, identity, s.client_id, this.host, s); writePrivate(this.file, next); return next;
  }
}
