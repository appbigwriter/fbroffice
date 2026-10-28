import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { OfficeProject, ProjectJob, projectKey } from '../../shared/projects';
import { tr } from '../../shared/i18n';

export function validProjectPath(path: unknown): path is string {
  return typeof path === 'string' && path.length <= 4096 && !/[\x00-\x1f]/.test(path) &&
    /^(?:[a-z]:[\\/]|\/|\\\\)/i.test(path.trim()) && !path.split(/[\\/]/).includes('..');
}

export class Projects {
  private items = new Map<string, OfficeProject>();
  private jobs = new Map<string, { job: ProjectJob; at: number; name?: string; pinned: boolean }>();
  private hostAt = -Infinity;
  constructor(private readonly opts: { file: string | null; change(): void; check?: (path: string) => string | undefined; now?: () => number }) {}
  private now(): number { return this.opts.now?.() ?? Date.now(); }
  load(): void {
    if (!this.opts.file) return;
    try {
      const data = JSON.parse(readFileSync(this.opts.file, 'utf8'));
      if (!Array.isArray(data.projects)) throw new Error(tr('Cadastro de projetos inválido.'));
      for (const p of data.projects) if (validProjectPath(p?.path)) this.items.set(projectKey(p.path), {
        path: p.path.trim(), name: typeof p.name === 'string' ? p.name.slice(0, 40) : undefined, pinned: p.pinned === true, hidden: p.hidden === true,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  list(): OfficeProject[] { return [...this.items.values()].map((p) => ({ ...p })); }
  get(path: string): OfficeProject | undefined { return this.items.get(projectKey(path)); }
  private save(items: Map<string, OfficeProject>): void {
    if (this.opts.file) {
      mkdirSync(dirname(this.opts.file), { recursive: true });
      writeFileSync(`${this.opts.file}.tmp`, JSON.stringify({ version: 1, projects: [...items.values()] }, null, 2), { mode: 0o600 });
      renameSync(`${this.opts.file}.tmp`, this.opts.file);
    }
    this.items = items;
    this.opts.change();
  }
  update(path: string, patch: Partial<Omit<OfficeProject, 'path'>>): OfficeProject {
    if (!validProjectPath(path)) throw new Error(tr('Informe uma pasta com caminho absoluto.'));
    const previous = this.get(path);
    const p: OfficeProject = { path: previous?.path ?? path.trim(), pinned: previous?.pinned ?? true, hidden: previous?.hidden ?? false, ...patch };
    if (p.name !== undefined) p.name = p.name.trim().slice(0, 40);
    const next = new Map(this.items);
    next.set(projectKey(path), p);
    this.save(next);
    return { ...p };
  }
  remove(path: string): void {
    const next = new Map(this.items);
    next.delete(projectKey(path));
    this.save(next);
  }
  request(kind: 'pick' | 'add', input: { path?: unknown; name?: unknown; pinned?: unknown } = {}): ProjectJob {
    this.prune();
    if ([...this.jobs.values()].filter(({ job }) => ['queued', 'sent'].includes(job.status)).length >= 20) throw new Error(tr('Aguarde os pedidos de projeto em andamento.'));
    if (kind === 'add' && !validProjectPath(input.path)) throw new Error(tr('Informe uma pasta com caminho absoluto.'));
    if (kind === 'pick' && [...this.jobs.values()].some(({ job }) => job.kind === 'pick' && (job.status === 'queued' || job.status === 'sent'))) throw new Error(tr('Já existe um seletor de pastas aberto.'));
    if ((kind === 'pick' || !this.opts.check) && this.now() - this.hostAt > 10_000) throw new Error(tr('O auxiliar do Windows não está conectado. Aguarde alguns segundos.'));
    const job: ProjectJob = { id: randomUUID(), kind, status: 'queued', ...(kind === 'add' ? { path: (input.path as string).trim() } : {}) };
    const entry = { job, at: this.now(), pinned: input.pinned !== false, name: typeof input.name === 'string' ? input.name.trim().slice(0, 40) : undefined };
    this.jobs.set(job.id, entry);
    if (kind === 'add' && this.opts.check) this.finish({ id: job.id, path: job.path, error: this.opts.check(job.path!) });
    return { ...job };
  }
  job(id: string): ProjectJob | undefined { this.prune(); const j = this.jobs.get(id)?.job; return j && { ...j }; }
  poll(): ProjectJob[] {
    this.hostAt = this.now();
    this.prune();
    const out: ProjectJob[] = [];
    for (const entry of this.jobs.values()) if (entry.job.status === 'queued') { entry.job.status = 'sent'; out.push({ ...entry.job }); }
    return out;
  }
  finish(raw: { id?: unknown; path?: unknown; error?: unknown }): void {
    this.prune();
    const entry = typeof raw.id === 'string' ? this.jobs.get(raw.id) : undefined;
    if (!entry || !['sent', 'queued'].includes(entry.job.status)) return;
    const { job } = entry;
    if (typeof raw.error === 'string' && raw.error) { job.status = 'failed'; job.error = raw.error.slice(0, 250); return; }
    if (!validProjectPath(raw.path) || (job.kind === 'add' && projectKey(raw.path) !== projectKey(job.path!))) { job.status = 'failed'; job.error = tr('A pasta selecionada não corresponde ao pedido.'); return; }
    try {
      if (job.kind === 'add') this.update(raw.path, { pinned: entry.pinned, name: entry.name, hidden: false });
      job.path = raw.path.trim();
      job.status = 'done';
    } catch { job.status = 'failed'; job.error = tr('Não foi possível salvar o projeto.'); }
  }
  private prune(): void {
    for (const [id, entry] of this.jobs) {
      const age = this.now() - entry.at;
      if (age > 300_000) this.jobs.delete(id);
      else if (age > 120_000 && ['sent', 'queued'].includes(entry.job.status)) { entry.job.status = 'failed'; entry.job.error = tr('O pedido de projeto expirou. Tente novamente.'); }
    }
  }
}
