# Seis PRs draft — bases, escopo e limites

Destino autorizado: `rafaelfaria49-png/omni-gestao-pro-pdv-claude`. Somente push, PRs draft, CI e correções nas branches. Sem merge, deploy, migration ou escrita em Production.

| PR | Head final | Base | Escopo |
| --- | --- | --- | --- |
|1|codex/relatorios-contratos-privacidade-001|main|Contratos, datas/ACL, SQL helpers, CSV/PDF e privacidade HTML/RSC/PWA|
|2|codex/relatorios-produtos-real-002|codex/relatorios-contratos-privacidade-001|Ranking real, coorte/devoluções/cancelamentos, ABC, filtros e paginação|
|3|codex/relatorios-fontes-gerenciais-003|codex/relatorios-produtos-real-002|Fontes gerenciais/APIs autorizadas e runner PostgreSQL descartável|
|4|codex/relatorios-vinculos-origem-004|codex/relatorios-fontes-gerenciais-003|Detalhes persistidos de produto/venda/ledger/DRE/OS/conversa|
|5|codex/relatorios-logout-revogacao-005|codex/relatorios-vinculos-origem-004|Regressões da revogação por sessão350; nenhuma alteração de autenticação|
|6|codex/omni-relatorios-hub-enterprise-real-001|codex/relatorios-logout-revogacao-005|Interface, providers mínimos, paginação PDF, E2E e CI de relatórios|

Base atual51265894. Os seis commits originais, inclusive a proposta global descartada, permanecem locais na worktree original sob codex/relatorios-preservado-20261116. A nova cadeia é reconstruída somente com fonte/testes/Markdown sanitizado e não contém artefatos locais.

## Verificação antes do envio

Conferir cada diff contra sua base e o cumulativo contra main; ausência de .env/segredos/dados de clientes/bancos/artefatos; hashes de auth/schema/Electron/Vestuário preservados; revisão independente concluída; testes novos reexecutados. Push somente dos seis refspecs nomeados, sem force/mirror/tags/branches de outras trilhas.

Cada descrição de PR deve conter seu escopo, dependência, testes efetivos, revisão, risco e CI pendente/resultado por SHA. Os resultados gerados permanecem locais ou no próprio job da CI; não publicar credenciais, manifestos ou traces.

## Ativação e rollback

A revisão humana integra os deltas em ordem. Nenhum mecanismo de migração/índice/backfill novo é necessário para os relatórios. A autenticação depende do contrato já existente da350 e da ativação correta de sua flag/schema no mesmo ambiente; este GOAL não altera ambientes hospedados.

Rollback de código em PR humana, da6 para1. Sem reset de dados ou contadores e sem revalidar sessões revogadas. Preservar NetworkOnly/expurgo até eliminar caches antigos, mesmo se a interface for revertida. Não reintroduzir o CAS global descartado. Mantêm-se as limitações de fonte financeira/WhatsApp e os riscos herdados da350 descritos em AUTH_LOGOUT.md.

Worktrees/commits/WIP preservados até integração autorizada. CI não é aprovação de merge ou de Production.
