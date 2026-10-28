# Publicar FBR News Office

Esta distribuição preserva o Habblaud sob MIT. O arquivo `LICENSE` original e seu
copyright de Márcio Junior não devem ser substituídos pelo nome da FBR. O `NOTICE`
identifica a origem, a revisão de base e as modificações. Os READMEs em quatro
idiomas identificam o projeto como distribuição modificada.

## Avisos distribuídos

`npm run licenses` gera `THIRD_PARTY_NOTICES.txt` a partir dos pacotes instalados
do lockfile, incluindo os textos de licença e NOTICE fornecidos por cada pacote.
Os pacotes nativos sem arquivo separado usam o aviso do mesmo projeto upstream
(esbuild, rolldown e xterm). Se um pacote não tiver aviso conhecido, a geração
falha em vez de inventar ou omitir a licença.

`npm run build` executa essa geração e distribui `LICENSE`, `NOTICE` e os avisos
em `/legal/`, acessíveis em Configurações → Sobre. A fonte Pixelify Sans preserva
a licença OFL; componentes Apache preservam seus NOTICE. Dependências têm suas
próprias licenças: a marca FBR não as converte em MIT.

## Antes do push

1. Rodar `npm ci`, `npm run typecheck`, `npm test` e `npm run build`.
2. Conferir `git status` e o conteúdo de cada arquivo novo ou alterado.
3. Não versionar `.env`, cópias de configuração, senhas, chaves privadas,
   credenciais OAuth, cookies, logs nem conversas. O `.gitignore` cobre esses
   arquivos conhecidos, mas não substitui a revisão do conteúdo.
4. Manter o histórico de origem ou apontar claramente para o upstream. Um fork
   no GitHub é uma opção, não uma obrigação da MIT.
5. Ao criar o repositório FBR, atualizar os links de repositório e a política de
   releases para o endereço real, sem atribuir ao autor original as mudanças FBR.

Direitos de marca e termos das contas dos provedores não são concedidos pela
MIT. O painel não deve extrair OAuth do Gemini para acessar backends internos,
executar GLM Coding Plan fora dos usos autorizados nem contornar cotas. Usar
exportações locais e interfaces de uso permitidas, com procedência e data.

Esta preparação verifica os avisos e os arquivos desta distribuição; ela não
certifica direitos sobre conteúdo externo, conteúdo dos usuários ou usos futuros.
