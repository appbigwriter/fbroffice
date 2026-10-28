import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { Projects } from '../projects/projects';
import { createRequestGuard } from '../http/guard';
import { hashPassword } from '../remote/password';
import { hostedGate, hostedRoutes } from './http';
import { HostedOffice } from './service';

it('servidor exige login próprio e não entrega credenciais em status; clone exige JSON e sessão', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fbr-hosted-http-'));
  const office = new HostedOffice(dir, new Projects({ file: join(dir, 'projects.json'), change: () => {} }));
  const gate = hostedGate(dir, { FBR_ADMIN_USER: 'admin', FBR_ADMIN_PASSWORD_HASH: await hashPassword('only-a-test-password', 10) });
  const guard = createRequestGuard();
  const server = http.createServer((req, res) => {
    const url = new URL(req.url!, 'http://localhost');
    if (guard(req, res) || gate(req, res, url) || hostedRoutes(office, req, res, url)) return;
    res.writeHead(404); res.end();
  });
  await new Promise<void>(ok => server.listen(0, '127.0.0.1', ok));
  const addr = server.address(); if (!addr || typeof addr === 'string') throw Error('address');
  const base = `http://127.0.0.1:${addr.port}`;
  try {
    expect((await fetch(base + '/api/server/status')).status).toBe(401);
    expect((await fetch(base + '/api/server/clone', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status).toBe(401);
    const login = await fetch(base + '/api/remote/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: 'admin', password: 'only-a-test-password' }) });
    expect(login.status).toBe(200);
    expect(login.headers.get('set-cookie')).toContain('Secure');
    const cookie = login.headers.get('set-cookie')!.split(';')[0];
    const status = await fetch(base + '/api/server/status', { headers: { Cookie: cookie } });
    const body = await status.text(); expect(status.status).toBe(200); expect(body).toContain('hostId'); expect(body).not.toMatch(/access_token|refresh_token|passwordHash/);
    expect((await fetch(base + '/api/server/clone', { method: 'POST', headers: { Cookie: cookie }, body: '{}' })).status).toBe(415);
    const clone = await fetch(base + '/api/server/clone', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ url: 'file:///etc/passwd' }) });
    expect(clone.status).toBe(400);
    const csrf = await fetch(base + '/api/server/clone', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', Origin: 'https://other.test' }, body: '{}' });
    expect(csrf.status).toBe(403);
  } finally { office.close(); server.closeAllConnections(); await new Promise<void>(ok => server.close(() => ok())); rmSync(dir, { recursive: true, force: true }); }
});
