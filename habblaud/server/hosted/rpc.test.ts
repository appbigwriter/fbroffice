import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { CodexRpc } from './service';

it('RPC usa processo real, encaminha notificações, recusa aprovação e encerra pedidos pendentes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fbr-rpc-'));
  const script = join(dir, 'worker.cjs');
  writeFileSync(script, `const rl=require('readline').createInterface({input:process.stdin});
rl.on('line',line=>{const m=JSON.parse(line);if(m.method==='initialize')console.log(JSON.stringify({id:m.id,result:{ready:true}}));
if(m.method==='turn/start'){console.log(JSON.stringify({id:'approval',method:'item/commandExecution/requestApproval',params:{}}));}
if(m.id==='approval'&&m.error){console.log(JSON.stringify({method:'approval/refused',params:{}}));}
});`);
  let event!: () => void;
  const notified = new Promise<void>(ok => event = ok);
  let closed!: () => void;
  const stopped = new Promise<void>(ok => closed = ok);
  const rpc = new CodexRpc({ PATH: process.env.PATH }, dir, m => { if (m.method === 'approval/refused') event(); }, closed, process.execPath, [script]);
  try {
    await expect(rpc.request('initialize', {})).resolves.toEqual({ ready: true });
    const pending = rpc.request('turn/start', {});
    const rejection = expect(pending).rejects.toThrow();
    await notified; rpc.close(); await rejection; await stopped;
  } finally { rpc.close(); rmSync(dir, { recursive: true, force: true }); }
});
