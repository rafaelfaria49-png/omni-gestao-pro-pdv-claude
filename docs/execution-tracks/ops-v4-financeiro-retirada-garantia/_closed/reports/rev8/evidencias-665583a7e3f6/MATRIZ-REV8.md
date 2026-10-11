# Matriz de evidências rev8

SHA candidato: 665583a7e3f6f1b9552b4c56b3d6a3dd97299167. Base preservada: 98ef717. Comandos, bancos verificados, exits, logs brutos e hashes em MATRIZ-REV8.json.

| Execução | SHA | Exit | Contagem observada |
| --- | --- | ---: | --- |
| base-build-current | 98ef7172a915 | 0 |  |
| base-e2e-datas | 98ef7172a915 | 1 | 1 failed; 5 passed (18.3s) |
| base-e2e-datas-bootstrap | 98ef7172a915 | 0 |  |
| base-e2e-misto | 98ef7172a915 | 1 | 1 failed; 5 passed (49.7s) |
| base-e2e-misto-bootstrap | 98ef7172a915 | 0 |  |
| base-fluxo007-full | 98ef7172a915 | 1 | 1 failed \| 66 passed (67) |
| base-preview-full | 98ef7172a915 | 1 | 10 failed \| 321 passed (331) |
| base-T56c-1 | 98ef7172a915 | 1 | 1 failed \| 66 skipped (67) |
| base-T56c-2 | 98ef7172a915 | 1 | 1 failed \| 66 skipped (67) |
| base-T56c-3 | 98ef7172a915 | 1 | 1 failed \| 66 skipped (67) |
| base-T56c-paired | 98ef7172a915 | 1 | 1 failed \| 66 skipped (67) |
| candidate-aep-check-attempt1 | 665583a7e3f6 | 0 |  |
| candidate-aep-check-attempt1-bootstrap | 665583a7e3f6 | 0 |  |
| candidate-build-final | a1645d78f2a8 | 0 |  |
| candidate-build-frozen | 665583a7e3f6 | 0 |  |
| candidate-datas-pg | 665583a7e3f6 | 0 | 34 passed (34) |
| candidate-e2e-datas | 665583a7e3f6 | 1 | 1 failed; 5 passed (18.6s) |
| candidate-e2e-datas-bootstrap | 665583a7e3f6 | 0 |  |
| candidate-e2e-fluxo006 | 665583a7e3f6 | 0 | 16 passed (2.5m) |
| candidate-e2e-fluxo006-bootstrap | 665583a7e3f6 | 0 |  |
| candidate-e2e-frg001 | 665583a7e3f6 | 0 | 6 passed (2.8m) |
| candidate-e2e-frg001-bootstrap | 665583a7e3f6 | 0 |  |
| candidate-e2e-misto | 665583a7e3f6 | 1 | 1 failed; 5 passed (45.6s) |
| candidate-e2e-misto-bootstrap | 665583a7e3f6 | 0 |  |
| candidate-fluxo001 | 665583a7e3f6 | 0 | 29 passed (29) |
| candidate-fluxo002-mounted | 665583a7e3f6 | 0 | 15 passed (15) |
| candidate-fluxo002-pg | 665583a7e3f6 | 0 | 1 passed (1) |
| candidate-fluxo003 | 665583a7e3f6 | 0 | 4 passed (4) |
| candidate-fluxo004 | 665583a7e3f6 | 0 | 45 passed (45) |
| candidate-fluxo005 | 665583a7e3f6 | 0 | 47 passed (47) |
| candidate-fluxo006 | 665583a7e3f6 | 0 | 70 passed (70) |
| candidate-fluxo007-full | 665583a7e3f6 | 1 | 1 failed \| 66 passed (67) |
| candidate-lint-frozen | 665583a7e3f6 | 0 |  |
| candidate-preview-full | 665583a7e3f6 | 1 | 10 failed \| 325 passed (335) |
| candidate-ratified | 665583a7e3f6 | 0 | 511 passed (511); 20 passed \| 315 skipped (335); 169 passed (169); 76 passed (76); 52 passed (52); 20 passed (20); 29 passed (29); 10 passed (10); 11 passed (8.4m) |
| candidate-ratified-bootstrap | 665583a7e3f6 | 0 |  |
| candidate-T56c-1 | 665583a7e3f6 | 1 | 1 failed \| 66 skipped (67) |
| candidate-T56c-2 | 665583a7e3f6 | 1 | 1 failed \| 66 skipped (67) |
| candidate-T56c-3 | 665583a7e3f6 | 1 | 1 failed \| 66 skipped (67) |
| candidate-T56c-paired | 665583a7e3f6 | 1 | 1 failed \| 66 skipped (67) |
| candidate-v3-misto-pg | 665583a7e3f6 | 0 | 109 passed (109) |
| candidate-v4-misto-pg | 665583a7e3f6 | 0 | 1 passed (1) |
| candidate-verify-all-frozen | 665583a7e3f6 | 0 |  |

Comando integral ratificado: exit 0, 887 Vitest aprovados; 11 passed (8.4m). Os 315 testes de preview excluídos pelo filtro oficial não tiveram skips acrescentados no código.

T56c: a execução completa falhou nos dois SHAs. As observações isoladas preservam todas as assinaturas, inclusive a variante de espera pela trava no candidato; não são retries para declarar verde. O teste usa setTimeout(0) antes de iniciar a action, e observa qualquer waiter Lock do banco. O teste e as dependências comparadas são idênticos à base; essa comparação não prova, por si, a causa de cada interleaving. Uma observação pareada adicional, única e sequencial após as demais provas, voltou a falhar com a mesma mensagem de interrupção nos dois SHAs; os timeouts anteriores não foram apagados. A R deve conferir as limitações e os logs, sem classificar 007 como integralmente aprovado.

O preview completo conserva nominalmente as dez falhas da base (321 passam na base, 325 no candidato). Nos E2E atuais, #235 e #237 têm 5 aprovados e 1 falha tanto na base quanto no candidato: a MESMA asserção de texto do recibo e a MESMA asserção da confirmação que inclui retirante. Não são suítes integralmente verdes; os testes abortados nessas asserções não comprovam suas etapas posteriores. Os grupos 001 (6/6) e Fluxo006 (16/16) passaram no candidato; #234/#238 passaram dentro do grupo misto. A comparação programática e os nomes de preview estão registrados no JSON.
