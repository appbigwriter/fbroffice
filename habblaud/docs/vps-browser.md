# Navegador privado na VPS

O Chrome executa no próprio VPS, como `fbroffice-browser`, separado do usuário
do painel e do worker Codex. O perfil fica em `/var/lib/fbroffice-browser`, com
diretório privado. O sandbox padrão do Chrome permanece ativo.

TigerVNC oferece o desktop em `127.0.0.1:5909`. noVNC/websockify atende em
`127.0.0.1:6080`. Nenhuma dessas portas é publicada na internet. O acesso usa
VNC com senha dentro de um túnel SSH autenticado e criptografado.

## Abrir no Windows

Dentro de `habblaud/`:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/vps-browser.ps1
```

Abra `http://127.0.0.1:6081/vnc.html`, clique em Connect e informe a senha do
navegador. Ela é diferente da senha do painel FBR e foi salva localmente em
`~/.config/fbr-office/credentials-vps-browser.json`. Esse arquivo não pertence
ao repositório. O campo `password` contém a senha; o VNC usa oito caracteres.

O desktop e os agentes continuam no VPS quando o Windows é desligado. Só o
túnel de visualização precisa ser aberto novamente quando você quiser acessá-lo.
Fechar o Chrome não encerra a sessão gráfica. O serviço também reinicia o
desktop após um encerramento inesperado ou normal do processo principal.

## Autorizar a assinatura dentro da VM

O serviço `fbroffice-browser-auth` executa o login próprio SIWC do FBR na VM,
abre o endereço oficial no Chrome remoto e atende o callback em loopback
na mesma VM. Não usa `auth.json` do Codex nem automatiza senha, CAPTCHA, MFA
ou aprovação de permissões. Essas etapas são feitas pela pessoa no navegador.

A tentativa no navegador da VPS tem prazo de trinta minutos. O CLI usa dez
minutos por padrão e aceita `--timeout-minutes` entre 1 e 30. Para abrir uma nova tentativa:

```sh
systemctl restart fbroffice-browser-auth.service
```

Ao terminar, a credencial é gravada com modo 600 no diretório privado do
navegador. O serviço `fbroffice-browser-import.path` aciona a importação:

- Recusa symlinks, arquivos grandes, dono incorreto e permissões abertas.
- Confere o identificador da VM, campos e scopes necessários.
- Verifica novamente a assinatura e os claims da identidade OpenAI.
- Recusa substituir uma conta já conectada por outra identidade/registro.
- Instala atomicamente `/srv/fbr-office/credentials-siwc.json`, com dono 1000 e
  modo 600, sem exibir tokens. A VM assume as renovações posteriores.

Atualize `/server` no escritório para conferir o estado da conexão. Autorizar
uma assinatura não inicia tarefas nem faz inferência de teste automaticamente.
Uma verificação humana ou recusa da OpenAI precisa ser resolvida no fluxo oficial;
o navegador remoto não elimina requisitos de acesso ou permissões da conta.

## Serviços instalados

- `fbroffice-desktop.service`: desktop e Chrome, com limite de memória/CPU.
- `fbroffice-browser.service`: noVNC em loopback.
- `fbroffice-browser-auth.service`: tentativa explícita de autorização.
- `fbroffice-browser-import.path` / `.service`: validação e instalação protegida.

As definições ficam em `scripts/`. O Chrome veio do pacote oficial da Google;
TigerVNC, noVNC, websockify e Openbox vieram dos pacotes do Ubuntu. Os serviços
de desktop e visualização iniciam com o VPS; o login OAuth exige ação humana.

Não compartilhe o perfil do navegador, cookies, arquivo de autorização ou senha
do VNC. Eles não fazem parte dos arquivos distribuídos no GitHub.
