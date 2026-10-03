# Validação local

Validação registrada em 3 de outubro de 2026. Feita no Windows, com Node.js 24, sem GitHub Actions.

- `npm ci`: concluído a partir do lockfile. Auditoria na instalação: 0 vulnerabilidades.
- `npm run typecheck`: passou.
- `npm test`: 5 arquivos, 25 testes aprovados. Inclui autenticação e limites da ingestão, eventos simulados versus reais, GitHub ETags e falhas, deduplicação, limites do histórico, SSE, retentativa, sincronização concorrente e janela de atividade.
- `npm run build`: passou; 1.736 módulos transformados.
- `npm audit --omit=dev`: 0 vulnerabilidades de produção.
- Navegador local: página e personagens renderizados; os cinco agentes mudaram estados durante a demonstração; a chave da demonstração desligou as animações simuladas; DG Manual exibiu corretamente “Sem fonte conectada”; o filtro **Reais** mostrou o commit real do GitHub com ligação para a evidência.
- Smoke test HTTP local: o coletor exigiu credencial, rejeitou evento inválido, persistiu apenas uma cópia de um evento repetido e o entregou por SSE. O cliente GitHub respondeu com o commit do repositório Diagnos Agent Office.
- Revisão de implementação independente: ajustes na janela de sincronização, falha opcional de status e privacidade de fontes privadas aplicados. Testes de regressão cobrem as duas primeiras; uma resposta privada é recusada antes de ler conteúdo no endpoint público.

DG Manual, DG Tech e Diagnos QA aparecem como referências sem conexão ou dados atribuídos. O preview Vercel e as credenciais do serviço Vercel não são validados por esta execução local.
