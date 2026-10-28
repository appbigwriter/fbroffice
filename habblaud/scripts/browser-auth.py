#!/usr/bin/env python3
"""Abre o OAuth próprio do FBR no Chrome da VM; nunca automatiza o consentimento."""
import os
import subprocess
from urllib.parse import urlsplit

env = dict(os.environ, HOME='/var/lib/fbroffice-browser', DISPLAY=':9')
command = ['/opt/fbroffice-worker/node/bin/node', '/opt/fbroffice-browser/siwc-login.mjs',
           '--host-id', os.environ['FBR_VM_HOST_ID'], '--output',
           '/var/lib/fbroffice-browser/credentials-siwc.json']
with subprocess.Popen(command, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True) as child:
    for line in child.stdout:
        parsed = urlsplit(line.strip())
        if parsed.scheme == 'https' and parsed.netloc == 'auth.openai.com' and parsed.path == '/api/accounts/authorize':
            subprocess.Popen(['/usr/bin/google-chrome', '--user-data-dir=/var/lib/fbroffice-browser/profile', line.strip()],
                             env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            print('FBR authorization opened in the VM browser.', flush=True)
        else:
            print(line.rstrip(), flush=True)
    raise SystemExit(child.wait())
