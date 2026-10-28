#!/usr/bin/env python3
"""Worker pessoal via socket activation do systemd. Não roda como root.

O socket pertence ao grupo do painel, não ao usuário do worker. Acesso à API
do Codex é exclusivamente stdio. O app autoriza cada tarefa, usando SIWC próprio.
"""
import json
import os
import signal
import socket
import subprocess
import threading

ROOT = os.path.realpath(os.environ['FBR_WORKER_DATA'])
CODEX = os.environ['FBR_WORKER_CODEX']
with open(os.environ['FBR_WORKER_ARGS'], encoding='utf-8') as config:
    ARGS = json.load(config)
slots = threading.BoundedSemaphore(2)


def handle(connection):
    child = None
    try:
        with connection, slots:
            connection.settimeout(10)
            reader = connection.makefile('rb')
            line = reader.readline(65537)
            if len(line) > 65536:
                return
            request = json.loads(line)
            cwd = os.path.realpath(request['cwd'])
            token = request['token']
            if not cwd.startswith(ROOT + '/repositories/') or not os.path.isdir(cwd):
                return
            if not isinstance(token, str) or not token or len(token) > 32768:
                return
            connection.settimeout(None)
            env = {'PATH': '/usr/bin:/bin', 'HOME': '/var/lib/fbroffice-worker',
                   'CODEX_HOME': ROOT + '/codex', 'ACCESS_TOKEN': token, 'LANG': 'C.UTF-8'}
            child = subprocess.Popen([CODEX, 'app-server', '--listen', 'stdio://'] + ARGS,
                                     cwd=cwd, env=env, stdin=subprocess.PIPE,
                                     stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                     close_fds=True, start_new_session=True)

            def inbound():
                try:
                    while True:
                        packet = reader.readline(2000001)
                        if not packet or len(packet) > 2000000:
                            break
                        child.stdin.write(packet)
                        child.stdin.flush()
                except (OSError, ValueError):
                    pass
                finally:
                    if child.poll() is None:
                        os.killpg(child.pid, signal.SIGTERM)

            def outbound():
                try:
                    while True:
                        packet = child.stdout.readline(2000001)
                        if not packet or len(packet) > 2000000:
                            break
                        connection.sendall(packet)
                except OSError:
                    pass

            threading.Thread(target=inbound, daemon=True).start()
            output = threading.Thread(target=outbound, daemon=True)
            output.start()
            try:
                child.wait(timeout=1800)
            except subprocess.TimeoutExpired:
                os.killpg(child.pid, signal.SIGTERM)
                try:
                    child.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    os.killpg(child.pid, signal.SIGKILL)
            output.join(timeout=3)
    except (OSError, ValueError, KeyError, TypeError):
        pass  # Nunca registra token, protocolo ou saída do provedor.
    finally:
        if child is not None and child.poll() is None:
            os.killpg(child.pid, signal.SIGKILL)
        connection.close()


if __name__ == '__main__':
    listener = socket.socket(fileno=3)  # systemd mantém o caminho root:grupo-do-painel.
    while True:
        conn, _ = listener.accept()
        threading.Thread(target=handle, args=(conn,), daemon=True).start()
