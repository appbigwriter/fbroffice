import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Projects } from './projects';
import { projectKey } from '../../shared/projects';
import { Office, OFFLINE_GRACE_MS } from '../model/office';
import { NameStore } from '../model/names';
import { AccountsService } from '../accounts/service';
import { Hub } from '../http/sse';
import { createApiHandler } from '../http/app';
import { createRequestGuard } from '../http/guard';
import { projectsRound } from '../../scripts/project-host';
import { httpPost } from '../../scripts/codex-bridge';
import { request } from '../test/permission-server';

const temporary: string[] = [];
afterEach(() => { for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true }); });
function folder() { const path = mkdtempSync(join(tmpdir(), 'office-project-')); temporary.push(path); return path; }
function office(now = () => 0) { return new Office({ names: new NameStore(null), version: 'test', startedAt: 0, accounts: () => [], sources: () => [], accountName: () => undefined, now }); }
const agent = (cwd: string, id = 'a') => ({ id, cwd, sessionId: id, account: 'x', role: 'Codex', status: 'idle' as const, startedAt: 0 });

describe('projetos cadastrados', () => {
  it('persiste, associa sessões Windows à mesma sala, mantém após saída e permite ocultar/restaurar/desafixar', () => {
    const file = join(folder(), 'projects.json');
    let now = 0;
    const model = office(() => now);
    const projects = new Projects({ file, change: () => model.setProjects(projects.list()) });
    projects.update('C:\\Projetos\\Loja', { pinned: true });
    expect(model.commit().snapshot.rooms).toHaveLength(1);
    model.addMain(agent('c:/projetos/LOJA/'));
    expect(model.commit().snapshot.rooms).toHaveLength(1);
    projects.update('c:/Projetos/Loja', { hidden: true });
    expect(model.commit().snapshot.agents).toHaveLength(0);
    expect(model.has('a')).toBe(true);
    projects.update('c:/Projetos/Loja', { hidden: false });
    expect(model.commit().snapshot.agents).toHaveLength(1);
    model.closeMain('a'); now += OFFLINE_GRACE_MS + 1; model.tick();
    expect(model.commit().snapshot.rooms).toHaveLength(1);
    const restored = new Projects({ file, change() {} }); restored.load();
    expect(restored.list()).toEqual(projects.list());
    expect(JSON.parse(readFileSync(file, 'utf8')).version).toBe(1);
    projects.update('c:/projetos/loja', { pinned: false });
    expect(model.commit().snapshot.rooms).toHaveLength(0);
    expect(projectKey('/Repos/APP')).not.toBe(projectKey('/repos/app'));
  });
  it('valida formato, recusa host ausente e não aceita confirmação tardia nem de outra pasta', () => {
    let now = 0;
    const projects = new Projects({ file: null, change() {}, now: () => now });
    expect(() => projects.request('add', { path: 'relativo' })).toThrow();
    expect(() => projects.request('pick')).toThrow(/auxiliar/);
    projects.poll();
    const job = projects.request('add', { path: '/repos/loja' }); projects.poll();
    projects.finish({ id: job.id, path: '/outro' });
    expect(projects.job(job.id)?.status).toBe('failed');
    const late = projects.request('add', { path: '/repos/loja' }); projects.poll(); now = 121_000;
    projects.finish({ id: late.id, path: '/repos/loja' });
    expect(projects.list()).toHaveLength(0);
    expect(projects.job(late.id)?.status).toBe('failed');
  });
  it('fluxo HTTP + bridge: valida a pasta real, salva, seleciona sem adicionar e protege acesso de rede', async () => {
    const path = folder();
    const model = office();
    const projects = new Projects({ file: join(path, 'projects.json'), change: () => model.setProjects(projects.list()) });
    const hub = new Hub(model);
    const handler = createApiHandler({ office: model, hub, projects, terminal: true, inDocker: true, version: 'test', sources: () => [], accounts: new AccountsService({ dirs: [], home: path, env: {}, onChange() {} }) });
    const guard = createRequestGuard({ allowedHosts: new Set(['office.lan']) });
    const server = createServer((req, res) => { if (!guard(req, res)) handler(req, res, new URL(req.url!, 'http://localhost')); });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const port = (server.address() as AddressInfo).port;
    const post = httpPost(port);
    try {
      await projectsRound(post);
      const added = await post('/api/projects', { path, pinned: true, name: 'Loja' });
      const id = (added!.json as { id: string }).id;
      expect(added?.status).toBe(202);
      expect((await projectsRound(post)).state).toBe('ok');
      expect(projects.job(id)?.status).toBe('done');
      expect(projects.list()[0]).toMatchObject({ path, name: 'Loja', pinned: true });
      expect(model.commit().snapshot.rooms).toHaveLength(1);
      const pick = await post('/api/projects', { pick: true });
      await projectsRound(post, async () => path);
      expect(projects.job((pick!.json as { id: string }).id)).toMatchObject({ status: 'done', path });
      expect(projects.list()).toHaveLength(1);
      const denied = await request(`http://127.0.0.1:${port}`, '/api/projects', { headers: { Host: 'office.lan' } });
      expect(denied.status).toBe(403);
      const patch = await fetch(`http://127.0.0.1:${port}/api/projects`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path, name: 'Outro nome', pinned: false }) });
      expect(patch.status).toBe(200);
      expect(model.commit().snapshot.rooms).toHaveLength(0);
    } finally { hub.stop(); server.closeAllConnections(); await new Promise<void>((done) => server.close(() => done())); }
  });
});
