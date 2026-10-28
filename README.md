# FBR News Office — by Habblaud

Distribuição modificada do [Habblaud](https://github.com/marmottajr/habblaud),
criado por Márcio Junior sob a [licença MIT](habblaud/LICENSE).
O aplicativo e sua documentação estão em [habblaud/](habblaud/README.pt-BR.md).
Consulte os [créditos](habblaud/NOTICE) e os
[avisos de terceiros](habblaud/THIRD_PARTY_NOTICES.txt).

## Easypanel

Para compilar a partir da raiz deste repositório:

- Contexto de build: raiz do repositório (`.`).
- Dockerfile: `Dockerfile`.
- Porta interna do serviço: `4747`.
- Volume persistente: `/data`, gravável pelo usuário `node` (UID 1000).

O Dockerfile da raiz copia o aplicativo de `habblaud/`. Não basta apontar para
`habblaud/Dockerfile` mantendo a raiz como contexto: as instruções `COPY` desse
arquivo esperam que o próprio contexto seja a pasta `habblaud/`.

Validação local:

```sh
docker build -t fbroffice:local .
```

Veja o [guia de domínio, senha e diagnóstico de 502](habblaud/docs/easypanel.md).
Para executar projetos e agentes na VM, veja [Codex no servidor com assinatura ChatGPT](habblaud/docs/server-codex.md).

Para acesso pela internet, configure autenticação antes de publicar o domínio.
A porta 4747 é a interface local, sem o login do listener remoto do Habblaud.
Não a exponha publicamente sem proteção de acesso no proxy.
