/** Identidade de projetos: Windows ignora caixa e tipo de barra; POSIX preserva caixa. */
export function projectKey(path: string): string {
  const p = path.trim().replace(/\\/g, '/').replace(/\/+$/, '');
  return /^[a-z]:\//i.test(p) || p.startsWith('//') ? p.toLowerCase() : p || '/';
}

export interface OfficeProject {
  path: string;
  name?: string;
  pinned: boolean;
  hidden: boolean;
}

export interface ProjectJob {
  id: string;
  kind: 'pick' | 'add';
  status: 'queued' | 'sent' | 'done' | 'failed';
  path?: string;
  error?: string;
}
