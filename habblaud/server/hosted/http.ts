import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import { tr } from '../../shared/i18n';
import { readJson, sendJson } from '../http/app';
import { createRemoteGate, isRemoteRequest, loadSecret, RemoteSessions, type RemoteConfig } from '../http/remote';
import { parsePasswordHash } from '../remote/password';
import type { HostedOffice } from './service';

export function hostedGate(data: string, env: NodeJS.ProcessEnv = process.env) {
  const user = env.FBR_ADMIN_USER?.trim(), hash = env.FBR_ADMIN_PASSWORD_HASH?.trim();
  const passwordHash = parsePasswordHash(hash);
  if (!user || !passwordHash) throw new Error(tr('Modo servidor exige FBR_ADMIN_USER e FBR_ADMIN_PASSWORD_HASH.'));
  const config: RemoteConfig = { host: '0.0.0.0', port: 4747, user, passwordHash, passwordHashText: hash!, allow: new Set() };
  return createRemoteGate({ config, secure: true, sessions: new RemoteSessions(loadSecret(join(data, 'fbr-web-secret')), config, Date.now, join(data, 'fbr-web-revoked.json')) });
}
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
function page() {
  const labels = {
    offline: tr('Assinatura ainda não conectada.'), connected: tr('Assinatura conectada.'), task: tr('Tarefa para o Codex'), start: tr('Iniciar agente no servidor'),
    stop: tr('Parar agente'), wait: tr('Operação enviada. Atualizando…'), error: tr('Não foi possível concluir a operação.'),
  };
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FBR News Office</title>
<style>body{background:#121b27;color:#eff3f9;font:16px system-ui;max-width:900px;margin:32px auto;padding:16px}a{color:#9dcaff}input,textarea,button{font:inherit;padding:10px;border-radius:6px;border:1px solid #617086}input,textarea{display:block;box-sizing:border-box;width:100%;background:#202c3b;color:inherit;margin:8px 0}button{cursor:pointer}button:disabled{opacity:.5}section{border:1px solid #465366;padding:16px;margin:16px 0;border-radius:8px}pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:260px;overflow:auto}small{display:block}#status{white-space:pre-wrap}</style>
<h1>FBR News <small>by Habblaud</small></h1><a href="/">${esc(tr('Voltar ao escritório'))}</a>
<section><h2>${esc(tr('Codex no servidor'))}</h2><p id="account"></p><p>${esc(tr('Autorize o FBR no seu computador usando o identificador abaixo. Transfira a credencial por SSH para /data/credentials-siwc.json, com permissão 600.'))}</p><pre id="host"></pre><a href="https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms" target="_blank" rel="noopener">${esc(tr('Procedimento oficial para VM própria'))}</a></section>
<section><h2>${esc(tr('Clonar projeto do GitHub'))}</h2><form id="clone"><label for="repository">${esc(tr('URL HTTPS do repositório público'))}</label><input id="repository" type="url" placeholder="https://github.com/owner/repo" required><button>${esc(tr('Clonar e adicionar ao escritório'))}</button></form></section>
<p id="status" role="status"></p><div id="projects"></div><h2>${esc(tr('Tarefas do servidor'))}</h2><div id="jobs"></div>
<script>
const L=${JSON.stringify(labels).replaceAll('<', '\\u003c')};let busy=false;
async function api(path,body){const r=await fetch(path,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});if(r.status===401){location.assign('/login');throw Error(L.error)}const j=await r.json();if(!r.ok)throw Error(j.error||L.error);return j}
function node(tag,text){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e}
async function action(path,body){if(busy)return;busy=true;try{await api(path,body);document.querySelector('#status').textContent=L.wait;await refresh()}catch(e){document.querySelector('#status').textContent=e.message}finally{busy=false}}
document.querySelector('#clone').onsubmit=e=>{e.preventDefault();action('/api/server/clone',{url:document.querySelector('#repository').value})};
async function refresh(){const s=await api('/api/server/status');document.querySelector('#account').textContent=(s.account.connected?L.connected+' '+(s.account.email||''):L.offline);document.querySelector('#host').textContent='npm run siwc:login -- --host-id '+s.hostId;
const projects=document.querySelector('#projects');if(!projects.childElementCount||projects.dataset.paths!==JSON.stringify(s.projects.map(p=>p.path))){projects.dataset.paths=JSON.stringify(s.projects.map(p=>p.path));projects.replaceChildren();for(const p of s.projects){const box=node('section'),title=node('h3',p.name||p.path),label=node('label',L.task),input=node('textarea'),button=node('button',L.start);input.rows=3;label.append(input);button.onclick=()=>action('/api/server/start',{path:p.path,prompt:input.value});box.append(title,node('p',p.path),label,button);projects.append(box)}}
for(const button of projects.querySelectorAll('button'))button.disabled=!s.account.connected;
const jobs=document.querySelector('#jobs');jobs.replaceChildren();for(const j of s.jobs){const box=node('section');box.append(node('strong',j.kind+' · '+j.status),node('p',j.project),node('pre',j.output));if(j.kind==='codex'&&j.status==='running'){const stop=node('button',L.stop);stop.onclick=()=>action('/api/server/stop',{id:j.id});box.append(stop)}jobs.append(box)}}
refresh().catch(e=>document.querySelector('#status').textContent=e.message);setInterval(()=>{if(!busy)refresh().catch(()=>{})},3000);
</script></html>`;
}
export function hostedRoutes(office: HostedOffice, req: IncomingMessage, res: ServerResponse, url: URL): boolean {
  if (url.pathname !== '/server' && !url.pathname.startsWith('/api/server/')) return false;
  if (!isRemoteRequest(req)) { sendJson(res, 401, { error: tr('Faça login para administrar o servidor.') }); return true; }
  if (url.pathname === '/server' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' }); res.end(page()); return true;
  }
  if (url.pathname === '/api/server/status' && req.method === 'GET') { sendJson(res, 200, office.status()); return true; }
  if (req.method !== 'POST') { sendJson(res, 405, { error: tr('Método não permitido') }); return true; }
  void (async () => {
    try {
      const body = await readJson(req) as Record<string, unknown>;
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error(tr('Corpo de pedido inválido.'));
      if (url.pathname === '/api/server/clone') sendJson(res, 202, office.clone(body.url));
      else if (url.pathname === '/api/server/start') sendJson(res, 202, await office.start(body.path, body.prompt));
      else if (url.pathname === '/api/server/stop') { office.stop(body.id); sendJson(res, 200, { ok: true }); }
      else sendJson(res, 404, { error: tr('Rota não encontrada.') });
    } catch (error) { sendJson(res, 400, { error: error instanceof Error ? error.message : tr('Não foi possível concluir a operação.') }); }
  })();
  return true;
}
