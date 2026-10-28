import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { realpath } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { join, resolve, sep } from 'node:path';
import { tr } from '../../shared/i18n';
import type { Projects } from '../projects/projects';
import { SiwcStore, hostId, writePrivate } from './siwc';

export function githubRepository(value: unknown) {
  if (typeof value !== 'string' || value.length > 256) throw new Error(tr('Informe uma URL HTTPS de repositório do GitHub.'));
  const m = /^https:\/\/github\.com\/([a-z\d][a-z\d-]{0,38})\/([a-z\d_.-]{1,100}?)(?:\.git)?\/?$/i.exec(value.trim());
  if (!m || m[2] === '.' || m[2] === '..') throw new Error(tr('Informe uma URL HTTPS de repositório do GitHub.'));
  return { url: `https://github.com/${m[1]}/${m[2]}.git`, folder: `${m[1]}--${m[2]}`.toLowerCase() };
}
interface Job { id: string; kind: 'clone' | 'codex'; project: string; status: 'running' | 'done' | 'failed' | 'interrupted'; created: number; output: string; thread?: string }
export const providerArgs = [
  '-c', 'model_provider="openai_chatgpt_plan"',
  '-c', 'model_providers.openai_chatgpt_plan.name="ChatGPT plan"',
  '-c', 'model_providers.openai_chatgpt_plan.base_url="https://api.openai.com/v1"',
  '-c', 'model_providers.openai_chatgpt_plan.env_key="ACCESS_TOKEN"',
  '-c', 'model_providers.openai_chatgpt_plan.wire_api="responses"',
  '-c', 'model_providers.openai_chatgpt_plan.requires_openai_auth=false',
  '-c', 'model_providers.openai_chatgpt_plan.supports_websockets=false',
  '-c', 'shell_environment_policy.inherit="none"',
  '-c', 'shell_environment_policy.set.PATH="/usr/local/bin:/usr/bin:/bin"',
];
// stdin/stdout com RPC; nenhum socket do Codex é exposto pelo container.
export class CodexRpc {
  private child: ChildProcessWithoutNullStreams;
  private next = 0;
  private pending = new Map<number, { ok: (value: any) => void; fail: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  constructor(env: NodeJS.ProcessEnv, cwd: string, event: (message: any) => void, closed: () => void, bin = 'codex') {
    this.child = spawn(bin, ['app-server', '--listen', 'stdio://', ...providerArgs], { cwd, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const lines = createInterface({ input: this.child.stdout });
    lines.on('line', line => {
      if (line.length > 2_000_000) { this.close(); return; }
      let m: any; try { m = JSON.parse(line); } catch { return; }
      if (typeof m.id === 'number' && this.pending.has(m.id)) {
        const p = this.pending.get(m.id)!; this.pending.delete(m.id); clearTimeout(p.timer);
        m.error ? p.fail(new Error(tr('O Codex recusou a operação.'))) : p.ok(m.result);
      } else if (m.id !== undefined && m.method) {
        // Aprovações não são aceitas automaticamente pelo painel.
        this.child.stdin.write(JSON.stringify({ id: m.id, error: { code: -32000, message: 'Interactive approval is unavailable in this worker.' } }) + '\n');
      } else event(m);
    });
    // stderr pode conter dados de provedor: não é repassado ao navegador/log.
    this.child.stderr.resume();
    const finish = () => { for (const p of this.pending.values()) { clearTimeout(p.timer); p.fail(new Error(tr('O processo Codex foi encerrado.'))); } this.pending.clear(); closed(); };
    this.child.once('error', finish); this.child.once('exit', finish);
  }
  request(method: string, params: unknown): Promise<any> {
    const id = ++this.next;
    return new Promise((ok, fail) => {
      const timer = setTimeout(() => { this.pending.delete(id); fail(new Error(tr('O Codex não respondeu no prazo.'))); }, 30_000);
      this.pending.set(id, { ok, fail, timer });
      this.child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
    });
  }
  notify(method: string) { this.child.stdin.write(JSON.stringify({ method }) + '\n'); }
  close() { this.child.kill(); const force = setTimeout(() => { if (this.child.exitCode === null && this.child.signalCode === null) this.child.kill('SIGKILL'); }, 3000); force.unref(); }
}
export class HostedOffice {
  readonly host: string;
  readonly credentials: SiwcStore;
  readonly root: string;
  readonly codexHome: string;
  private jobs: Job[] = [];
  private workers = new Map<string, CodexRpc>();
  private cloning = new Set<string>();
  private jobFile: string;
  constructor(readonly data: string, private projects: Projects) {
    mkdirSync(data, { recursive: true });
    this.root = join(data, 'repositories'); this.codexHome = join(data, 'codex');
    mkdirSync(this.root, { recursive: true }); mkdirSync(this.codexHome, { recursive: true });
    this.host = hostId(join(data, 'fbr-host-id.json'));
    this.credentials = new SiwcStore(join(data, 'credentials-siwc.json'), this.host);
    this.jobFile = join(data, 'fbr-jobs.json');
    if (existsSync(this.jobFile)) {
      this.jobs = (JSON.parse(readFileSync(this.jobFile, 'utf8')) as Job[]).slice(-50);
      for (const j of this.jobs) if (j.status === 'running') { j.status = 'interrupted'; j.output += '\n' + tr('Interrompido pelo reinício do servidor.'); }
      this.save();
    }
  }
  private save() { writePrivate(this.jobFile, this.jobs.slice(-50)); }
  private job(kind: Job['kind'], project: string) {
    const job: Job = { id: randomUUID(), kind, project, status: 'running', created: Date.now(), output: '' };
    this.jobs.push(job); this.jobs = this.jobs.slice(-50); this.save(); return job;
  }
  status() {
    let account: { connected: boolean; email?: string; expires?: number; error?: string };
    try { const s = this.credentials.read(); account = { connected: !!s, email: s?.email, expires: s?.expires_at }; }
    catch { account = { connected: false, error: tr('Credencial FBR inválida. Autorize novamente.') }; }
    return { hostId: this.host, account, projects: this.projects.list().filter(p => p.path.startsWith(this.root + sep)), jobs: this.jobs.slice(-30).reverse() };
  }
  clone(value: unknown) {
    const repo = githubRepository(value), path = join(this.root, repo.folder);
    if (existsSync(path) || this.cloning.has(path)) throw new Error(tr('Esse projeto já existe ou está sendo clonado.'));
    this.cloning.add(path); const job = this.job('clone', path);
    // HTTPS github.com apenas, sem shell, sem submódulos e sem prompt de credenciais.
    execFile('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'protocol.file.allow=never', 'clone', '--', repo.url, path], {
      env: { PATH: process.env.PATH, HOME: '/tmp', GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' }, timeout: 120_000, maxBuffer: 256_000,
    }, error => {
      this.cloning.delete(path);
      job.status = error ? 'failed' : 'done';
      job.output = error ? tr('Não foi possível clonar. Confira a URL e o acesso ao repositório. Uma pasta parcial pode precisar ser removida pelo administrador.') : tr('Repositório clonado.');
      if (!error) { try { this.projects.update(path, { pinned: true, name: repo.folder }); } catch { job.status = 'failed'; job.output = tr('Falha ao cadastrar o projeto clonado.'); } }
      this.save();
    });
    return { id: job.id };
  }
  async start(path: unknown, prompt: unknown) {
    if (typeof path !== 'string' || typeof prompt !== 'string' || !prompt.trim() || prompt.length > 16000 || prompt.includes('\0')) throw new Error(tr('Escolha um projeto e escreva a tarefa.'));
    if (this.workers.size >= 2) throw new Error(tr('Já há dois agentes em execução. Aguarde um terminar.'));
    const root = await realpath(this.root), cwd = await realpath(path);
    if (!cwd.startsWith(root + sep) || !this.projects.get(cwd) || resolve(cwd) === root) throw new Error(tr('Projeto fora da pasta autorizada.'));
    if (this.workers.size >= 2) throw new Error(tr('Já há dois agentes em execução. Aguarde um terminar.'));
    // Reserva antes do refresh assíncrono, evitando ultrapassar a concorrência.
    const job = this.job('codex', cwd);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let rpc: CodexRpc | undefined;
    const finish = (ok: boolean) => { if (job.status !== 'running') return; job.status = ok ? 'done' : 'failed'; if (timer) clearTimeout(timer); this.workers.delete(job.id); rpc?.close(); this.save(); };
    this.workers.set(job.id, undefined as unknown as CodexRpc);
    try {
      const session = await this.credentials.access();
      const env = { PATH: process.env.PATH, HOME: '/home/node', CODEX_HOME: this.codexHome, ACCESS_TOKEN: session.access_token, LANG: 'C.UTF-8' };
      rpc = new CodexRpc(env, cwd, message => {
        if (message.method === 'item/agentMessage/delta' && typeof message.params?.delta === 'string') {
          job.output = (job.output + message.params.delta).replaceAll(session.access_token, '[REDACTED]').replaceAll(session.refresh_token, '[REDACTED]').slice(-32_000);
        }
        if (message.method === 'turn/completed') finish(message.params?.turn?.status === 'completed');
        if (message.method === 'error' && message.params?.willRetry !== true) { job.output += '\n' + tr('O Codex informou uma falha. Confira a autorização, o modelo e o sandbox do servidor.'); }
      }, () => finish(false));
      this.workers.set(job.id, rpc);
      timer = setTimeout(() => { job.output += '\n' + tr('Tempo máximo da tarefa atingido.'); finish(false); }, 30 * 60_000);
      await rpc.request('initialize', { clientInfo: { name: 'fbr_news_office', title: 'FBR News Office', version: '1.0.3' } }); rpc.notify('initialized');
      const thread = await rpc.request('thread/start', { cwd, approvalPolicy: 'never', sandbox: 'workspace-write' });
      job.thread = thread.thread.id;
      await rpc.request('turn/start', { threadId: job.thread, input: [{ type: 'text', text: prompt }] }); this.save();
      return { id: job.id };
    } catch { finish(false); throw new Error(tr('Não foi possível iniciar o Codex. Confira a autorização e o executável no servidor.')); }
  }
  stop(id: unknown) { if (typeof id !== 'string' || !this.workers.has(id)) throw new Error(tr('Agente em execução não encontrado.')); this.workers.get(id)?.close(); }
  close() { for (const worker of this.workers.values()) worker?.close(); }
}
