# Eventos do Diagnos Agent Office

Esta versão observa apenas `Diagnos-Engenharia/diagnos-agent-office`. O painel de DG Manual, DG Tech e Diagnos QA é informativo: nenhuma conexão de escrita ou alteração desses projetos é criada.

## Contrato e origem

`src/events/types.ts` define o contrato `OfficeEvent` compartilhado por interface, provedores e ingestão:

| Campo | Conteúdo |
| --- | --- |
| `id` | Identificador estável e seguro; reenvios são deduplicados |
| `agentId` | `orchestrator`, `dev`, `qa`, `security`, `ux` |
| `projectId` | `agent-office`, `dg-manual`, `dg-tech`, `diagnos-qa` |
| `source` | `github`, `qa`, `mcp`, `api`, `cli`, `deploy`, `simulation` |
| `provenance` | `real` ou `simulated` |
| `state` | `idle`, `working`, `waiting`, `error`, `success` |
| `type`, `title`, `detail?` | Identificação e descrição do fato observado |
| `timestamp` | ISO 8601 em UTC, normalizado pelo servidor |
| `url?` | Evidência usando HTTP/HTTPS |

`src/events/simulation.ts` é o único adaptador de demonstração. Usa sempre `source: simulation` e `provenance: simulated`. O servidor não converte falhas de conexão em trabalho fictício. Uma credencial de ingestão autoriza o emissor a declarar fatos observados; ela não comprova sozinha que um teste aconteceu. Os emissores devem publicar estados reais somente depois de observar a execução correspondente.

## GitHub real

`GET /api/github` consulta exclusivamente o repositório configurado no servidor. Lê os últimos commits da branch padrão e de `GITHUB_BRANCH` (padrão `diagnos-agent-office-preview`), os PRs recentemente atualizados, detalhes de arquivos e status externos já existentes. Uma atualização no PR ou no seu commit de origem recebe novo identificador. Commits que aparecem nas duas branches são deduplicados pelo SHA.

Um commit coloca Dev em `success` porque o commit foi registrado; **isso não comprova aprovação de testes**. Um PR aberto coloca Orquestrador em `waiting`, um rascunho em `working`, um PR integrado em `success`. QA e Segurança recebem resultados de status externos somente quando existirem no GitHub. Nenhum workflow GitHub Actions é criado, executado ou usado para validar esta implementação.

O token opcional `GITHUB_TOKEN` fica somente no servidor. **O preview público aceita somente repositórios públicos**, verificando essa condição antes de consultar commits/PRs. Repositórios privados podem ser observados apenas no servidor local, conectado em 127.0.0.1. Para esse uso local, conceda acesso de leitura a Contents e Pull requests; Commit statuses habilita a leitura opcional de resultados externos. Falhas em detalhes ou status opcionais aparecem em `connection.warning` sem ocultar commits/PRs verificados. Falha na consulta principal aparece em `connection.state: error`, preservando o último histórico verificado e `lastSync`.

Consultas simultâneas compartilham a mesma sincronização. Há ETags, limite de 20 segundos por sincronização, prazo de 8 segundos por pedido, limites de resultados e espera até a liberação após rate limit. Metadados são guardados por 15 minutos, detalhes de commits por 24 horas, detalhes de PR até nova atualização. Sem token, a sincronização e o cache compartilhado do preview usam **5 minutos**, respeitando o limite público de 60 pedidos/hora; com token, usam **60 segundos**. `connection.pollIntervalSeconds` comunica esse intervalo à interface. O preview mostra observações periódicas do GitHub, sem alegar acompanhar esta sessão do ChatGPT.

Referências: [ETags e consultas condicionais](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api), [limites da API](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api), [dados e arquivos de PRs](https://docs.github.com/en/rest/pulls/pulls).

## Servidor local: ingestão e SSE

`npm run dev` abre `http://localhost:4173`, com interface e API no mesmo servidor. Eventos persistem em `.data/events.jsonl`, ignorado pelo Git. O arquivo é substituído atomicamente antes de notificar clientes. Mantém no máximo 1.000 eventos e 4 MB, removendo os mais antigos quando necessário. Reiniciar o servidor reproduz o histórico validado; registros danificados são ignorados.

`GET /api/events` retorna `{ events, transport: "local-sse", ingress }`. Leitura local é pública, portanto não publique segredos ou dados sensíveis no conteúdo de eventos. `POST /api/events` exige `Authorization: Bearer <EVENT_INGEST_TOKEN>` e `Content-Type: application/json`. Sem token configurado, ingestão fica desabilitada (503). Credencial incorreta retorna 401; objeto inválido ou corpo acima de 16 KB retorna 400. Novos registros retornam 201; duplicados retornam 200 com `duplicate: true`.

`GET /api/stream` abre SSE. A mensagem `snapshot` contém `{ events }`; mensagens `office-event` contêm um `OfficeEvent`. Heartbeats ocorrem a cada 15 segundos. Desconectar remove o assinante, há limite de 20 conexões e clientes lentos são encerrados. Reconectar recebe novamente o histórico; a interface deduplica pelo ID. Eventos reais do GitHub consultados localmente também são persistidos e publicados nesse fluxo.

Configure `.env.local` a partir de `.env.example`, usando um segredo aleatório longo para `EVENT_INGEST_TOKEN`. Guarde segredos fora do Git e do navegador.

## CLI, QA, MCP/API e deploy

`src/events/adapters.ts` fornece `eventFromExecution(report)` para converter um resultado observado em um evento. Adapte scripts de QA, chamadas MCP/API, comandos CLI e retorno de deploy para esse contrato, mantendo um ID determinístico por etapa/execução. Para ensaio visual, use exclusivamente o adaptador `simulation`.

Exemplo de evento de uma execução CLI realmente iniciada:

```json
{
  "id": "cli:build-20261002:started",
  "agentId": "dev",
  "projectId": "agent-office",
  "source": "cli",
  "provenance": "real",
  "state": "working",
  "type": "cli.build.started",
  "title": "Build local iniciado",
  "timestamp": "2026-10-02T23:00:00.000Z"
}
```

Atualize o horário para o fato observado e salve o JSON em `work/event.json`. Com token no ambiente ou `.env.local`, execute `npm run emit -- work/event.json`. `OFFICE_URL` opcional aponta para outro servidor local. O emissor lê um evento explícito e não inventa resultados aprovados. Publique `success` somente depois de uma conclusão bem-sucedida; use `error` para falhas, com descrição e evidência.

## Preview Vercel

O preview disponibiliza GitHub por consultas periódicas e demonstração claramente rotulada. `GET /api/events` retorna histórico vazio, `transport: polling`, `ingress: local-only` e uma mensagem explicativa. `POST /api/events` retorna **503 `DURABLE_ADAPTER_REQUIRED`**. Memória e disco efêmeros de uma função não são tratados como armazenamento durável.

Para receber CLI/QA/MCP/deploy no preview, o próximo adaptador deve usar armazenamento e transporte compartilhados duráveis, conservar autenticação, deduplicação, limites e replay. A interface não abre SSE no preview nesta versão. Não envie eventos ao preview esperando persistência; use o servidor local até esse adaptador estar instalado.

## Validação local

`npm test -- server` cobre normalização, deduplicação por SHA e ID, atualizações de PR, ETags, cache/consolidação de pedidos, falha do GitHub, rate limits, origem real/simulada, autenticação, limites de corpo, persistência, reabertura do histórico e entrega SSE. A validação é local; não depende de GitHub Actions.
