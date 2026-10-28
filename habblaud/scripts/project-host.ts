import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { isAbsolute, resolve } from 'node:path';
import { statSync } from 'node:fs';
import type { Post, RoundResult } from './codex-bridge';
import { tr } from '../shared/i18n';

/** Chamado somente depois de um clique explícito em Escolher pasta, nunca no início do bridge. */
export async function pickProjectFolder(): Promise<string> {
  if (process.platform !== 'win32') throw new Error(tr('Seleção de pasta indisponível neste sistema. Informe o caminho da pasta.'));
  const script = `$shell = New-Object -ComObject Shell.Application
$folder = $shell.BrowseForFolder(0, 'Habblaud', 65, 0)
if ($null -ne $folder) { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding; [Console]::Write($folder.Self.Path) }`;
  const { stdout } = await promisify(execFile)('powershell.exe', ['-NoProfile', '-STA', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { timeout: 100_000, windowsHide: true, encoding: 'utf8', maxBuffer: 32 * 1024 });
  if (!stdout.trim()) throw new Error(tr('Seleção de pasta cancelada.'));
  return stdout.trim();
}

export async function projectsRound(post: Post, pick = pickProjectFolder, check = (p: string) => statSync(p).isDirectory()): Promise<RoundResult> {
  const response = await post('/api/host/projects/poll', {});
  if (!response) return { state: 'down' };
  const jobs = (response.json as { jobs?: unknown } | null)?.jobs;
  if (response.status !== 200 || !Array.isArray(jobs)) return { state: 'refused', status: response.status };
  const results: { id: string; ok: boolean; error?: string }[] = [];
  for (const job of jobs) {
    if (typeof job?.id !== 'string' || !['pick', 'add'].includes(job.kind)) continue;
    let path: string | undefined;
    let error: string | undefined;
    try {
      path = job.kind === 'pick' ? await pick() : job.path;
      if (typeof path !== 'string' || !isAbsolute(path) || !check(path)) throw new Error(tr('A pasta não existe neste computador.'));
      path = resolve(path);
    } catch (err) {
      error = err instanceof Error && !('code' in err) ? err.message : tr('Não foi possível selecionar ou verificar a pasta.');
    }
    await post('/api/host/projects/ack', { id: job.id, ...(error ? { error } : { path }) });
    results.push({ id: job.id, ok: !error, ...(error ? { error } : {}) });
  }
  return { state: 'ok', results };
}
