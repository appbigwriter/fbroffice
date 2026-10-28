# Revisão da distribuição FBR News Office

Revisão técnica em 28 de outubro de 2026, para publicar esta distribuição do
código. Não é uma certificação jurídica de todos os usos do produto.

## Origem e permissões

- Base: [Habblaud, revisão faa1a012](https://github.com/marmottajr/habblaud/tree/faa1a012b5fbf632c66dc6801c5383e53a542406).
- O `LICENSE` foi comparado com o [arquivo original](https://github.com/marmottajr/habblaud/blob/faa1a012b5fbf632c66dc6801c5383e53a542406/LICENSE):
  conteúdo idêntico, normalizando apenas as quebras de linha Windows/Unix.
- A MIT autoriza copiar, modificar e distribuir, inclusive comercialmente,
  preservando seu copyright e texto de licença nas cópias ou partes substanciais.
- O copyright de Márcio Junior foi mantido. `NOTICE` e os quatro READMEs
  identificam a distribuição modificada e sua origem.
- A marca FBR não altera a licença dos componentes. Os nomes dos provedores não
  significam patrocínio, parceria ou autorização para usar suas contas.

## Materiais e dependências

Os avisos dos pacotes instalados são reunidos em `THIRD_PARTY_NOTICES.txt`.
O inventário é específico da plataforma de build: nesta verificação, 50 pacotes
no Windows e 48 no Docker Linux. Inclui ferramentas de desenvolvimento, ainda
que elas não sejam distribuídas como dependências de runtime.

A fonte Pixelify Sans mantém a OFL. Avisos de componentes MIT, Apache e outras
licenças permanecem nos textos gerados. Imagens originais permanecem com a
declaração de origem por IA já fornecida pelo README upstream; esta revisão
não afirma exclusividade autoral nem valida direitos sobre marcas retratadas.

`npm run build` gera os avisos para `/legal/`, acessíveis pelo painel Sobre.
A imagem Docker também contém os três arquivos na raiz `/app`. Foi verificado
que as cópias da raiz e da interface são idênticas.

## Verificação dos arquivos para publicação

A varredura dos arquivos candidatos ao Git examinou 534 arquivos de texto;
71 arquivos binários foram separados dessa análise textual. Não foram
encontrados arquivos com nomes de credenciais privadas entre os candidatos.
As seis ocorrências dos padrões de chaves pesquisados estavam em testes de
mascaramento de segredos, com valores ilustrativos.

Isso não substitui revisão de alterações futuras, análise de todos os formatos
de segredo ou verificação manual de materiais binários. O `.gitignore` exclui
os arquivos locais conhecidos de credenciais, certificados, logs e configuração.

## Validação técnica

- `npm run typecheck`: passou.
- `npm run build`: passou, com os avisos de licença.
- `docker build`: passou, com os avisos dentro da imagem final.
- Traduções dos quatro textos de créditos: presentes em inglês, espanhol e francês.
- Suíte completa no Windows: 1.854 testes passaram, 17 falharam e 18 foram
  ignorados. As falhas estão nos mesmos arquivos já identificados na execução
  anterior; a suíte não é apresentada como integralmente aprovada.

## Limites desta revisão

Termos das APIs e assinaturas são contratos separados da MIT. Uma conta adicional
não autoriza contornar cotas, compartilhar credenciais indevidamente ou reutilizar
OAuth fora do cliente autorizado. Publicar o código também não autoriza publicar
conversas, dados pessoais ou segredos dos usuários.

Novas imagens, código ou dependências exigem nova conferência. Questões de
titularidade da marca FBR, conteúdo de terceiros ou exploração comercial que
dependam de interpretação jurídica devem ser avaliadas por profissional habilitado.
