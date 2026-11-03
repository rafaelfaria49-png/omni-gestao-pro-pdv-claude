# RISCOS_REMANESCENTES — o que NÃO está garantido

## Limites do "offline" (não declarar "offline completo")
1. **Navegador fechado / computador desligado / aba descarregada**: não sincroniza; retoma ao reabrir (fila no `localStorage`).
2. **Outro computador** não vê a fila deste durante a queda. Um terminal = uma fila por loja.
3. **F5 offline** depende do cache do service worker (página e catálogo da carga inicial). Sem SW (modo anônimo/primeiro acesso) não há PDV offline.
4. **Pagamentos**: Pix e cartão offline são **declarados** pelo operador — sem TEF/PSP; a conciliação é manual. Crédito/vale, a prazo e carnê ficam bloqueados offline.
5. **Sessão**: a revalidação nova não derruba o PDV por falha de rede, mas uma sessão revogada continua com a UI aberta enquanto o servidor estiver inacessível (nenhuma escrita passa sem cookie válido; a venda fica preservada como "sessão expirada").
6. **Capacidade do `localStorage`** (~5 MB/origem): o blob inclui o histórico local de vendas. Quota esgotada é detectada e bloqueia venda NOVA offline, mas não há rotação automática do histórico confirmado. IndexedDB foi avaliado e não adotado nesta entrega (ver `ARQUITETURA_SYNC.md`).

## Riscos técnicos aceitos
7. **Totais locais entre abas**: confirmação adotada de outra aba não reaplica efeitos locais (totais do caixa local daquela aba) até recarregar; o fechamento usa o resumo do servidor.
8. **Trava de venda idêntica com resultado desconhecido (≤ 10 min)**: após F5/outra aba, um carrinho idêntico a uma venda cujo envio ficou sem resposta é barrado até o operador decidir no diálogo (verificar a anterior ou "É outra venda"). Com o servidor fora, "É outra venda" segue funcionando (registro local).
8b. **"É outra venda" é decisão explícita** (diálogo com "Verificar a venda anterior" / "É outra venda" / "Voltar"); repetir a finalização não libera nada. Resta o risco humano de escolher "É outra venda" quando era a mesma — o texto avisa que a anterior pode já estar gravada.
9. **Navegadores sem Web Locks**: sem single-flight entre abas (o banco continua idempotente; pode haver POST repetido, nunca venda repetida).
10. **Fechamento com pendências**: ciência obrigatória (provada em teste de componente); a venda pendente não entra no fechamento e depende do "Sincronizar retroativo" manual depois.
11. **Histórico/Detalhe**: fase e desfecho persistentes implementados; sem E2E dedicado da tela (T09/T50 PARTIAL).

## Governança / aprovação humana necessária
12. **`components/auth/SessionProvider.tsx`** (camada de autenticação do CLIENTE): alterado para o PDV não sumir offline. Servidor de auth, `auth.ts`, `auth.config.ts`, `proxy.ts` e schema **inalterados**. CORE_RULES exige **autorização explícita** do proprietário para tocar em auth — merge só com esse aval.
13. **Contrato CORREÇÃO-01 mantido**: PENDING continua preservando o carrinho; o operador libera com F6 → "Cancelar venda" (mensagem honesta: a venda anterior NÃO foi cancelada). Limpar o carrinho automaticamente no PENDING é decisão de produto não tomada aqui.

## Dependências de ambiente (não são regressão desta PR)
14. Falhas pré-existentes na `main` (medidas na base, idênticas): `app/api/ops/vendas-list/route.test.ts`, `quarantine-recovery/{auto,batch,preview}`, `recover-quarantined`, `fechamento-calculadora-modal.static`, `pdv-scan-autoclear.static` (27 testes).
15. Workflow "Cadastros Cliente assistido": `ClienteEditor.test.ts > switching store aborts capture…` falhou no CI — arquivo e domínio (ditado por voz em Cadastros) não tocados por esta PR.
16. Build de produção não rodou localmente: disco C: com < 1 GB livre (o `.next` usa ~1,5 GB); o build roda no CI (jobs `validate` e `e2e-authenticated` de "Ramos e Cadastros").

## O que depende de homologação em caixa físico
- Comportamento com a rede real da loja (Wi-Fi caindo/voltando, portal cativo, 4G do roteador).
- Impressora/maquininha: nada foi alterado; venda PENDENTE não imprime cupom definitivo (contrato existente).
- Fluxo do operador com F6 entre vendas offline e leitura do painel "Detalhes".
