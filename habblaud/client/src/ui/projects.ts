import type { OfficeProject, ProjectJob } from '../../../shared/projects';
import { tr } from '../../../shared/i18n';
import { access } from '../net/access';
import type { UiContext } from './context';
import { h, setText } from './dom';

async function api<T>(url: string, body?: unknown, method = 'POST'): Promise<T> {
  const response = await fetch(url, { method: body === undefined ? 'GET' : method, credentials: 'same-origin', cache: 'no-store', headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? tr('Não foi possível falar com o escritório.'));
  return result as T;
}

export class ProjectsPanel {
  readonly button: HTMLButtonElement;
  readonly el: HTMLDialogElement;
  private path = h('input', { class: 'ui-rename__input', attrs: { id: 'project-path', placeholder: 'C:\\Projetos\\MeuProjeto', autocomplete: 'off' } });
  private name = h('input', { class: 'ui-rename__input', attrs: { id: 'project-name', maxlength: 40 } });
  private pinned = h('input', { type: 'checkbox', attrs: { id: 'project-pin', checked: true } });
  private recent = h('select', { class: 'ui-rename__input', attrs: { id: 'project-recent' } });
  private status = h('p', { class: 'ui-projects__status', role: 'status', attrs: { 'aria-live': 'polite' } });
  private list = h('div', { class: 'ui-projects__list' });
  private busy = false;

  constructor(private ctx: UiContext) {
    this.button = h('button', { class: 'ui-btn ui-projects__add', type: 'button', text: tr('+ Adicionar projeto'), on: { click: () => void this.open() } });
    const close = h('button', { class: 'ui-btn', type: 'button', text: tr('Fechar'), attrs: { 'data-close': true }, on: { click: () => this.el.close() } });
    const choose = h('button', { class: 'ui-btn', type: 'button', text: tr('Escolher pasta'), on: { click: () => void this.run(async () => {
      setText(this.status, tr('Selecione uma pasta na janela do Windows.'));
      const job = await this.wait(await api<ProjectJob>('/api/projects', { pick: true }));
      this.path.value = job.path ?? '';
      setText(this.status, tr('Pasta selecionada. Confirme para adicionar o projeto.'));
    }) } });
    const add = h('button', { class: 'ui-btn ui-btn--primary', type: 'button', text: tr('Adicionar ao escritório'), on: { click: () => void this.add() } });
    const refresh = h('button', { class: 'ui-btn', type: 'button', text: tr('Atualizar detecção'), on: { click: () => void this.run(async () => {
      await api('/api/projects/refresh', {}); await this.refresh(); setText(this.status, tr('Projetos e sessões atualizados.'));
    }) } });
    this.recent.addEventListener('change', () => { if (this.recent.value) this.path.value = this.recent.value; });
    this.el = h('dialog', { class: 'ui-projects', attrs: { 'aria-labelledby': 'projects-title' } },
      h('div', { class: 'ui-projects__head' }, h('h2', { text: tr('Projetos do escritório'), attrs: { id: 'projects-title' } }), close),
      h('p', { text: tr('Adicione uma pasta para manter sua sala no escritório. Os agentes aparecem quando houver uma sessão aberta nesse projeto.') }),
      h('label', { attrs: { for: 'project-recent' }, text: tr('Projetos recentes') }), this.recent,
      h('label', { attrs: { for: 'project-path' }, text: tr('Pasta do projeto') }), h('div', { class: 'ui-projects__path' }, this.path, choose),
      h('label', { attrs: { for: 'project-name' }, text: tr('Nome da sala (opcional)') }), this.name,
      h('label', { class: 'ui-projects__pin' }, this.pinned, tr('Manter no escritório mesmo sem sessão aberta')),
      h('div', { class: 'ui-projects__actions' }, add, refresh), this.status,
      h('h3', { text: tr('Projetos cadastrados e detectados') }), this.list,
    );
    this.path.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); void this.add(); } });
  }
  render(): void {
    const allowed = access().local && !!this.ctx.store.snapshot?.meta.terminal && !this.ctx.store.mock && !this.ctx.store.replaying;
    this.button.disabled = !allowed;
    for (const button of this.el.querySelectorAll('button:not([data-close])')) (button as HTMLButtonElement).disabled = !allowed || this.busy;
  }
  private async open(): Promise<void> {
    this.el.showModal();
    await this.run(() => this.refresh());
  }
  private async refresh(): Promise<void> {
    const data = await api<{ projects: OfficeProject[]; recent: { path: string; name: string }[] }>('/api/projects');
    this.recent.replaceChildren(h('option', { text: tr('Escolha um projeto recente…'), attrs: { value: '' } }), ...data.recent.map((p) => h('option', { text: `${p.name} — ${p.path}`, attrs: { value: p.path } })));
    this.list.replaceChildren(...data.projects.map((project) => {
      const name = h('input', { class: 'ui-rename__input', attrs: { maxlength: 40, 'aria-label': tr('Nome do projeto {0}', [project.path]) } });
      name.value = project.name || project.path.split(/[\\/]/).filter(Boolean).pop() || project.path;
      const update = (patch: Partial<OfficeProject>) => this.run(async () => { await api('/api/projects', { path: project.path, ...patch }, 'PATCH'); await this.refresh(); setText(this.status, tr('Projeto atualizado.')); });
      const codexLink = `codex://threads/new?path=${encodeURIComponent(project.path)}`;
      return h('section', { class: 'ui-projects__item' }, name,
        h('span', { class: 'ui-projects__folder', text: project.path }),
        h('span', { text: project.hidden ? tr('Oculto') : project.pinned ? tr('Fixado no escritório') : tr('Detectado automaticamente') }),
        h('div', { class: 'ui-projects__actions' },
          h('a', { class: 'ui-btn', text: tr('+ Agente Codex'), attrs: { href: codexLink, title: tr('Abre outra conversa do Codex nesta pasta. Envie uma mensagem para iniciar o agente.') } }),
          h('button', { class: 'ui-btn', type: 'button', text: tr('Renomear'), on: { click: () => void update({ name: name.value }) } }),
          h('button', { class: 'ui-btn', type: 'button', text: project.pinned ? tr('Desafixar') : tr('Fixar'), on: { click: () => void update({ pinned: !project.pinned }) } }),
          h('button', { class: 'ui-btn', type: 'button', text: project.hidden ? tr('Mostrar') : tr('Ocultar'), on: { click: () => void update({ hidden: !project.hidden, pinned: project.pinned }) } }),
        ));
    }));
  }
  private async wait(job: ProjectJob): Promise<ProjectJob> {
    const deadline = Date.now() + 125_000;
    while (job.status === 'queued' || job.status === 'sent') {
      if (Date.now() > deadline) throw new Error(tr('O pedido de projeto expirou. Tente novamente.'));
      await new Promise((done) => setTimeout(done, 600));
      job = await api<ProjectJob>(`/api/projects/jobs/${encodeURIComponent(job.id)}`);
    }
    if (job.status !== 'done') throw new Error(job.error ?? tr('Não foi possível salvar o projeto.'));
    return job;
  }
  private async add(): Promise<void> {
    if (!this.path.value.trim()) { setText(this.status, tr('Informe uma pasta com caminho absoluto.')); this.path.focus(); return; }
    await this.run(async () => {
      setText(this.status, tr('Verificando a pasta do projeto…'));
      await this.wait(await api<ProjectJob>('/api/projects', { path: this.path.value.trim(), name: this.name.value.trim(), pinned: this.pinned.checked }));
      await this.refresh(); setText(this.status, tr('Projeto adicionado ao escritório.'));
    });
  }
  private async run(action: () => Promise<void>): Promise<void> {
    if (this.busy) return;
    this.busy = true; this.render();
    try { await action(); } catch (err) { setText(this.status, err instanceof Error ? err.message : tr('Não foi possível falar com o escritório.')); }
    finally { this.busy = false; this.render(); }
  }
}
