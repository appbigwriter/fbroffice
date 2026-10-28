# Adicionar projetos ao escritório

Na lista lateral do Habblaud, clique em **+ Adicionar projeto**. Se ela estiver
fechada, abra pelo botão de painel lateral na barra superior.

1. Escolha um projeto recente, informe seu caminho absoluto ou clique em **Escolher pasta**.
2. Opcionalmente dê um nome à sala.
3. Deixe **Manter no escritório mesmo sem sessão aberta** marcado para fixar a sala.
4. Clique em **Adicionar ao escritório**.

A pasta é verificada no computador antes de salvar. Adicionar não cria uma conversa
nem dispara uma tarefa: os personagens aparecem quando há sessões reais abertas
nessa pasta. Uma sala sem agentes mostra **Sem sessão aberta**.

O mesmo painel permite **renomear**, **fixar/desafixar** e **ocultar/mostrar**.
O atalho **+ Agente Codex** abre outra conversa do aplicativo na pasta do projeto.
Envie a primeira mensagem no Codex para o novo agente começar e aparecer na mesma
sala. Você pode repetir o atalho para manter várias sessões em paralelo.
Ocultar retira a sala e seus personagens da apresentação; não encerra sessões.
Desafixar deixa a sala seguir a detecção automática e desaparecer quando não houver
sessões. Projetos ocultos continuam no painel para poderem ser restaurados.

**Atualizar detecção** consulta novamente as fontes de sessões e atualiza as sugestões
do histórico. Isso não retoma conversas arquivadas ou fechadas do Codex.

## Windows e Docker

O seletor e a validação de caminhos do computador usam o bridge nativo. Ele já pode
ser mantido em segundo plano com `npm run codex:auto:install`; confira usando
`npm run codex:auto:status`. Escolher pasta abre uma janela local do Windows somente
depois do clique. Cancelar essa janela não adiciona nem altera projetos.

O servidor salva o cadastro em `HABBLAUD_DATA_DIR/projects.json`; no Docker, fica
no volume de dados existente. Os nomes personalizados já existentes continuam
compatíveis com o menu de renomear salas. Caminhos Windows com diferença apenas de
caixa ou barras são associados à mesma sala; caminhos POSIX preservam caixa.

O gerenciamento só funciona pela porta local e com o acesso local habilitado.
Não se expõe o seletor ou caminhos de projetos pela porta de acesso remoto.

## Verificação da implementação

- Testes de persistência, pasta inexistente/inválida, confirmação divergente ou
  expirada, associação Windows, saída de agentes, ocultar/restaurar e HTTP local.
- Teste integrado das rotas com o bridge verificando uma pasta real temporária.
- Verificação no navegador em servidor isolado, sem sessões pessoais nem Habblaud
  World: adicionar, renomear, recarregar, ocultar e restaurar.
- A suíte geral mantém as 17 falhas Windows registradas antes desta mudança; o
  recorte de projetos, modelo do escritório, lista lateral e bridge passa.
