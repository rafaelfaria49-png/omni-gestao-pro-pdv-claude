# P1 — projeto Neon `omnigestao-preview` (2026-10-26)

Autorizada pelo dono ("Autorizo a P1 … Pare antes da P2"). Executada pelo dono através do Neon conectado ao
ChatGPT, porque esta sessão não teve acesso ao console: Claude in Chrome não conectou e o painel ficou no login.
Os dados abaixo são o relato do dono. Esta sessão não os conferiu no control plane. A conferência por SQL é o
primeiro passo da P2 (`check`).

| Campo | Valor relatado | Esperado (§3) |
| --- | --- | --- |
| Nome | `omnigestao-preview` | igual |
| Project ID | `nameless-frost-19035275` | ≠ `dry-mouse-36002471` ✔ |
| Organização / plano | Omni Gestão QA (Free) | plano não conferido antes → Free, US$ 0 |
| Região / PG | `aws-sa-east-1` / 17 | igual |
| Database | `omnigestao_preview` | igual |
| Branch padrão | `main` · `br-lively-feather-b6esh64a` | — |
| Compute | 0,25 CU fixo | igual |
| Suspensão | padrão Free, 5 min | 300 s ✔ |
| Histórico | 0 | "mínimo do plano" ✔. Sem PITR; o banco é recriável pelo roteiro da P2 |

**Papel dono, confirmado na P2.0** (`06-p2-0-check.md`): `omnigestao_preview_owner`.
- A trava do roteiro não depende do nome do papel. Ela confere `neon.project_id`, `neon.branch_id` e
  `neon.endpoint_id`.

**Organizações, confirmadas pelo dono em 2026-10-26.** São distintas:

| Projeto | Organização | Plano |
| --- | --- | --- |
| Produção `dry-mouse-36002471` | `org-spring-butterfly-51302013` | Launch |
| Preview `nameless-frost-19035275` | `org-young-bar-55840347` | Free |

O isolamento é maior que o previsto no §3: nenhum membro, chave de API ou cobrança é compartilhado com a
produção.

Não feito na P1, como pedido: nenhum papel, schema, seed ou branch, nenhuma env na Vercel, nenhum push.
