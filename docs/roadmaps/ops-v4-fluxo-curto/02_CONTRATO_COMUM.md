# Contrato comum — uma entrega, um comando, evidência até o encerramento

**Programa:** OPS-V4-FLUXO-CURTO · **Revisão do plano:** 1 · **Estado:** proposta preparada, não executada.

## 1. Intenção e limites de autorização

Este pacote é planejamento. Ler o plano ou baixá-lo não libera mudanças no repositório. Ao enviar ao executor o comando de um GOAL, o proprietário autoriza somente o escopo e a política de publicação descritos naquele comando. A autorização de uma entrega não libera as oito de uma vez. Nenhuma ação foi executada no GitHub por este planejamento.

O objetivo é encurtar o fluxo da Operações V4 sem criar V5, sem apagar V2/V3 e sem reconstruir PDV, Caixa, Financeiro ou Estoque. Aprovação comercial, início técnico, pagamento, entrega e retorno são fatos separados. Não gerar fatos ausentes para a interface parecer concluída.

## 2. Regras do repositório e AEP existente

Ler os entrypoints obrigatórios da base atual, especialmente CLAUDE/AGENTS, índice de skills, CURRENT_STATUS, regras de núcleo e `docs/ai-execution/ENTRYPOINT.md`, `TASK_LEVELS.md` e o trecho aplicável do protocolo. Documentação histórica conflitante não substitui código e evidência atuais. Leitura complementar só dos consumidores afetados.

Não instalar outro protocolo. AEP é opt-in por worktree; `state.json`, `LEDGER.jsonl`, `REGISTRY.md` e demais projeções são gerados pelo mecanismo oficial, nunca à mão. Um corretivo é tentativa do mesmo GOAL, teto três conforme o protocolo. Máximo três GOALs no caminho quente; o restante deste pacote é especificação planejada. Inicialmente, tornar elegível apenas o 001. Os demais ganham READY quando dependências e gates estiverem satisfeitos.

**Registro único:** conferir se já existe trilha equivalente; reaproveitar seu ID quando for o mesmo trabalho. Caso ainda não exista, o comando de início pode autorizar apenas o registro aditivo de `ops-v4-fluxo-curto` em `protocol.json.tracks`, a criação dos documentos da trilha e a atualização das projeções pelo script existente. Isso não permite mudar o algoritmo do AEP, gates, limites, hooks, default branch ou critérios. É uma permissão restrita de G-AEP-CORE para cadastro de trilha, não liberação de núcleo. Validar a gramática real de META/TRACK/manifesto antes de gerar os arquivos. `07_RASTREABILIDADE.json` é planejamento e NÃO é um manifesto importável por `track.mjs`.

Se o executor não puder concluir esse cadastro pelo caminho oficial sem alterações adicionais no núcleo, apresentar uma decisão única; não burlar o AEP. Os oito contratos podem ficar em `docs/roadmaps/ops-v4-fluxo-curto/` como fonte; somente os GOALs elegíveis ficam em `goals/` da trilha. A gramática de allowlist é caminho exato ou `prefixo/**`; não usar `*.tsx`, chaves ou negações.

A classificação formal é C1–C4. O nível técnico 1–5 neste plano é estimativa de esforço cognitivo, não uma classe C5. R significa revisão de outra família declarada, não um agente da mesma família com outra conversa. Não inventar revisor ou prova de CI. Risco alto exige R conforme o AEP. Limpar contexto quando o protocolo determinar NEW_SESSION; não prolongar uma sessão apenas para diminuir número de mensagens.

## 3. Pré-flight integrado — não encerrar apenas com inventário

Conferir diretório real, `git remote -v`, branch/default remota, SHA e worktrees. Base de referência deste planejamento: `7222c76e95add3d83009d66eeeb865fd8b05e4ec`; verificar `origin/main` atualizado e diferença relevante. Não tratar avanço paralelo não relacionado como motivo automático para reiniciar auditoria completa.

Proteger WIP do usuário, untracked e commits de outras frentes. Trabalhar em branch/worktree isolada; não alterar working tree principal nem mover commits alheios. Se a sessão já está numa worktree corretamente dedicada, reutilizá-la. Não usar reset, stash, rebase, cherry-pick, amend ou force push como atalho. Avanço da main requer atualização compatível com governança/revisão, jamais publicação cega.

Consultar PRs/trilhas sobre V4 para não implementar trabalho já pronto. O pré-flight confirma paths, importações e comandos de teste. Paths existentes listados são candidatos baseados na análise; paths propostos estão identificados. Ajustar allowlist documental ANTES de editar, pelo fluxo humano/protocolo autorizado. Não ampliar para `lib/**` ou `app/**` para evitar gates. Novas dependências indispensáveis são tratadas uma vez com motivo, diff esperado e risco; não pedir aprovação por uma tarefa mecânica já prevista.

## 4. Ambiente de teste e dados

A aplicação de desenvolvimento pode apontar para produção. Confirmar explicitamente banco descartável, isolamento das credenciais, URL de destino e conta sintética antes de iniciar qualquer mutação. Não imprimir URLs com senha, tokens, PINs ou dados de cliente nos logs. Não copiar `.env` produtivo para uma worktree de QA.

Fixtures: cliente QA A/B, aparelho QA, serviço R$300, custo R$92 e 90 dias. Não usar o cliente, CPF, telefone ou a OS real das imagens; não abrir/estornar/criar título para essa OS. Nenhum saneamento de registro chamado teste/validação na produção está autorizado. Gerar massas apenas no banco isolado por infraestrutura de teste, não com seed global de produção.

Build de homologação deve operar sem autoridade de migration produtiva. Conferir runner e ambiente antes de `npm run build`; migration deve ser pulada naquele ambiente. Não contornar guard nem executar `db push`, `migrate dev/deploy`, backfill, `--accept-data-loss` ou seed global. Uma migration aditiva indispensável exige gate específico e plano de aplicação aprovado no mesmo GOAL; sua ausência é blocker verdadeiro, não licença para fingir que o requisito foi satisfeito.

## 5. Execução end-to-end por GOAL

Com contrato e gates liberados, executar sem pedir “agora teste/agora corrija/agora faça commit”:

1. Confirmar o comportamento atual e criar a regressão que falha antes, quando o defeito estiver presente.
2. Implementar UI, contratos e chamadas necessárias dentro do escopo, reutilizando motores canônicos.
3. Conferir a leitura posterior e os efeitos no banco isolado; não terminar no toast de sucesso.
4. Executar casos próprios, cenários adversos, typecheck, lint relevante, regressões V3/V4 e build seguro.
5. Corrigir falhas de aceite dentro do mesmo GOAL e autorização. Respeitar o teto de tentativas; não inventar 003B/003C para zerar o custo.
6. Preparar commit(s) de trabalho por caminho explícito e revisão R do SHA candidato.
7. Usar check/close e os dois commits do AEP conforme o protocolo vigente. Não declarar closure formal enquanto R obrigatório não existir. A ratificação local não é confirmação de deploy.
8. Seguir a política de release previamente autorizada e devolver estado final único.

Não impor teto cosmético de dois arquivos se a função precisa de UI+adapter+teste. Preferir um resultado funcional revisável; commits internos podem separar preocupações sem requerer novo comando humano. Se o orçamento de leitura estourar, a solução é replanejar a fronteira, não editar sem contexto.

## 6. Gates e áreas que continuam protegidas

**Sempre fechados neste plano:** auth/proxy/ACL global, schema/migrations não aprovados, seeds produtivos, `.env`, CI/deploy/config de projeto, shell global, emissão fiscal, envio externo Meta/marketplace, alterações em motores globais de PDV/Caixa/Financeiro/Estoque, exclusão de V2/V3 e DML produtivo.

**Liberáveis por GOAL e só pelo comando explícito:** ajustes dos contratos Operações V3/V4 indicados, projeções de documentos, criação/aprovação composta, utilização dos comandos existentes de recebimento/entrega/retorno. A aprovação de código não autoriza movimentar dinheiro real para testar.

**Exceções limitadas:** registro documental AEP inicial; eventual migration necessária ao comando idempotente; leitor/action compartilhada fora dos paths previstos. Exceção exige motivação e autorização específica. Não inventar IDs de gate como se estivessem implementados no AEP; as permissões narrativas de domínio complementam os gates de caminho existentes.

## 7. Política de publicação — sem um novo GOAL só para push

O comando completo anexo autoriza, para UMA entrega aprovada: implementar → validar → revisar → commit → push da branch de trabalho → PR → checks → merge normal → conferir deploy canônico → smoke seguro → limpar apenas recursos da tarefa. Essa autorização só passa a valer quando o usuário envia o comando ao executor; o planejamento não a executa.

**Condições cumulativas do merge:** escopo/diff conferidos; regressões e gates pertinentes verdes; R de família diferente aprovada no candidato; nenhum bloqueador P0/P1 ou de aceite; árvore/branch com somente o trabalho pertinente; integração com main conferida; permissões e mecanismos de PR/CI acessíveis. AEP local não é branch protection remota. Se CI obrigatório não existe/está indisponível, declarar bloqueio de release e preparar a evidência — não instalar/mudar workflow ou fingir check.

Usar método de merge permitido pelo repositório e compatível com a proveniência do AEP. Não reescrever ledger/SHAs para acomodar squash arbitrário. Não fazer push direto em main. Se a main avançar após a revisão, revisar e revalidar o delta/candidato integrado afetado; evidência de outro SHA não vira prova nova.

Confirmar `omni-gestao-pro.vercel.app` e o SHA efetivo do deployment. Projetos secundários e status agregado de deploy não substituem essa prova. Configuração/env/migration em Vercel não estão autorizados. Smoke de produção somente leitura explícita e comprovadamente sem efeitos colaterais; aprovação, impressão com auditoria, venda e entrega não são smoke read-only.

Sem ferramenta/revisor/credencial/CI necessários, terminar em PRONTO_PARA_REVISAO ou PRONTO_PARA_PUBLICAR (rótulos do relatório, não novos estados AEP), com um único bloco de pendências. Não prometer execução em segundo plano ou retomar sozinho depois da sessão.

## 8. Padrão de teste e evidência

Usar scripts reais da base, com `npm run typecheck` como gate de tipos previsto no CLAUDE.md; ele configura o heap necessário. Lint focado com comando validado, Vitest do escopo, suíte V3/V4 pertinente e build seguro. E2E pelo runner existente; não editar configuração global do Playwright por hábito. Instalação reproduzível pelo lockfile, sem upgrade de dependências acidental.

Teste puro cobre normalização/decisão; componente/E2E cobre hidratação, clique e foco; integração em PostgreSQL descartável cobre transação/concorrência/read-back. Mock de sucesso não prova atomicidade. Cada erro financeiro/loja relevante tem cenário negativo. Conferir chamadas/linhas afetadas: ausência de efeito colateral precisa de evidência, não apenas comentário.

Falha preexistente deve ser identificada por comparação real e relevância. Teste tocado, cadeia de build exigida ou regressão do fluxo não pode ser dispensado como “já falhava”. Não remover assertions, excluir testes, atualizar snapshot cegamente ou criar bypass para obter verde. Informar testes planejados, executados, aprovados e não executados separadamente.

## 9. Decisões de produto para esta trilha

- Autorização já obtida: registrada explicitamente com ator/instante/escopo; não inferida do total.
- Entrada normal: um cadastro, complementos por necessidade; não quatro grupos obrigatórios para todos.
- Diagnóstico: permanece para avaliação real e novos achados, sem inventar laudo no modo autorizado.
- Atendente vem da sessão; técnico só por vínculo/seletor inequívoco, não comparação de nomes.
- Garantia por linha; síntese única apenas quando equivalente, sem primeiro/máximo/mínimo silencioso. Legado contraditório exige revisão individual.
- Inspeção não avaliada e recurso desconhecido são estados válidos. Nunca confirmar resultado para reduzir pendências.
- Prazo técnico e previsão de entrega permanecem distintos. Presets são sugestões explícitas; não mexer silenciosamente no SLA.
- Receber e entregar podem estar próximos visualmente, mas permanecem atos explícitos e recuperáveis separados.
- Custo de serviço não equivale a peça. Material incluído precisa composição clara e o adapter oficial; sem dupla soma/baixa.
- Retorno parte da original e não cria venda ou renova cobertura por padrão.
- Sem redesign externo obrigatório; tokens/componentes atuais e layout funcional proposto guiam o trabalho.

## 10. Relatório final curto e comprovável

GOAL/revisão; base e HEAD; resultado entregue; caminhos/commits; casos executados e saídas; revisão R/família/SHA; PR/checks/merge; deploy/alias/SHA; smoke; risco residual; estado AEP e próximo passo permitido. Detalhes e logs ficam em artefatos sanitizados referenciados, não em uma resposta enorme repetindo o histórico.

Status do relatório: IMPLEMENTADO / VALIDADO_EM_HOMOLOGACAO / REVISAO_R_APROVADA / PUBLICADO / SMOKE_READ_ONLY_CONCLUIDO. Esses marcos não substituem o estado formal do AEP. Nenhum é derivado automaticamente do anterior.

## 11. Regressão, reversão e mudança de escopo

Antes de DONE, corretivo é tentativa. Depois de ratificado, revisão/reabertura segue processo humano versionado; nunca alterar ledger à mão nem maquiar falha com novo nome de GOAL. Melhorias novas não se tornam bloqueadores retroativos. Riscos reais de autorização, dinheiro ou perda de dados bloqueiam independentemente de conveniência.

Reversão por commit normal e revalidação, preservando dados. Git revert não desfaz dinheiro, entrega ou payload persistido. Confirmar compatibilidade com versões anteriores; usar correção para frente quando downgrade for inseguro. Operações compensatórias produtivas dependem de autorização específica.

## 12. Fora desta trilha

Aposentadoria física/menu de V2/V3, reforma geral das Configurações, Fiscal/Contador/Folha, WhatsApp automático, alterações SaaS/tenant, autenticação geral, manutenção de runtime e auditoria ampla de todos os PDVs. Permanecem no Plano Mestre anterior. Esta trilha detalha a frente F04 e as interfaces diretamente relacionadas F03/F06/F07, sem duplicar seus backlogs. Os 15 achados V4 têm um responsável principal; a aceitação integrada verifica todos.
