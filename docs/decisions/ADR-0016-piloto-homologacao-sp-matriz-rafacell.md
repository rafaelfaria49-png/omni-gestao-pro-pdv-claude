---
title: ADR-0016 · SP e Matriz RafaCell como escopo da primeira homologação NFC-e
status: aceita
data: 2026-07-22
autor: Codex (checkpoint arquitetural fiscal)
revisores: [Rafael Faria]
hub: cross
tags: [fiscal, nfce, sefaz-sp, homologacao, storeid, multi-loja]
superado_por:
substitui:
---

# ADR-0016 · SP e Matriz RafaCell como escopo da primeira homologação NFC-e

> **Status:** aceita
> **Decisão em uma frase:** A primeira homologação fiscal real do OmniGestão fica restrita à
> **Matriz da RafaCell Assistec, em Taguaí/SP**, usando exclusivamente SEFAZ-SP, ambiente de
> homologação (`tpAmb=2`) e NFC-e modelo 65, identificada em runtime pelo `Store.id` real e sem
> herança para qualquer outra loja.

---

## 1. Contexto

A ADR-0015 resolveu o Gate G-F5 ao escolher integração direta com a SEFAZ na homologação inicial,
mas deixou em aberto a UF e a loja-piloto. Este checkpoint fecha o escopo operacional inicial sem
implementar o provider, configurar a loja ou transmitir documentos.

O Portal da SEFAZ-SP informa que o ambiente de testes da NFC-e não possui validade jurídica e que,
após o credenciamento, o contribuinte deve obter o CSC apropriado. O Portal Nacional mantém a
relação oficial de Web Services 4.00 de homologação da SEFAZ-SP. Endpoints permanecem no catálogo
versionado do adapter, nunca nesta decisão como configuração copiada manualmente.

**Escopo humano aprovado:**

- UF-piloto: **SP — São Paulo**.
- Loja-piloto: **Matriz da RafaCell Assistec, localizada em Taguaí/SP**.
- Documento: **NFC-e, modelo 65**.
- Ambiente: **homologação, `tpAmb=2`**.
- Autorizador inicial: **SEFAZ-SP**.

**Restrições obrigatórias:**

- O `storeId` literal não é registrado nesta ADR, não é hardcoded e não é inferido por nome.
- Um valor de ID com aparência legada só é válido se tiver sido lido do registro `Store` real e
  propagado pelas relações/requests; jamais vale como default ou fallback.
- Nenhuma credencial, CSC, certificado, código real ou conteúdo secreto entra em documentação,
  código, log ou fixture.
- Homologação não autoriza produção nem emissão vinculada a venda/valor fiscal real.
- Esta ADR não cria configuração, não consulta segredo, não provisiona e não transmite.

---

## 2. Decisão

### 2.1 Escopo técnico fechado

O primeiro provider externo aceita somente a combinação:

```text
autorizador = SEFAZ-SP
uf = SP
municipio = Taguaí/SP
ambiente = HOMOLOGACAO
tpAmb = 2
modelo = 65 (NFC-e)
loja = Store real da Matriz RafaCell Assistec
```

Qualquer divergência de UF, ambiente, modelo, autorizador ou loja falha antes da rede. Endpoint de
produção, `tpAmb=1`, modelo diferente de 65 e loja diferente da Matriz não entram no catálogo/
allow-list da primeira homologação.

### 2.2 Identidade da loja pelo `storeId` real

A identidade canônica é `Store.id`, obtida do registro persistido selecionado para a Matriz. Nome,
CNPJ, endereço ou posição na lista servem apenas para validação; não substituem a chave.

O vínculo obrigatório é:

```text
Store.id
  == ConfiguracaoFiscalLoja.storeId
  == CertificadoDigital.storeId
  == SerieFiscal.storeId
  == NotaFiscal.storeId
  == FiscalEmissaoJob.storeId
  == contexto.storeId autorizado
```

Regras:

- O fluxo parte do contexto autenticado/job da Matriz e carrega a configuração pela relação real.
- É proibido usar constante de loja, primeira loja da lista, nome “Matriz”, índice zero, cookie
  ausente, `LEGACY_PRIMARY_STORE_ID`, `loja-1` como fallback ou qualquer identificação implícita.
- Se o ID real atualmente armazenado coincidir com um literal legado, ele só pode circular como
  valor lido/validado do registro real; o código não pode fabricá-lo.
- `storeId` ausente, não autorizado, divergente em qualquer entidade ou resolvido para outra loja
  produz fail-closed e nenhuma transmissão.

### 2.3 Preflight obrigatório antes da rede

O `SefazDiretoProvider` só pode receber o envelope depois de um preflight server-side atômico e
escopado ao `storeId` real da Matriz. O preflight confirma existência, formato, consistência cruzada
e compatibilidade de:

| Grupo | Validação mínima |
|---|---|
| **Escopo** | `Store` real = Matriz selecionada; município esperado = Taguaí; UF = SP; acesso do ator/serviço ao `storeId` |
| **Emitente** | CNPJ, inscrição estadual, razão social e nome fiscal presentes e consistentes |
| **Endereço** | Logradouro, número, bairro, município, código IBGE, UF e CEP consistentes |
| **Regime** | CRT válido e coerente com `regimeTributario` e com o cálculo tributário executado |
| **Documento** | `modeloFiscal = NFCE`, modelo 65, `ambiente = HOMOLOGACAO`, `tpAmb=2` |
| **Numeração** | Série fiscal ativa e exclusiva para `(storeId, modelo 65, série, HOMOLOGACAO)`; número alocado atomicamente |
| **CSC** | `cscId` e `cscTokenRef` de homologação presentes; secret resolvido server-side e vinculado à Matriz/finalidade |
| **Certificado** | A1 de teste/homologação ativo, válido, não revogado, compatível, vinculado ao mesmo `storeId` e titular/CNPJ esperado |
| **Provider** | `SEFAZ_DIRETO`; resolver aponta somente para o catálogo oficial de homologação da SEFAZ-SP |
| **Pipeline** | Snapshot congelado, tributos, XML, XSD e assinatura concluídos; hash/chave/idempotência consistentes |

O preflight nunca devolve valores sensíveis. Ele retorna apenas estado canônico `apto` ou lista de
pendências sanitizadas. Qualquer dado obrigatório ausente, vazio, inválido, divergente, expirado,
revogado ou indisponível interrompe o fluxo antes da rede.

### 2.4 Proteção de credenciais e dados reais

- CSC, senha, A1, DEK e outros segredos seguem ADR-0009/0010 e nunca aparecem em documentação,
  fonte, logs, traces, exceptions, snapshots de teste ou fixtures.
- Identificadores/códigos operacionais reais não são copiados para exemplos. Fixtures usam somente
  valores sintéticos inequivocamente fictícios e não reutilizáveis.
- O XML pode conter dados fiscais necessários no fluxo seguro e na persistência legal, mas seu
  conteúdo não é despejado em log, relatório de teste ou documentação.
- Logs registram apenas referências opacas, `storeId` autorizado, etapa, resultado, `cStat`,
  correlation id e hashes permitidos, conforme política de auditoria.

### 2.5 Isolamento da Matriz e bloqueio de produção

- Somente a configuração fiscal da Matriz pode ser marcada como elegível para esta homologação.
- Demais lojas permanecem default-off e não herdam CNPJ, IE, endereço, regime, série, CSC,
  certificado, provider, ambiente ou flags fiscais da Matriz.
- Criação de nova loja/configuração não copia a configuração fiscal da Matriz.
- O piloto não consome automaticamente vendas reais do PDV; usa cenários de homologação explícitos,
  controlados e sem valor fiscal/jurídico.
- `PRODUCAO`, `tpAmb=1`, endpoints de produção, CSC de produção e ativação para emissão real ficam
  bloqueados antes da rede e continuam sujeitos ao Gate G-F12.
- Não existe fallback para outra loja, UF, autorizador, ambiente ou provider quando o preflight da
  Matriz falha.

### 2.6 Expansão futura

Outras lojas ou UFs só podem entrar após a homologação completa da Matriz em SP e mediante etapa
própria que valide, por loja:

- `storeId` real e autorização;
- credenciamento da UF/autorizador;
- identidade fiscal, série, CSC e certificado próprios;
- catálogo de endpoints e particularidades da UF;
- testes XSD, autorização, rejeição, reconciliação, eventos e contingência;
- isolamento negativo contra todas as lojas já habilitadas.

Não existe propagação automática da Matriz nem expansão por wildcard/“todas as lojas”.

**O que esta decisão NÃO inclui (escopo fechado):**

- Não grava nem revela o `storeId` literal da Matriz nesta documentação.
- Não verifica ou preenche agora CNPJ, IE, endereço, IBGE, CRT, série, CSC ou certificado.
- Não implementa preflight, allow-list, provider, endpoint resolver ou mudança de schema.
- Não habilita `fiscalEnabled`, não cadastra CSC/certificado e não transmite à SEFAZ-SP.
- Não autoriza produção, outras lojas, outras UFs ou documento diferente de NFC-e modelo 65.

---

## 3. Alternativas consideradas

| Alternativa | Prós | Contras | Decisão |
|---|---|---|---|
| **A) Matriz RafaCell/Taguaí + SEFAZ-SP + NFC-e 65 em homologação** | Escopo real controlado; uma loja/UF; permite validar o pipeline ponta a ponta | Exige configuração e credenciamento completos da Matriz | **Escolhida** |
| B) Todas as lojas de SP | Acelera cobertura estadual | Multiplica risco e configuração antes do primeiro sucesso | Adiada |
| C) Matriz + múltiplas UFs | Antecipa portabilidade | Mistura autorizadores e impede diagnóstico simples | Adiada |
| D) Constante/fallback para ID conhecido | Implementação aparente mais rápida | Viola multi-loja; pode emitir pela loja errada | Proibida |
| E) Copiar configuração fiscal da Matriz | Reduz cadastro inicial | Vaza identidade/segredo e cria emissão indevida | Proibida |

---

## 4. Consequências

### 4.1 Positivas

- Fecha o escopo de UF/loja que bloqueava o planejamento da F5.
- Reduz blast radius a uma única configuração fiscal em ambiente sem validade jurídica.
- Torna o preflight e os testes negativos cross-store critérios obrigatórios.
- Impede que um ID historicamente conhecido seja confundido com fallback permitido.

### 4.2 Negativas / Custos

- Exige validação completa da configuração fiscal real antes do primeiro request.
- A expansão para cada nova loja/UF terá onboarding e testes próprios.
- O `storeId` literal precisa ser obtido com segurança no ambiente operacional, não copiado de docs.

### 4.3 Riscos introduzidos

- **Registro de Matriz selecionado incorretamente** · mitigação: seleção humana + validação cruzada de
  nome/localidade/configuração e igualdade de `storeId` em todas as entidades.
- **Herança acidental para filial** · mitigação: default-off, relações por `storeId`, ausência de
  clone e testes negativos.
- **Uso de segredo/código real em fixture/log** · mitigação: fixtures sintéticas, sanitização e
  varredura antes do merge.
- **Envio acidental à produção** · mitigação: combinação fechada SP/HOMOLOGACAO/tpAmb=2/modelo 65,
  catálogo sem endpoint de produção e bloqueio antes da rede.

### 4.4 O que muda imediatamente

- A primeira homologação passa a ter UF, município, loja, modelo e ambiente oficiais definidos.
- `NFCE_ARCHITECTURE.md`, segurança, plano mestre, roadmap e índices passam a refletir este escopo.
- Nenhum dado fiscal real é escrito ou consultado neste checkpoint documental.

### 4.5 O que muda no longo prazo

- O GOAL de implementação deverá entregar o preflight e provar isolamento antes de qualquer rede.
- Expansão será loja-a-loja e UF-a-UF, somente após o piloto SP completo.

---

## 5. Plano de implementação

**Esta decisão é só arquitetura — implementação/configuração vão para GOAL próprio.**

- Sprint sugerida: preparação operacional da F5, depois de F2–F4 e Dry-Run verde.
- Owner humano: Rafael Faria.
- Pré-requisitos: selecionar o registro `Store` real da Matriz no ambiente autorizado; confirmar
  credenciamento de homologação na SEFAZ-SP; completar o preflight sem expor valores.
- Critério de pronto futuro: todos os checks aptos; testes negativos para outra loja/UF/ambiente;
  `statusServico` e autorização de cenário sintético em homologação; protocolo/XML homologado
  persistidos; zero acesso a produção e zero segredo em artefatos.

---

## 6. Validação / como saberemos que deu certo

- 100% dos requests externos do piloto com `storeId` real da Matriz, UF SP, modelo 65 e `tpAmb=2`.
- 0 hardcodes/fallbacks de `storeId` e 0 resolução implícita por nome/ordem.
- 100% dos campos do preflight validados antes da rede.
- 0 configurações/segredos herdados por outras lojas.
- 0 credenciais/códigos reais em docs, código, logs e fixtures.
- 100% dos testes de outra loja, UF, modelo ou produção bloqueados antes da rede.
- Expansão multi-loja/multi-UF permanece bloqueada até encerramento formal do piloto SP.

---

## 7. Referências

- ADRs relacionadas: ADR-0003, ADR-0008, ADR-0009, ADR-0014 e ADR-0015.
- Arquitetura: `docs/architecture/NFCE_ARCHITECTURE.md` e `FISCAL_SECURITY.md`.
- Governança: `docs/governance/MASTER_FISCAL_EXECUTION_PLAN.md`.
- SEFAZ-SP — NFC-e: <https://portal.fazenda.sp.gov.br/servicos/nfce/>.
- Portal NF-e — Web Services de homologação:
  <https://hom.nfe.fazenda.gov.br/portal/WebServices.aspx>.

---

## 8. Notas / discussão

- Aprovação humana registrada em 2026-07-22: **SP e Matriz da RafaCell Assistec em Taguaí/SP**
  como escopo oficial e exclusivo da primeira homologação.
- “Matriz” é descrição humana; `Store.id` real é a identidade técnica.
- “Sem validade fiscal” não reduz os controles: segredo, isolamento, idempotência e auditoria
  continuam obrigatórios no ambiente de homologação.
