# Pessoas 001B — Recovery 002 em gate de integração auth

28/10/2026. Transporte seletivo 32/32 realizado na base `34b70a15583db7608437f04b3ba7779582f4eeb9`; três arquivos compartilhados integrados por trechos. Passagem externa restrita em page-access.ts implementada conforme revisão 8.

**Entrega funcional não concluída.** O consumidor global continua negando `/dashboard/pessoas/configuracoes` a ator STORE sem Configurações Enterprise, depois de canAccessPage retornar true. Reprodução com funções reais e proposta não aplicada em [GATE_AUTH_CONSUMER_2026-10-28.md](../ai-execution/_evidence/PESSOAS-DP-FRONTEND-001B-RECOVERY-002/GATE_AUTH_CONSUMER_2026-10-28.md).

A correção exige `lib/auth/proxy-enterprise-dashboard.ts`, fora da allowlist. Implementação interrompida no gate humano, sem editar GOAL/META/marcador. Runner completo/TypeScript/lint/build/PWA/E2E/visual/QA não executados; nenhuma evidência histórica virou PASS do novo HEAD. Autorrevisão tem achado bloqueante; sem close DONE, PR funcional ou produção. Fixture e validações restantes ficam pendentes da retomada formal.
