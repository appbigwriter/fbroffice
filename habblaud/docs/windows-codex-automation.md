# Habblaud com Codex no Windows: início automático

O servidor do escritório continua no container Docker existente. Um supervisor
nativo do Windows mantém a entrega de mensagens às sessões Codex em segundo plano.
Ele inicia no login do usuário, sem senha salva e sem janela de terminal. Assim,
ao abrir o Codex ou acessar http://localhost:4747/, o serviço já está disponível.

## Instalar ou atualizar

No PowerShell, na pasta deste repositório:

```powershell
npm ci
npm run codex:auto:install
npm run codex:auto:status
```

O instalador cria a tarefa **Habblaud Codex Bridge 4747** e a inicia imediatamente.
Ela usa o Node desta instalação e os fontes desta pasta. Não mova a pasta sem
reinstalar a tarefa. É necessário manter as dependências em `node_modules/`.

O supervisor:

- encontra o executável nativo do Codex no PATH ou na instalação npm do Windows;
- espera o servidor responder antes de iniciar o bridge;
- inicia o Docker Desktop, se instalado e ainda não estiver rodando;
- inicia o container `habblaud` existente, se estiver parado;
- reconecta quando o servidor volta e reinicia o bridge se ele terminar;
- mantém uma única instância gerenciada por porta, inclusive ao executar o supervisor manualmente;
- continua funcionando ao fechar PowerShell, Codex ou a aba do navegador.

Ele não cria nem substitui containers. Docker Desktop e o container Habblaud
precisam estar instalados previamente. O computador precisa estar ligado e o
usuário conectado ao Windows. Recuperação de container é verificada a cada 30 s;
recuperação do bridge, a cada 5 s. A tarefa não tem limite de duração e pode rodar
com o computador na bateria.

## Consultar e recuperar

```powershell
npm run codex:auto:status
Start-ScheduledTask -TaskName 'Habblaud Codex Bridge 4747'
```

Logs: `%LOCALAPPDATA%\Habblaud\bridge-4747\service.log`, `bridge.log` e
`bridge-error.log`. Eles não registram o texto das mensagens. O log do supervisor
tem rotação de tamanho; os logs do bridge anterior são preservados com `.1` ao
reiniciá-lo.

O comando manual continua disponível para diagnóstico:

```powershell
npm run codex:bridge -- --once
```

Não é necessário deixá-lo aberto depois de instalar a tarefa. Uma instalação npm
do Codex funciona mesmo que `codex.exe` não esteja diretamente no PATH: o bridge
procura o executável nativo dentro do pacote e não executa `codex.cmd` por shell.
`HABBLAUD_CODEX_BIN` continua sendo uma configuração explícita e tem precedência;
se ela aponta para um arquivo inexistente, corrija-a em vez de usar outra instalação
silenciosamente.

Para outra porta ou container:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/codex-service.ps1 -Action Install -Port 4848 -Container habblaud-outro
```

## Remover

```powershell
npm run codex:auto:uninstall
```

Isso encerra a tarefa e remove sua inicialização automática. O container, os hooks,
as sessões Codex e os logs são preservados.

## Separar mensagens de criação de agentes

Criação de agentes e entrega de mensagens são recursos diferentes. O bridge
consulta `/api/access` e não tenta criar agentes quando `spawn` está desligado.
Um `403` nesse recurso não deve impedir nem invalidar mensagens Codex.

O recurso de criar agentes do upstream ainda inicia Claude Code. Esta automação
não converte esse recurso em criação de agentes Codex nem altera a confiança dos
hooks. Para conversar com uma sessão Codex existente, clique no personagem e use
**Mandar mensagem**. Hooks são configurados separadamente e sua aprovação continua
dependendo do usuário.

## Migração desta máquina (2026-10-28)

A tarefa Windows usa os fontes de `F:\Projetos\_FBR\VirtualOffice\habblaud`.
O antigo serviço `habblaud-codex-bridge` no Ubuntu/WSL foi desabilitado para evitar
dois entregadores. Outros serviços WSL, o container e os hooks instalados não foram
substituídos. Para reverter exclusivamente o serviço antigo, após remover a tarefa
Windows: `wsl -d Ubuntu -- systemctl --user enable --now habblaud-codex-bridge`.

Foi verificado que o bridge encontra o Codex instalado pelo npm, conecta à API e
habilita mensagens na sessão real. Também foi encerrado somente o processo filho
gerenciado: o supervisor criou outro PID em até sete segundos. Nenhuma mensagem
de teste foi enviada a conversas reais.

Validação do código: tipos e build passaram; 23 testes do bridge e de mensagens
passaram, com cinco exclusões previstas no Windows. A suíte completa teve 1.851
testes aprovados, 17 falhas e 18 exclusões; as 17 falhas correspondem às já
registradas na análise anterior deste Windows (caminhos, permissões POSIX e
funcionalidades adjacentes). A remoção automática foi testada: tanto a tarefa
quanto seu processo filho foram encerrados, e a instalação foi refeita com sucesso.
