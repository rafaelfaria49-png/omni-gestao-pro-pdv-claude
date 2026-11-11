# Revisão independente — USB Windows 001

GOAL `OMNI-PRINT-USB-WINDOWS-FINALIZACAO-REAL-001`, 2026-11-11.
Revisor independente: subagente `usb_print_independent_review`, somente leitura.
Base do delta: `0dbeb5d9267f9920dc1a763649989b3e37546d49` (D05 + main atual).

## Veredito final

**APROVADO TECNICAMENTE. Sem findings pendentes P0–P3 no delta final revisado.**
Não constitui aprovação de merge, deploy, migrations, instalação produtiva ou homologação física.
Build final local PASS. CI remoto final parcial, com quatro jobs bloqueados no provisionamento por DNS dos mirrors
Ubuntu; os testes dependentes não executaram. Impressão física Omni Print continua pendente.

## Achados e correções

| Prioridade | Achado reproduzido | Correção reavaliada |
|---|---|---|
| P2 | Guard baseado na flag global da loja bloqueava KG e outros PDVs/OS que compartilham o runtime | `requireAgent` explícito, vinculado ao input de cada venda no Clássico; default preserva outros PDVs; `onUnsupported` libera legado apenas após recusa com zero job |
| P2 | IPv4-mapped IPv6 e IPv6 expandido escapavam do teste de loopback na Vercel | Canonização de TCP/URL e recusa de mapped hexadecimal, loopback expandido e aliases numéricos; regressões de zero socket/fetch |
| P3 | Manifesto não cobria os dois componentes pós-venda alterados | Feedback automático e diálogo pós-venda incluídos no gerador oficial de HASHES |

O revisor repetiu sondagens da rota real transpilada em memória, com auth/fetch controlados: loopbacks recusados com
503/zero fetch; destino de rede configurado preservado. Conferiu React, encerramento dos recursos do ensaio SW,
autorização de plataforma, destinos/redirect, limites e timeout, estado UNKNOWN, isolamento e `APPROVED_RELEASE=null`.
Não alterou arquivos/índice, não acessou banco/produção e não enviou impressão.

Resultados automatizados completos e limites operacionais: `RELATORIO_USB_WINDOWS_FINALIZACAO_001.md`.

## Complemento de testes no `58015fe`

APROVADO, sem findings pendentes. PW21/PW22 executam feedback/runtime reais. O mock raw é permitido exclusivamente
no PW22, mantendo a recusa `unplanned`/abort dos 20 cenários anteriores. PW22 exige uma tentativa raw e zero jobs
por venda/loja. Um P2 no primeiro rascunho desse mock (aceitação global que enfraquecia os testes anteriores) foi
corrigido antes do veredito suplementar. A execução final dos 22 cenários passou depois dessa reavaliação.

## Complemento de CI

APROVADO, sem findings P0–P3. Após duas falhas de DNS do mirror Azure, quatro etapas dos runners Ubuntu passam a
exigir um fallback HTTPS oficial já presente na imagem antes de remover exclusivamente a linha Azure da lista.
Instalação Playwright, testes, versões, TLS e gates preservados. Os workflows adicionais estão no manifesto.
YAML e Bash validados localmente; recuperação depende do CI remoto. O revisor não executou `sudo`.

A execução seguinte comprovou falha de DNS também em `archive.ubuntu.com`. Último ajuste reavaliado e APROVADO:
seleção entre os dois hosts HTTPS oficiais fixos já presentes na lista, consultas IPv4 com timeout de 10 s por host e saída 1
explícita se ambos estiverem indisponíveis. Nenhum teste/gate alterado; sem alteração de DNS global, `/etc/hosts`, proxy
ou TLS. O CI real do `7a0abe9` confirmou indisponibilidade dos dois hosts nos quatro jobs que precisam desse provisionamento;
evidências em `evidence/usb-windows-001/ci-final.json`. O bloqueio externo continua aberto.
