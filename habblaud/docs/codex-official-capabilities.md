# Capacidades oficiais do Codex para o Habblaud

Pesquisa em 2026-10-27. Código examinado: `faa1a012b5fbf632c66dc6801c5383e53a542406`.
Escopo: análise estática, documentação oficial e ajuda da CLI local `codex-cli 0.164.0`.
Nenhum hook foi instalado; nenhuma sessão foi iniciada, retomada ou modificada.

## O que a documentação estabelece

**Hooks — fato.** Há `SessionStart`, `SessionEnd`, `UserPromptSubmit`, `PreToolUse`,
`PermissionRequest`, `PostToolUse`, `PreCompact`, `PostCompact`, `SubagentStart`,
`SubagentStop`, `Stop` e `Interrupt`. Hooks não gerenciados exigem revisão e confiança.
`PermissionRequest` aceita `hookSpecificOutput.decision.behavior` como `allow` ou
`deny`; ausência de decisão preserva a aprovação normal. `updatedInput`,
`updatedPermissions` e `interrupt` não são saídas válidas desse evento. Hooks
assíncronos não decidem aprovações e podem terminar fora de ordem. Ferramentas
hospedadas, como busca web, não passam pelos hooks locais de ferramenta.
Há `commandWindows`; `SessionEnd` é síncrono e não ocorre imediatamente ao trocar
de conversa. [Fonte: Hooks](https://learn.chatgpt.com/docs/hooks).

**Protocolo — fato.** App-server oferece JSON-RPC por stdio, APIs de threads,
`turn/start`, `turn/steer`, `turn/interrupt`, notificações de itens e estado, pedidos
de aprovação, perguntas e limites de conta. `turn/steer` exige o turno ativo correto.
`thread/read` consulta sem retomar; `thread/resume` carrega e assina eventos.
`account/rateLimits/read` oferece percentuais, duração e reinício das janelas, com
visão por bucket em `rateLimitsByLimitId`. A documentação classifica app-server e
WebSocket como experimentais. Gere bindings com a CLI da versão alvo.
[Fonte: App-server](https://learn.chatgpt.com/docs/app-server).

**Mensagens — fato.** `codex queue --thread <UUID> --message <texto>` é documentado
como estável; permite UUID ou nome exato. A documentação exclui anexos de imagem
desse comando. A ajuda local confirma o comando e mostra também `app-server proxy`,
que encaminha stdio ao socket de controle de um servidor existente, e gerenciamento
de daemon. Ajuda não prova interoperabilidade com qualquer processo do Desktop.
[Fonte: CLI](https://learn.chatgpt.com/docs/cli/reference); evidência local:
`codex --version`, `codex queue --help`, `codex app-server proxy --help` e
`codex app-server daemon --help`.

**Windows — fato.** Codex suporta execução nativa com PowerShell e sandbox do Windows;
WSL2 é uma alternativa. Portanto, suporte ao Codex não implica obrigação de usar WSL.
[Fonte: Windows sandbox](https://learn.chatgpt.com/docs/windows/windows-sandbox).

## Confronto com o código deste checkout

| Área | Evidência do repositório | Consequência para a implementação |
| --- | --- | --- |
| Observação | `server/sources/codex/` já contém descoberta, rollout, histórico, terminal e eventos ao vivo. | Aproveitar o adaptador existente e validar os esquemas reais da versão alvo. |
| Aprovações | `mod/habblaud-codex/hook.mjs` já devolve o formato `PermissionRequest` correto, com desistência em falha/timeout. | Não é necessário substituir a integração de permissões apenas por ser Codex. |
| Eventos ausentes | `server/sources/codex/source.ts` trata `PreCompact`, `PostCompact` e `Interrupt`; `scripts/codex-install.ts` e o conjunto `OBSERVED` do hook não os enviam. | Completar registro e encaminhamento, com teste de interrupção e compactação. |
| Mensagens | `server/messages/codex.ts` já usa `codex queue`; o bridge apenas o executa no host. | Distinguir confirmação de enfileiramento de processamento efetivo pela sessão. |
| Limites | `server/sources/codex/rollout.ts` extrai `token_count.rate_limits`. | Confirmar atualização e esquema; polling oficial é alternativa a avaliar, não dependência obrigatória. |
| Windows | `scripts/codex-install.ts:probeNode` tenta shell Unix; `findCodexBin` aceita somente `codex.exe` no PATH nativo. Aqui `Get-Command codex` resolveu `codex.ps1` do npm. | Resolver o executável nativo da instalação npm ou fornecer caminho explícito; testar caminhos com espaços, shell e hooks. |

## Decisão arquitetural proposta — inferência

Manter arquivos locais e hooks como caminho de observação de sessões já abertas.
Preservar `codex queue` para enviar seguimentos. Isso resolve parte importante da
paridade sem reescrever o produto.

Avaliar app-server como camada adicional para criar sessões Codex pelo escritório,
receber perguntas estruturadas, oferecer interrupção e direcionamento durante o
turno e acompanhar processos com eventos. A vantagem depende de uma conexão à
instância que efetivamente possui a conversa. Apenas iniciar outro processo com o
mesmo `CODEX_HOME` não demonstra posse nem assinatura de sessões do Desktop.

## Questões que exigem prova prática

1. Qual combinação de versões CLI/Desktop será suportada? Há diferenças entre
   ajuda local, documentação e formatos internos dos arquivos.
2. O proxy/socket ou um transporte disponível permitem assinar a instância dona das
   sessões do Desktop no Windows? Verificar conexão e eventos sem tomar posse de
   conversas por `thread/resume` indiscriminado.
3. Como perguntas de `request_user_input` e elicitações serão encaminhadas e resolvidas?
   Não confundir pedido de aprovação de ferramenta com resposta a pergunta.
4. Hooks e filas continuam corretos com eventos concorrentes, Habblaud fechado,
   sessão arquivada, múltiplos `CODEX_HOME`, Windows e Docker?

Esta pesquisa não comprova funcionamento ponta a ponta das integrações existentes.
Não há evidência suficiente para prometer controle integral de sessões arbitrárias
do Desktop; também não há fundamento para declarar esse controle impossível.
