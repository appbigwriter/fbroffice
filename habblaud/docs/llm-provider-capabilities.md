# Cotas e consumo: Gemini e GLM

Pesquisa de fontes primárias em 2026-10-28. Escopo deste documento: Gemini CLI e
Z.AI/GLM; complementar à análise do Codex. Nenhuma credencial, chave, token OAuth
ou conversa privada foi lida. Nenhuma chamada autenticada foi executada.

## Conceitos para o painel

Separar três medidas: tokens observados em sessões, cota da assinatura e cobrança
da API. Tokens de uma sessão não permitem calcular o saldo de uma assinatura
compartilhada entre ferramentas. Registrar a origem, a data da coleta, a conta,
o modelo/bucket e a unidade; ausência de informação deve aparecer como
"indisponível", nunca como 0% consumido ou 100% livre.

## Gemini CLI

**Fatos oficiais.** A CLI aceita login Google, chave `GEMINI_API_KEY` e Vertex AI
(inclusive ADC, com projeto e localização). O método de autenticação determina o
produto, a cota e a cobrança. As credenciais Google ficam sob responsabilidade da
CLI. [Autenticação](https://geminicli.com/docs/get-started/authentication/).

`/stats model` mostra tokens da sessão e informações dos limites aplicáveis.
Limites diários variam conforme plano; uma solicitação do usuário pode gerar
várias chamadas de modelo. Não tratar contagem de prompts como chamadas nem
congelar limites comerciais no código.
[Cotas e preços](https://geminicli.com/docs/resources/quota-and-pricing/),
[Google Cloud: quotas](https://docs.cloud.google.com/gemini/docs/quotas).

A FAQ proíbe colher/reutilizar OAuth da Gemini CLI em terceiros para acessar seus
backends. Para agentes de terceiros, indica Vertex AI ou AI Studio. Portanto,
não criar coletor que leia `oauth_creds.json` e consulte endpoints internos.
[FAQ oficial](https://geminicli.com/docs/resources/faq/).

**Coleta suportada.** OpenTelemetry oferece `gemini_cli.token.usage` (modelo e
categorias input/output/thought/cache/tool), `gemini_cli.api.request.count`
(modelo/status/erro), exportação local e OTLP. São métricas de consumo observado;
a referência examinada não publica uma API de saldo da assinatura. Desabilitar
prompts em telemetria (`GEMINI_TELEMETRY_LOG_PROMPTS=false`) e filtrar somente
métricas necessárias. [Telemetria](https://geminicli.com/docs/cli/telemetry/).

Hooks `AfterModel` recebem resposta de modelo; a API estável documenta
`usageMetadata.totalTokenCount`. Isso permite um adaptador local de tokens sem
acesso às credenciais. Não há evidência nessa especificação de saldo global de
cota no payload do hook. [Hooks](https://geminicli.com/docs/hooks/reference/).

**Recomendação.** Integrar métricas locais e, quando disponível por um mecanismo
suportado da própria CLI, os números de `/stats model`. Até existir exportação
de cota comprovada, mostrar consumo observado e saldo indisponível. API/Vertex
exigem monitoramento de projeto e orçamento próprio, sem converter isso em saldo
Google AI Pro/Ultra. Não prometer evitar todos os 429.

## Z.AI / GLM Coding Plan

**Fatos oficiais.** O plano possui créditos em janelas de 5 horas e semanal;
modelos, tokens em cache e ferramentas possuem pesos diferentes. Existe desconto
fora do pico; a regra publicada nesta data define pico de segunda a sexta,
14h–18h UTC+8 (03h–07h em São Paulo, UTC−3). Preservar regras versionadas e
timestamps do servidor, em vez de assumir quantidade fixa de tokens por plano.
[Visão geral](https://docs.z.ai/devpack/overview).

As ferramentas suportadas compartilham a cota. Esgotar o Coding Plan não implica
fallback automático cobrado no saldo da API. Os usos do plano são restritos às
ferramentas/produtos suportados.
[FAQ](https://docs.z.ai/devpack/faq),
[Política de uso](https://docs.z.ai/devpack/usage-policy).

Chaves novas de plano individual, equipe e API padrão são separadas e não
intercambiáveis. Bases publicadas: Anthropic
`https://api.z.ai/api/anthropic`, Chat Completions
`https://api.z.ai/api/coding/paas/v4`, Responses
`https://api.z.ai/api/v1`. Essas são rotas de inferência, não medidores de cota.
[Quick Start](https://docs.z.ai/devpack/quick-start).

### Consulta programática: implementação oficial disponível

O repositório oficial `zai-org/zai-coding-plugins` contém um script de consulta
que usa:

- `GET https://api.z.ai/api/monitor/usage/quota/limit`;
- `GET https://api.z.ai/api/monitor/usage/model-usage?startTime=...&endTime=...`;
- `GET https://api.z.ai/api/monitor/usage/tool-usage?startTime=...&endTime=...`.

O script lê `ANTHROPIC_BASE_URL` e `ANTHROPIC_AUTH_TOKEN` do ambiente e envia o
valor do token diretamente no header `Authorization` (não acrescenta `Bearer`).
Para a plataforma chinesa usa a origem `https://open.bigmodel.cn`. O tratamento
legado identifica `TOKENS_LIMIT` e `TIME_LIMIT`; campos desconhecidos permanecem.
[Fonte primária: script oficial](https://github.com/zai-org/zai-coding-plugins/blob/main/plugins/glm-plan-usage/skills/usage-query-skill/scripts/query-usage.mjs).

**Grau de garantia.** A consulta tem precedente de implementação oficial; não foi
encontrado contrato público versionado de resposta na referência API examinada.
Não afirmar que não existe consulta; também não apresentar esse script como
garantia de estabilidade de esquema. Validar os tipos atuais de chave, unidades,
janelas e resets com uma conta autorizada antes de implementar o coletor.

**Credenciais.** O Habblaud deve guardar apenas a referência à variável de ambiente
ou ao segredo no cofre do sistema, não a chave na configuração retornada ao
cliente. `ZAI_API_KEY` pode ser um nome adotado pelo adaptador; o script oficial
examinado usa `ANTHROPIC_AUTH_TOKEN`. Nunca extrair chaves de configurações de
outros agentes, expor headers ou seguir redirects com credenciais.

## Alertas e prevenção propostos — decisões de produto

1. Alertar por janela e conta, por exemplo em 70%, 85% e 95%, com histerese para
   evitar alertas repetidos. Esses limiares são política do produto.
2. Exibir idade da coleta e suspensão do coletor; 401/403/timeout não significam
   saldo esgotado. Usar backoff e cache por conta para não consultar por agente.
3. Estimar tempo até o limite pelo ritmo recente somente quando houver amostras
   suficientes; rotular como estimativa e respeitar resets e janelas distintas.
4. Antes de iniciar trabalho grande, recomendar modelo/conta/provedor alternativo
   configurado e permitido, ou aguardar reset. Transferência requer resumo de
   contexto e checkpoints; saldo disponível não garante capacidade equivalente.
5. Não disparar fallback pago nem consumir cartão/reset de quota automaticamente
   sem política explícita do usuário. Preferir recomendação acionável no painel.

Este documento é análise; não comprova coleta autenticada nem implementa roteamento.

## Anexo técnico: captura de consumo Gemini

A referência de hooks define `hooks.AfterModel` no `settings.json`:

```json
{
  "hooks": {
    "AfterModel": [{
      "hooks": [{
        "type": "command",
        "name": "habblaud-usage",
        "command": "node /caminho/absoluto/hook.mjs",
        "timeout": 5000
      }]
    }]
  }
}
```

`timeout` é em milissegundos. Stdin inclui `session_id`, `transcript_path`, `cwd`,
`hook_event_name`, `timestamp`, `llm_request` e `llm_response`. A documentação
oferece `llm_request.model` e `llm_response.usageMetadata.totalTokenCount`.
**AfterModel dispara por chunk de streaming, não uma vez por chamada.**
[Referência](https://geminicli.com/docs/hooks/reference/).

Inspeção somente do código instalado `@google/gemini-cli` 0.40.1:

- Arquivo
  `C:/Users/OEM/AppData/Roaming/npm/node_modules/@google/gemini-cli/bundle/chunk-B6PIKVSF.js`:
  `toHookLLMResponse` (linha 297420), `fireAfterModelEvent` (322456),
  `createBaseInput` (322555). O tradutor preserva `promptTokenCount`,
  `candidatesTokenCount`, `totalTokenCount`; não repassa contadores de cache ou
  raciocínio. Não há ID de requisição no payload base. Timestamp identifica
  invocação, não operação faturável. Portanto, não somar chunks cegamente.
- Mesmo arquivo, `ChatRecordingService` (248596),
  `recordMessageTokens` (248780), fonte original indicada no bundle como
  `packages/core/src/services/chatRecordingService.ts`. O gravador preserva
  `tokens: {input, output, cached, thoughts, tool, total}` por mensagem
  `type: "gemini"`, com `id` UUID, `timestamp` ISO e `model`.
- `pushMessage` (248729) escreve novamente a mensagem quando há atualização;
  último registro de mesmo `id` substitui o anterior. Não é incremento.
- A versão atual grava JSONL com metadados iniciais
  `{sessionId, projectHash, startTime, lastUpdated, kind, directories}`;
  registros `{$set: {...}}` atualizam metadados. `{$rewindTo: id}` remove esse ID
  e os seguintes do histórico materializado. O carregador também aceita o legado
  JSON com `messages[]`; retomar legado cria `.jsonl` com os mesmos IDs.
- Diretório: `<globalGeminiDir>/tmp/<projectIdentifier>/chats/`.
  Arquivos principais `session-<data-minuto>-<8 caracteres do id>.jsonl`;
  subagentes ficam em `chats/<parentSessionId>/<childSessionId>.jsonl`.
  A resolução do diretório do projeto está em `chunk-UHHRGNIO.js:42457`.

**DTO mínimo recomendado, derivado do código:** conta local, `sessionId`,
`messageId`, `timestamp`, `model`, `tokens` e instante de observação. Não copiar
conteúdo, pensamentos, argumentos, respostas de ferramentas nem transcript para
o estado exposto. Chave de deduplicação: `(conta, sessionId, messageId)`;
último snapshot válido vence. Não somar `.json` e `.jsonl` migrados.

Rewind não restitui cota. Um ledger de consumo observado deve preservar mensagens
já contabilizadas mesmo quando desaparecem do histórico. Importação inicial não
recupera operações apagadas ou não gravadas; continua sendo consumo observado,
não saldo completo de conta. Campos são internos da CLI e exigem fixtures por
versão. Nenhum arquivo real de conversa foi aberto nesta pesquisa.

## Anexo técnico: resposta da consulta Z.AI

O script oficial citado acima aceita `json.data || json` e procura `limits`.
Seu pós-processamento legado só demonstra:

- `type: "TOKENS_LIMIT"`: lê `percentage`;
- `type: "TIME_LIMIT"`: lê `percentage`, `currentValue`, `usage`, `usageDetails`.

O script não estabelece esquema ou semântica de `unit`, `number`,
`nextResetTime` e `CREDIT_LIMIT`; inclusive rotula qualquer `TOKENS_LIMIT` como
5 horas, o que não basta para distinguir janelas atuais. Não copiar essa
suposição. Percentual explícito precisa ser número finito entre 0 e 100.
Não calcular percentual a partir de `currentValue/usage` sem confirmar a unidade
e a semântica no contrato ou em resposta autorizada. Janelas desconhecidas devem
aparecer como desconhecidas, com dados indisponíveis quando necessário.
