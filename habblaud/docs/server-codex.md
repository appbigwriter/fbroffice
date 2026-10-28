# Codex na VM pessoal com assinatura ChatGPT

Este modo executa o aplicativo open source na sua própria VM. Não transforma o
FBR em um serviço multiusuário de revenda de assinaturas. Usa o registro próprio
SIWC do FBR, sem copiar `auth.json` ou credenciais do aplicativo Codex.

## Instalação no Easypanel

Use o Dockerfile da **raiz**: inclui Git e o Codex oficial 0.165.0. Configure um
volume persistente em `/data`, gravável pelo UID 1000. Use uma réplica. O domínio
deve oferecer HTTPS e encaminhar HTTP internamente para a porta 4747.

No seu computador, dentro de `habblaud/`, rode:

```sh
npm run server:setup
```

O programa pede uma senha sem mostrá-la e grava os valores de `FBR_HOSTED`,
`FBR_ADMIN_USER` e `FBR_ADMIN_PASSWORD_HASH` em um arquivo privado. Copie-os para
Environment no Easypanel. Preserve `HABBLAUD_ALLOWED_HOSTS` com seus domínios.
Faça Deploy. O modo servidor recusa iniciar sem usuário e hash válidos e exige
login próprio mesmo se o proxy já tiver Basic Auth. Apenas `/api/health` e os
arquivos públicos usados pela tela de login ficam disponíveis sem sessão.

Abra `/server` pelo domínio HTTPS. A página informa o identificador estável da
VM e o comando de autorização. No seu computador, execute esse comando:

```sh
npm run siwc:login -- --host-id urn:uuid:IDENTIFICADOR-MOSTRADO-NA-VM
```

Abra o endereço exibido. Confira o nome FBR News Office, a conta, o workspace
e a autorização de uso da assinatura. O callback é atendido em `127.0.0.1`,
com state, nonce e PKCE. A identidade é verificada por assinatura RS256, emissor,
audience, expiração e nonce; o uso exige os scopes apropriados. A credencial é
gravada com permissão 600 no Unix ou ACL do usuário no Windows.

Transfira **somente o arquivo próprio do FBR** por SSH/SFTP para
`/data/credentials-siwc.json` dentro do volume do aplicativo. No servidor,
defina o dono como `1000:1000` e o modo `600`. Não envie esse arquivo no chat,
GitHub, formulário de suporte ou armazenamento do navegador. O ID da VM não deve
ser substituído pelo de outro computador.

A VM passa a controlar a renovação. O processo serializa refreshes, usa o
`client_id` emitido e substitui atomicamente os tokens rotativos. Não rode outro
processo renovando a mesma sessão. A cópia local serve à transferência inicial;
não a use como outra sessão ativa. Revogue o acesso em ChatGPT Settings ao
desativar o escritório ou em caso de comprometimento.

## Projetos e tarefas

Em `/server`, informe uma URL `https://github.com/owner/repo`. O clone fica em
`/data/repositories/owner--repo`, e sua sala é fixada no escritório. Para
repositórios privados, configure `FBR_GITHUB_TOKEN` no Environment com acesso
mínimo aos repositórios desejados. O token só é passado ao subprocesso Git via
askpass, não é incluído no remote, em mensagens ou no processo do Codex.

Escreva uma tarefa no projeto e inicie o agente. Até dois agentes podem executar
simultaneamente, inclusive no mesmo projeto. Eles compartilham a pasta de trabalho
desse projeto; não há isolamento por worktree nem merge automático. As sessões
reais do Codex são observadas pelo escritório. O painel mostra resultado e estado
das tarefas e permite parar o processo.

O worker usa `codex app-server` via stdio, o provedor Responses documentado para
SIWC, `workspace-write` e aprovação `never`. Pedidos de aprovação interativa são
recusados, não aceitos automaticamente. Não há opção de desativar o sandbox por
esse painel. O host precisa suportar o sandbox Linux do Codex; em caso de falha,
verifique a infraestrutura antes de iniciar trabalho real. Não há teste de
inferência automática durante instalação ou validação.

O limite de uma tarefa é 30 minutos. Reinícios e deploys interrompem processos
ativos e registram esse estado; não existe retomada automática de trabalho ou
troca silenciosa para uma API paga. A assinatura continua sujeita aos limites
da conta e à disponibilidade de modelos. Histórico e projetos persistem no volume.

Este é um ambiente pessoal para repositórios de confiança. No modo integrado,
o worker compartilha o usuário e o container do aplicativo. O modo separado
descrito abaixo usa outro usuário e protege os segredos administrativos por
permissões de arquivo. Não há isolamento para executar código hostil de outros
usuários nem separação de segredos por tenant. Backups contêm dados privados e
precisam de proteção equivalente.

### Worker separado quando o Docker bloqueia namespaces

No VPS configurado nesta implantação, o sandbox dentro do container foi recusado
pelo isolamento de namespaces do Docker. Foi instalado um worker systemd com
usuário dedicado `fbroffice-worker`, sem login e sem privilégios de root.

- O painel usa `FBR_CODEX_SOCKET=/run/fbroffice-worker/codex.sock`.
- O socket é criado pelo systemd para `root:1000`, com modo 660. Seu diretório
  tem modo 710 e grupo 1000; o usuário do worker não pertence a esse grupo e não
  pode abrir uma nova conexão ao socket. O listener é recebido por socket activation.
- O worker só aceita pastas reais sob `/srv/fbr-office/repositories/`. Não escuta
  TCP, não recebe credenciais em argumentos e não registra tokens ou saída do provedor.
- O painel e o worker usam o mesmo caminho `/srv/fbr-office`, com bind mount no
  container e `HABBLAUD_DATA_DIR=/srv/fbr-office`. O diretório do socket também
  é montado no container. O armazenamento anterior em `/data` foi preservado.
- ACLs concedem ao worker acesso somente às árvores `repositories` e `codex`.
  Arquivos privados do painel e da autorização permanecem com dono 1000 e modo 600.
- Bubblewrap e o perfil `bwrap-userns-restrict` vieram dos pacotes oficiais do
  Ubuntu. O perfil permite ao sandbox criar seu namespace e restringe as
  capacidades dos filhos. A restrição global de user namespaces continua ligada.
- Os arquivos `scripts/hosted-worker.py`, `fbroffice-worker.service` e
  `fbroffice-worker.socket` registram o serviço instalado. O binário oficial
  Codex 0.165.0 fica sob `/opt/fbroffice-worker/vendor`; os argumentos fixos do
  provedor ficam em `provider-args.json`, com dono root. Node 24.11.1 para os
  projetos fica sob `/opt/fbroffice-worker/node`.

Com essa configuração, a credencial própria do FBR fica em
`/srv/fbr-office/credentials-siwc.json`. Use o caminho mostrado na página
`/server`; não substitua o ID estável dessa VM ao importar a autorização.

Não basta ligar o worker: é necessário que o sandbox passe no teste real sob
o usuário dedicado. Este teste não faz inferência nem consome tokens:

```sh
cd /srv/fbr-office/repositories/appbigwriter--fbroffice
runuser -u fbroffice-worker -- env HOME=/var/lib/fbroffice-worker \
  CODEX_HOME=/srv/fbr-office/codex PATH=/usr/bin:/bin \
  /opt/fbroffice-worker/vendor/bin/codex sandbox -- /bin/true
```

## Referências oficiais verificadas

- [Registro SIWC para aplicativos open source](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)
- [VM própria e transferência protegida](https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms)
- [Provedor Codex app-server](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server)
- [Sessões e renovação](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions)
- [Limitações da prévia](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)

O cadastro de parceiros comerciais é um fluxo separado. As instruções desta
página se referem ao procedimento documentado para software open source em VM
própria. Confirme as condições vigentes antes de oferecer o produto a terceiros.
