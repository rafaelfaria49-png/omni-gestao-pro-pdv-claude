# Masterplan de continuação fiscal — incorporação reconciliada

> **Proveniência:** os quatro arquivos originais atribuídos ao Fable 5 foram procurados no
> repositório, na worktree de origem, no anexo do GOAL e no perfil local, sem resultado. Este
> documento é uma **reconstrução rastreável**, criada em 2026-07-13 a partir da especificação do
> `FISCAL-STATUS-RECONCILE-001`, da auditoria de 2026-07-12 e da `origin/main` em `2b9c51a`.
> Não é apresentado como cópia literal do original ausente.

## Autoridade e relação com a governança vigente

1. `docs/decisions/ADR-0003-*`, `ADR-0008-*` e `ADR-0009-*` permanecem decisões aceitas.
2. `docs/governance/MASTER_FISCAL_EXECUTION_PLAN.md` permanece o plano canônico F0–F12.
3. `docs/fiscal/FISCAL_RECONCILE_REPORT_001.md` é a fonte reconciliada do estado factual em
   2026-07-13.
4. Este pacote complementa os artefatos acima; não renumera fases, não reabre decisões e não
   habilita emissão.

## Estado de partida

- Schema fiscal aplicado e sem drift, mas tabelas fiscais vazias.
- Seis rotas reais usam os guards da máquina de estado; o restante do motor não tem caller de
  runtime fora de `lib/fiscal`.
- F2–F4 possuem código e testes internos, sem prova externa; XSD, C14N, ST e paridade do cadastro
  principal continuam bloqueios.
- Zero documento autorizado em homologação ou produção.
- `fiscalEnabled` não possui caminho de ativação no runtime atual.

## Sequência de continuação

A decomposição detalhada está em `FISCAL_CONTINUATION_IMPLEMENTATION_GOALS_001.md`. A ordem mantém
quatro trilhas:

1. **Integridade interna:** cadastro fiscal do produto, ST, XSD e C14N.
2. **Gate auferível:** golden cases e dry-run que falha quando a autoridade oficial reprova.
3. **Integração externa em HOMOLOGACAO:** decisão do provider, transmissão, QR-Code, eventos e
   reconciliação de estado incerto.
4. **Operação segura:** fila, DANFCE, contingência, observabilidade e homologação ampla.

Somente o **GOAL 022** pode construir a ativação por loja, e ainda assim somente em
`HOMOLOGACAO`, sujeito a G-F7. Produção continua proibida até G-F12.

## Gates preservados

| Gate | Estado | Condição |
|---|---|---|
| G-F1 | fechado/resolvido | ADR-0009 aceita |
| G-F5 | aberto | Rafael decide SEFAZ direto ou gateway |
| G-F7 | aberto | Rafael aprova ativação da loja-piloto em homologação |
| G-F12 | aberto | Rafael aprova virada loja a loja para produção |

## Critério transversal de evidência

Usar a escala N0–N7 do relatório reconciliado. Teste interno não equivale a XSD oficial, prova
externa, homologação ou produção. Alegações N6 exigem retorno real da SEFAZ em homologação; N7 exige
autorização real em produção e gate humano registrado.

## Pendências operacionais

P-01–P-13 são mantidas no relatório reconciliado. Como a redação original do Fable 5 não estava
disponível, os identificadores reconstruídos são explicitamente marcados e não devem ser usados
para alegar que o texto original foi recuperado.
