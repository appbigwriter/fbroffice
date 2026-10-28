# Easypanel: domínio e diagnóstico

O build usa o Dockerfile da raiz do repositório. O processo do aplicativo escuta
HTTP em `0.0.0.0:4747` dentro do container. A mensagem de inicialização que mostra
`http://localhost:4747` é o endereço de apresentação do log.

## Configuração do serviço

No serviço `sistemas/fbroffice`:

1. Em **Security**, configure usuário e senha para HTTP Basic Auth. Use HTTPS no
   domínio público. Não coloque a senha no Git nem em mensagens.
2. Em **Domains**, configure `office.fbr.news`, caminho `/`, protocolo de destino
   **HTTP** e porta de destino **4747**. O HTTPS público termina no proxy do
   Easypanel; o aplicativo nessa porta atende HTTP.
3. Em **Environment**, mantenha:

   ```dotenv
   HABBLAUD_HOST=0.0.0.0
   HABBLAUD_PORT=4747
   HABBLAUD_ALLOWED_HOSTS=office.fbr.news
   HABBLAUD_DATA_DIR=/data
   ```

4. Monte armazenamento persistente em `/data`, gravável pelo UID 1000 do usuário
   `node`. Use uma réplica: o estado atual é armazenado em arquivos locais.
5. Salve e faça **Deploy** para aplicar as alterações. Não é necessário publicar
   a porta 4747 diretamente no servidor em **Advanced → Ports**.

O Basic Auth do proxy protege os domínios que passam por ele. Não torna segura
uma porta publicada diretamente nem substitui as permissões internas do app.

## Diagnóstico de 502

Na aba **Shell** do container do aplicativo, execute:

```sh
node -e "fetch('http://127.0.0.1:4747/api/health').then(async r=>{console.log(r.status,await r.text());process.exitCode=r.ok?0:1}).catch(e=>{console.error(e.message);process.exitCode=1})"
```

- HTTP 200 internamente e 502 pelo domínio: revisar porta, protocolo e destino do
  domínio no proxy, além do estado da tarefa/container atual.
- Falha internamente: revisar logs, variáveis de escuta, reinícios e disponibilidade
  do processo. O log de uma inicialização antiga não comprova que ele continua ativo.
- HTTP 403 com “Host não permitido”: conferir `HABBLAUD_ALLOWED_HOSTS` e redeploy.
- Pedido de usuário/senha no domínio: a proteção do proxy está ativa.

Não há indicação de erro específico no favicon quando `/` e `/api/health` também
retornam 502: primeiro é preciso restabelecer o acesso ao backend.

## Sessões e agentes no servidor remoto

Um container novo no VPS não recebe automaticamente os arquivos e processos do
Windows. As mensagens “nenhuma pasta do Claude Code/Codex encontrada” descrevem
esse fato. Definir uma variável com um caminho `C:\...` ou `F:\...` não transporta
esses arquivos para o Linux.

O bridge atual usa o Habblaud em `127.0.0.1` no computador em que roda; ele não
sincroniza o escritório local com uma segunda instalação no VPS. Para mostrar
os agentes locais, é necessário conectar o acesso remoto à instância local por
um túnel autenticado ou implementar uma sincronização autenticada entre as
instâncias. Outra opção é executar os agentes no próprio servidor, com suas
contas e pastas configuradas ali.

Os avisos de terminal, mensagens e criação de agentes desligados são separados
do 502. Não use `HABBLAUD_BIND=127.0.0.1` para simular isolamento de um container
exposto pelo proxy. A habilitação desses recursos exige uma arquitetura de acesso
autenticado e conexão com o computador onde os agentes realmente executam.

Referência: [App Service — Easypanel](https://easypanel.io/docs/services/app).
