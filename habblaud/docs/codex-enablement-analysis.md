# Habblaud: análise de habilitação integral no Codex

Data: 2026-10-27. Repositório: https://github.com/marmottajr/habblaud.
Versão examinada: 1.0.3, commit `faa1a012b5fbf632c66dc6801c5383e53a542406`.

## Conclusão

O upstream já implementa uma integração extensa com Codex. O trabalho é completar
a paridade funcional e validar Windows/CLI/Desktop/Docker, aproveitando o adaptador
existente. Não há motivo demonstrado para reescrever o escritório ou substituir
Claude Code pelo Codex em todo o código.

Para desenvolver este repositório com Codex, já existe `AGENTS.md`, com as mesmas
orientações de `CLAUDE.md`. Para visualizar e controlar agentes Codex no produto,
há funcionalidades implementadas e lacunas concretas, discriminadas abaixo.

Esta entrega é uma análise: clone, instalação de dependências de desenvolvimento,
compilação, testes e consultas somente de leitura. Nenhum código de execução ou
configuração global foi alterado, nenhum hook foi instalado e nenhuma mensagem foi
enviada a sessões reais.

## Arquitetura encontrada

`server/sources/source.ts` define o contrato de fonte de agentes. O bootstrap em
`server/index.ts` registra `CodexSource` junto à fonte Claude, conecta os hooks a
`POST /api/codex/events` e adiciona `CodexHistory` ao histórico compartilhado.

O caminho Codex existente é:

```text
CODEX_HOME/sessions + archived_sessions + thread-writer-locks
  -> server/sources/codex -> Office -> SSE -> interface pixel art

hooks.json -> mod/habblaud-codex/hook.mjs
  -> eventos / pedido de aprovação -> Habblaud -> decisão do hook

mensagem na interface -> fila -> codex queue
  (Node: servidor executa; Docker: scripts/codex-bridge.ts no host)
```

O parser já diferencia histórico legado e paginado. Não se deve tratar o formato
paginado, nem a descoberta de subagentes, como recursos ausentes.

## Matriz de paridade

“Implementado” descreve o código e seus testes; não equivale a validação ponta a
ponta com todas as versões e superfícies do Codex.

| Recurso | Situação encontrada | Trabalho necessário |
| --- | --- | --- |
| Sala, personagem, identidade do provedor | Implementado em `server/sources/codex/` e `client/src/ui/provider.ts`. | Validar com CLI e Desktop reais. |
| Atividades e estado ao vivo | Rollouts + hooks implementados. | Fechar eventos ausentes e testar ordem, concorrência e reconexão. |
| Subagentes e relação pai/filho | Metadados de threads e hooks já interpretados. | Validar múltiplos níveis e término/interrupção na versão alvo. |
| Plano de tarefas, conversa e histórico | Parsers específicos Codex existentes. | Regressões para versões suportadas e histórico extenso. |
| Uso de tokens e cotas 5h/semanal | Extração de `token_count.rate_limits` implementada. | Cotas só atualizam com registros novos; considerar múltiplos buckets. |
| Aprovar/recusar ferramentas | Hook `PermissionRequest`, registro e UI implementados. | Validar aprovação, recusa e retorno ao terminal com falha/timeout. |
| Perguntas estruturadas ao usuário | A integração Codex atual não oferece resposta externa. | Avaliar encaminhamento via protocolo oficial, ligado à instância dona da sessão. |
| Mensagens de texto | `codex queue` e bridge implementados. | Validar entrega real, além de sucesso ao enfileirar. |
| Criar agente pelo escritório | `server/spawn/spawn.ts` usa `claude --bg` e `claude://code/new`. | Acrescentar seleção de provedor/conta e criação de thread Codex. |
| Terminal interativo, assumir e encerrar | `server/pty/manager.ts` usa processo/registro/CLI Claude; `ptyControllable` exclui Codex. | Projetar controle de threads Codex e distinguir interromper turno, fechar conversa e encerrar processo. |
| Entregas e arquivos | Modelo de entregas aceita provedor; leitura de arquivos conserva premissas Claude/POSIX. | Validar projetos só Codex e caminhos Windows, inclusive no bridge. |
| Conversas compactadas | `.jsonl.zst` é reconhecido e explicitamente não lido. | Adicionar leitura limitada/compatível ou recuperação oficial de histórico. |
| Conversas cloud sem arquivos locais | Fora do mecanismo atual, conforme README. | Escopo separado se “integral” incluir cloud; não prometer acesso por observar arquivos locais. |

## Achados concretos

### 1. Três eventos tratados nunca chegam pelo hook instalado

`server/sources/codex/source.ts` aceita `PreCompact`, `PostCompact` e `Interrupt`.
Entretanto, `OBSERVE_EVENTS` de `scripts/codex-install.ts` e `OBSERVED` de
`mod/habblaud-codex/hook.mjs` não os incluem. Completar as duas listas e testar o
caminho inteiro evita depender exclusivamente da gravação posterior do rollout.
Os eventos são documentados oficialmente em [Hooks](https://learn.chatgpt.com/docs/hooks).

### 2. Windows precisa de validação própria

`probeNode` do instalador tenta `$SHELL` ou `/bin/sh`; depois consegue usar
`process.execPath`, como ocorreu aqui. É um fallback funcional com diagnóstico
inadequado, não prova de que os hooks falham no Windows.

`findCodexBin` procura `codex.exe`; instalações npm com apenas wrappers no PATH
precisam de descoberta do executável nativo ou `HABBLAUD_CODEX_BIN`. Nesta máquina
há tanto wrappers npm quanto um executável nativo do Desktop no PATH. O binário
nativo consultado informa `0.164.0-alpha.11.1` e tem `queue --help`.

Há também um problema de execução além dos testes: `pathProblem`, em
`server/deliveries/files.ts`, exige caminho começando por `/`. Um caminho absoluto
Windows com unidade ou UNC é rejeitado. `insideKnownFolder` autoriza projetos pelo
registro `<conta Claude>/projects/<cwd codificado>`, o que não representa projetos
exclusivos Codex. Corrigir normalização e autorização sem ampliar leitura arbitrária.

### 3. Limites de conta não são custo financeiro

O parser soma tokens sem duplicar cache, mas não calcula custo Codex. Também
descarta `limit_id` diferente de `codex`. Para paridade com contas/modelos que têm
cotas separadas, representar buckets explicitamente e preservar estado desconhecido
ou desatualizado. Não converter uso de assinatura em custo monetário estimado sem
uma especificação independente.

### 4. Controle integral precisa de mais que hooks

Hooks existentes atendem observação e aprovação binária; não oferecem toda a
experiência de perguntas, criação e controle de conversas. Recomenda-se avaliar
App-server como transporte adicional: a OpenAI o indica para aplicações com
conversas persistentes, streaming e aprovações. [Fonte oficial](https://developers.openai.com/blog/codex-as-a-platform).

A escolha depende de um experimento: criar e acompanhar threads próprias e
comprovar conexão/assinatura na instância que possui uma conversa do Desktop.
Iniciar outro processo ou executar `thread/resume` indiscriminadamente não prova
essa interoperabilidade. A CLI tem proxy/socket, mas suporte Windows e alcance das
sessões existentes precisam ser medidos. Ver a [pesquisa de capacidades](codex-official-capabilities.md).

## Estado observado nesta máquina

- Clone local em `F:\Projetos\_FBR\VirtualOffice\habblaud`.
- Node `24.11.1`, npm `11.19.0`; o requisito Node `>=22.12` foi atendido.
- `npm run codex:status` encontrou nove grupos de hooks já instalados, apontando
  para outra cópia do Habblaud, em `AppData/Local/Habblaud/host`.
- `GET http://127.0.0.1:4747/api/health` respondeu versão 1.0.3, Docker ativo,
  fonte Codex e recursos de eventos, terminal, mensagens e permissões habilitados.
- Flags de saúde indicam disponibilidade; não demonstram que mensagens chegaram,
  que hooks estão confiáveis ou que uma aprovação foi aplicada.
- O aviso de caminho diferente do `codex:status` compara a instalação existente
  com este clone. Ele não demonstra uma instalação quebrada.

Não reinstalar hooks automaticamente a partir deste clone: decidir primeiro qual
cópia será a instalação de execução. A confiança dos hooks continua sendo feita
pelo usuário na superfície suportada pelo Codex.

## Validação executada

| Verificação | Resultado |
| --- | --- |
| `npm ci --no-audit --no-fund` | Concluiu. npm informou scripts de instalação de esbuild e node-pty ainda não aprovados; isso limita conclusões sobre PTY nativo. |
| `npm run typecheck` | Passou. |
| `npm run build` | Passou; aviso de tamanho de bundle no cliente. |
| `npm test -- --reporter=dot` | 1.848 passaram, 18 falharam, 18 foram ignorados; 148 arquivos passaram e 10 falharam. |
| Reexecução completa com relatório JSON para classificar falhas | 1.849 passaram, 17 falharam, 18 foram ignorados. A diferença de uma falha entre execuções exige investigar instabilidade. |
| Recorte Codex, provedor e origem do uso | 130 passaram, zero falhas, seis ignorados, em 13 arquivos. |

As falhas da suíte completa ocorrem no checkout sem alteração de código. Há
asserções POSIX de caminhos e modo `0600`, finais de linha e funcionalidades
adjacentes. As seis exclusões do recorte Codex incluem execução de binário falso
com shebang, que os testes não executam no Windows. Não são prova de falha das
mensagens reais, mas deixam esse caminho sem validação de processo nesta plataforma.

A CI atual (`.github/workflows/ci.yml`) só executa em Ubuntu. Acrescentar Windows
com fixtures de processo adequadas faz parte dos critérios de conclusão.

## Sequência recomendada

1. **Consolidar a base existente:** corrigir os três eventos; diagnóstico do Node
   e do executável; testes Windows de arquivos e de envio de mensagens; documentação
   de uso exclusivamente Codex. Manter o adaptador de leitura e os hooks.
2. **Provar o transporte de controle:** em uma thread de teste explícita, validar
   criação, eventos, pergunta, aprovação, mensagem durante turno, interrupção e
   reconexão. Separar threads próprias das apenas observadas. Não usar conversas
   reais para experimentar retomada ou transferência de controle.
3. **Completar a interface:** capacidades por sessão/provedor em vez de assumir
   Claude por padrão para controles; seletor Codex em “Novo agente”; respostas a
   perguntas; botões de controle conforme o transporte disponível. Manter tradução
   em quatro idiomas e changelog para cada mudança visível.
4. **Fechar histórico e operação:** compactação `.zst`, buckets de uso, anexos e
   projetos só Codex; matriz CLI/Desktop × Windows/Linux/macOS × Node/Docker,
   com falhas e reconexões cobertas.

Não é necessário portar os mods proprietários Claude linha por linha, nem trocar
os arquivos `CLAUDE.md` para conseguir desenvolver com Codex. A meta verificável
é comportamento equivalente nos recursos aplicáveis, com limites explícitos para
sessões observadas, sessões controladas e conversas cloud.
