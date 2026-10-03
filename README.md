# Diagnos Agent Office

Escritório visual independente da Diagnos, adaptado de [Pixel Agents](https://github.com/pixel-agents-hq/pixel-agents). Cinco personagens representam **Orquestrador/ChatGPT, Dev, QA Auditor, Segurança e UI/UX** e exibem estados `idle`, `working`, `waiting`, `error` e `success`.

## O que é real nesta versão

- Commits da branch principal e `diagnos-agent-office-preview`, PRs, alterações de arquivos e status externos existentes são obtidos da API do próprio repositório. Cada registro tem data, origem e link de evidência.
- Eventos recebidos pelo coletor local autenticado chegam por SSE e ficam registrados em `.data/events.jsonl`. Um executor de QA, CLI, MCP/API ou deploy pode enviar o mesmo contrato.
- O modo **Demonstração** anima o escritório com eventos explicitamente simulados, gerados exclusivamente em `src/events/simulation.ts`. Pode ser desligado; não cria commits nem resultados de testes.
- DG Manual, DG Tech e Diagnos QA são cards de referência, sem conexão com seus repositórios nesta versão. Nenhum código desses projetos, nem do Nexus, é modificado.

Esta aplicação não lê automaticamente a sessão do ChatGPT/Codex. Um evento GitHub prova a atividade registrada no repositório, sem comprovar que um agente está executando código naquele instante. Eventos históricos ficam no feed; só novas atividades recebidas após a sincronização podem acionar estados temporários reais.

## Rodar localmente

Requer Node.js 24. Na pasta do projeto:

```sh
npm ci
npm run dev
```

Abra `http://127.0.0.1:4173`. Para habilitar ingestão local, copie `.env.example` para `.env.local` e configure `EVENT_INGEST_TOKEN` com um segredo próprio. `GITHUB_TOKEN` é opcional e permanece no servidor; para repositórios privados, use uma credencial com leitura de Contents e Pull requests.

```sh
npm run typecheck
npm test
npm run build
npm audit --omit=dev
```

Não há workflows GitHub Actions. A validação é executada localmente e documentada em `docs/VALIDATION.md`.

## Eventos e preview

O contrato e exemplos de publicação estão em [docs/EVENTS.md](docs/EVENTS.md). `GET /api/github` consulta apenas o repositório configurado no servidor; nomes de repositório e credenciais não são aceitos da URL do navegador. O provedor mantém cache e respeita erros e limites do GitHub.

Na Vercel, o preview exibe eventos GitHub via consultas periódicas e usa as mesmas animações e demonstrações. Consultas públicas têm cache de cinco minutos para respeitar o limite de 60 requisições/hora; com `GITHUB_TOKEN` configurado no servidor, o cache é de um minuto. O horário de última sincronização e o intervalo aparecem na interface.

O coletor com SSE e arquivo persistente é **local**. `POST /api/events` na Vercel responde explicitamente `503` até existir um adaptador de armazenamento durável; não usamos memória de uma função como banco de eventos. A API e o contrato já estão preparados para ligar as fontes reais de QA, MCP, API, CLI e deploy, sem simular uma integração existente.

`vercel.json` configura Vite e as funções Node.js. Importe este repositório em um projeto Vercel separado, mantenha `main` como branch de produção e publique a branch de feature como preview. Nenhum domínio ou projeto existente precisa ser alterado.

## Base open source

Upstream fixado em `3537e140c2094761beae748592aeb92ece8edfdd` (v1.4.1). Reutilizamos seu loop de animação e personagens, adaptando a seleção de quadros; cenário, interface e eventos são específicos da Diagnos. A licença MIT original, copyright 2026 Pablo De Lucca, está preservada em [LICENSE](LICENSE). Os personagens derivam de **JIK-A-4 / MetroCity**, CC0. Consulte [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
