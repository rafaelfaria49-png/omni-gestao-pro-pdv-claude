# Matriz de aceite — GOAL 001 / T01–T11

**Estado:** nenhum teste de aplicação foi executado na elaboração deste plano. Casos T01–T11 são contratos para implementação/homologação, não resultados. Uma execução pode gerar vários testes automatizados; 11 não é uma contagem garantida de arquivos ou asserts.

## Massa e proteção

Usar loja QA A e B, perfis com permissões diferentes, cliente sintético e aparelho QA. Caso principal: troca de tela a R$300, custo interno R$92, garantia 90 dias e autorização já informada. Complementar com vários serviços, valores/coberturas distintas, orçamento recusado e payloads legados sintéticos. Não copiar CPF, telefone, nomes ou conteúdo sensível das fotos.

Dinheiro e estoque só no banco isolado. Preparar contador antes/depois de cliente, OS, título, recebimentos e movimentos. Registrar correlação/chave de operação sem dados pessoais. Congelar relógio/fuso para casos temporais e controlar atraso/falha para cenários de rede. Em criação autorizada, a contagem esperada de títulos antes do recebimento depende do contrato canônico; não fixar artificialmente zero se o motor já prevê um título, nem criar um segundo. Pagamento confirmado continua zero até o comando de recebimento.

Camadas: unidade/projeção, componente, integração real e E2E. Um teste de string/importação não prova efeito. Invariantes financeiras devem observar persistência, saldo e ledger, não só texto da tela.

## OPS-V4-FLUXO-CURTO-001

### T01 — Criação com leitura lenta

**Preparação:** Cliente sintético A e aparelho QA; retardar resposta de detalhe.
**Ação:** Criar e abrir imediatamente.
**Resultado:** Resumo e formulário exibem o mesmo dado; salvar permanece bloqueado enquanto a carga não estiver estabelecida.
**Estado:** PLANEJADO — NÃO EXECUTADO.

### T02 — Edição isolada

**Preparação:** OS sintética com modelo, cor, relato, garantia e preço.
**Ação:** Alterar só IMEI e salvar/reabrir.
**Resultado:** Só IMEI muda; nenhum campo não editado é apagado.
**Estado:** PLANEJADO — NÃO EXECUTADO.

### T03 — Refresh durante digitação

**Preparação:** Editor hidratado.
**Ação:** Digitar relato e disparar refresh antes de salvar.
**Resultado:** Rascunho tocado é preservado; dados remotos não sobrescrevem a digitação.
**Estado:** PLANEJADO — NÃO EXECUTADO.

### T04 — Duas sessões editando

**Preparação:** Duas sessões na mesma OS.
**Ação:** Salvar campos diferentes e depois o mesmo campo.
**Resultado:** Campos independentes se preservam; conflito no mesmo campo é explícito.
**Estado:** PLANEJADO — NÃO EXECUTADO.

### T05 — Troca rápida de OS/loja

**Preparação:** A/OS1 com leitura pendente; B/OS2 válida.
**Ação:** Trocar de seleção antes da resposta.
**Resultado:** Resposta de A não aparece em B; mutação mantém o alvo autorizado capturado.
**Estado:** PLANEJADO — NÃO EXECUTADO.

### T06 — Sem loja/seleção

**Preparação:** Requisição pendente de uma OS válida.
**Ação:** Limpar seleção ou loja.
**Resultado:** Dados antigos não ressurgem; nenhuma escrita é disponibilizada sem alvo.
**Estado:** PLANEJADO — NÃO EXECUTADO.

### T07 — Cor e condição independentes

**Preparação:** Cor Violeta e nota física distinta.
**Ação:** Criar, ler, editar a cor e reabrir.
**Resultado:** Cor e nota de condição sobrevivem em campos semanticamente distintos.
**Estado:** PLANEJADO — NÃO EXECUTADO.

### T08 — Legado ambíguo

**Preparação:** Payload sintético com condicaoAparelho sem proveniência inequívoca.
**Ação:** Abrir no leitor novo e salvar outro campo.
**Resultado:** Não converte texto em cor, não perde nota original e não grava backfill.
**Estado:** PLANEJADO — NÃO EXECUTADO.

### T09 — Horário em outro fuso

**Preparação:** Loja com fuso explícito; relógio de teste fixo.
**Ação:** Escolher 17h da loja e abrir em navegador de outro fuso.
**Resultado:** Mesmo instante prometido; exibição informa o fuso aplicado.
**Estado:** PLANEJADO — NÃO EXECUTADO.

### T10 — Prazo vencido e padrão

**Preparação:** Data anterior e campo sem escolha explícita.
**Ação:** Criar com prazo vencido; criar sem prazo customizado.
**Resultado:** Aviso para data vencida e padrão real explícito; não inventa prazo verde.
**Estado:** PLANEJADO — NÃO EXECUTADO.

### T11 — Falha e saída com rascunho

**Preparação:** Editor sujo e falha de gravação.
**Ação:** Tentar salvar, navegar e trocar de OS.
**Resultado:** Erro recuperável; salvar/descartar/cancelar claros; sem falsa persistência.
**Estado:** PLANEJADO — NÃO EXECUTADO.
