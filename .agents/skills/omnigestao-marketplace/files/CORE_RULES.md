# Core Rules — resumo rápido

Regras completas e autoritativas em: **`docs/skills/rules/CORE_RULES.md`** (12 princípios).

Resumo obrigatório:

- **Pensar antes de codar.** Localize os arquivos reais antes de editar.
- **Escopo fechado.** Só o que foi pedido; problema fora do escopo = relatar, não corrigir.
- **Mudanças cirúrgicas.** Mínimo de linhas. Sem refactor "de brinde".
- **Sem overengineering.** A solução mais simples que satisfaz o critério vence.
- **Áreas protegidas.** Nunca alterar auth, proxy, schema.prisma, financeiro/contracts, financeiro/adapters/os-faturamento, AppShell sem autorização explícita.
- **Sem mocks enganosos.** HUBs Lovable usam mock para UI (OK). Persistência real = Server Actions.
- **Tokens visuais.** Apenas tokens semânticos Tailwind. Cores de domínio intencionais = exceção documentada.
- **tsc obrigatório.** Mudança em `.ts`/`.tsx` → `npx tsc --noEmit` antes de encerrar.
- **Multi-loja.** Todo query Prisma filtra por `storeId`. Nunca cruzar dados entre lojas.
- **Relatório final.** Ver `docs/skills/rules/DELIVERY_CHECKLIST.md`.

> Após ler este arquivo, abra **apenas** o `files/*.md` do domínio desta tarefa.
