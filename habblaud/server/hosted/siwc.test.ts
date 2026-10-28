import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { beginLogin, callbackCode, finishLogin, hostId, SiwcStore, verifyIdentity, writePrivate, type SiwcSession } from './siwc';
import { githubRepository } from './service';

const dirs: string[] = [];
afterEach(() => { vi.unstubAllGlobals(); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const host = 'urn:uuid:11111111-1111-4111-8111-111111111111';
describe('SIWC próprio para VM', () => {
  it('retém o cliente emitido mesmo se a troca falhar e mostra apenas diagnóstico permitido', async () => {
    const attempt = beginLogin(host, 'http://127.0.0.1:3456/auth/callback');
    const callback = new URL(attempt.redirect);
    callback.search = new URLSearchParams({ state: attempt.state, code: 'one-use-test-code', client_id: 'oaiapp_issued' }).toString();
    let retained: string | undefined;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe('https://auth.openai.com/api/accounts/oauth/token');
      expect(init.headers).toMatchObject({ 'Content-Type': 'application/x-www-form-urlencoded' });
      const form = new URLSearchParams(init.body as URLSearchParams);
      expect(Object.fromEntries(form)).toEqual({ resource: 'https://api.openai.com/v1', grant_type: 'authorization_code', client_id: 'oaiapp_issued', code: 'one-use-test-code', code_verifier: attempt.verifier, redirect_uri: attempt.redirect });
      return new Response(JSON.stringify({ error: { code: 'invalid_grant', param: 'code', message: 'DO-NOT-LOG-THIS-BODY' } }), { status: 400, headers: { 'x-request-id': 'req-test-123' } });
    }));
    await expect(finishLogin(attempt, callback, client => retained = client)).rejects.toMatchObject({ diagnostic: { stage: 'token_exchange', status: 400, code: 'invalid_grant', parameter: 'code', requestId: 'req-test-123' } });
    expect(retained).toBe('oaiapp_issued');
    const retry = beginLogin(host, attempt.redirect, { client_id: retained! });
    expect(new URL(retry.url).searchParams.get('client_id')).toBe('oaiapp_issued');
    expect(new URL(retry.url).searchParams.has('agent_name_hint')).toBe(false);
  });
  it('mantém host estável e separa registro inicial do client_id emitido', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fbr-siwc-')); dirs.push(dir);
    expect(hostId(join(dir, 'host'))).toBe(hostId(join(dir, 'host')));
    const a = beginLogin(host, 'http://127.0.0.1:3333/auth/callback');
    const url = new URL(a.url);
    expect(url.searchParams.get('client_id')).toBe('dynamic_agent_client');
    expect(url.searchParams.get('agent_name_hint')).toBe('FBR News Office');
    expect(url.searchParams.has('id_token_hint')).toBe(false);
    const callback = new URL(a.redirect); callback.search = new URLSearchParams({ state: a.state, code: 'code', client_id: 'oaiapp_test' }).toString();
    expect(callbackCode(a, callback)).toEqual({ code: 'code', client: 'oaiapp_test' });
    callback.searchParams.set('state', 'other'); expect(() => callbackCode(a, callback)).toThrow();
    callback.searchParams.set('state', a.state); callback.searchParams.delete('client_id'); expect(() => callbackCode(a, callback)).toThrow();
    expect(() => beginLogin(host, 'https://office.fbr.news/auth/callback')).toThrow();
    const longer = beginLogin(host, a.redirect, undefined, 30 * 60_000);
    expect(longer.expires - Date.now()).toBeGreaterThan(29 * 60_000);
    expect(() => beginLogin(host, a.redirect, undefined, 31 * 60_000)).toThrow();
    expect(() => beginLogin(host, a.redirect, undefined, Number.NaN)).toThrow();
  });
  it('valida assinatura, nonce, emissor, audience e identidade antes de confiar no token', async () => {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const key = { ...publicKey.export({ format: 'jwk' }), kid: 'one', alg: 'RS256' };
    const payload = { sub: 'user', iss: 'https://auth.openai.com', aud: 'oaiapp_test', nonce: 'nonce', iat: Date.now() / 1000, exp: Date.now() / 1000 + 60 };
    const jwt = (p: unknown) => { const data = Buffer.from(JSON.stringify({ kid: 'one', alg: 'RS256' })).toString('base64url') + '.' + Buffer.from(JSON.stringify(p)).toString('base64url'); return data + '.' + sign('RSA-SHA256', Buffer.from(data), privateKey).toString('base64url'); };
    await expect(verifyIdentity(jwt(payload), 'oaiapp_test', 'nonce', 'user', [key])).resolves.toMatchObject({ subject: 'user' });
    for (const patch of [{ iss: 'https://example.com' }, { aud: 'other' }, { nonce: 'other' }, { exp: 1 }, { sub: 'other' }]) await expect(verifyIdentity(jwt({ ...payload, ...patch }), 'oaiapp_test', 'nonce', 'user', [key])).rejects.toThrow();
    await expect(verifyIdentity(jwt(payload).slice(0, -8) + 'wrongxxx', 'oaiapp_test', 'nonce', 'user', [key])).rejects.toThrow();
  });
  it('serializa refresh e grava atomicamente o token rotativo sem reutilizar o anterior', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fbr-refresh-')); dirs.push(dir);
    const file = join(dir, 'session');
    const s: SiwcSession = { client_id: 'oaiapp_test', subject: 'user', ext_agent_host_id: host, access_token: 'old', refresh_token: 'old-refresh', id_token: 'retained', scopes: ['chatgpt.tokens.use.direct', 'resource.invoke'], saved_at: 1, expires_at: 1 };
    writePrivate(file, s);
    const fetch = vi.fn(async (_url: unknown, init: RequestInit) => {
      expect(new URLSearchParams(init.body as string).get('refresh_token')).toBe('old-refresh');
      await new Promise(r => setTimeout(r, 10));
      return new Response(JSON.stringify({ access_token: 'new', refresh_token: 'replacement', token_type: 'Bearer', expires_in: 3600 }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetch);
    const store = new SiwcStore(file, host);
    const [a, b] = await Promise.all([store.access(), store.access()]);
    expect(fetch).toHaveBeenCalledTimes(1); expect(a.refresh_token).toBe('replacement'); expect(b.access_token).toBe('new');
    expect(store.read()?.refresh_token).toBe('replacement');
    expect(() => new SiwcStore(file, 'other').read()).toThrow();
  });
});
it('clone aceita somente GitHub HTTPS e recusa credenciais, opções, query e caminhos relativos', () => {
  expect(githubRepository('https://github.com/appbigwriter/fbroffice.git')).toEqual({ url: 'https://github.com/appbigwriter/fbroffice.git', folder: 'appbigwriter--fbroffice' });
  for (const url of ['file:///tmp/repo', '--upload-pack=sh', 'https://token@github.com/a/b', 'https://github.com/a/../x', 'https://evil.test/a/b', 'https://github.com/a/b?token=x']) expect(() => githubRepository(url)).toThrow();
});
