---
title: ADR-0014 · Supabase Vault como backend KMS do cofre fiscal de produção
status: aceita
data: 2026-07-22
autor: Codex (checkpoint arquitetural fiscal)
revisores: [Rafael Faria]
hub: cross
tags: [fiscal, seguranca, supabase, vault, kms, envelope-encryption, multi-loja]
superado_por:
substitui: ADR-0009 D3
---

# ADR-0014 · Supabase Vault como backend KMS do cofre fiscal de produção

> **Status:** aceita
> **Decisão em uma frase:** O backend de produção do `FiscalSecretVault` será o **Supabase Vault**, combinado com Supabase Storage privado exclusivo do Fiscal e **envelope encryption com uma DEK distinta por segredo e por versão**, substituindo a escolha genérica deixada na ADR-0009 D3.

---

## 1. Contexto

A ADR-0009 fixou o port `FiscalSecretVault`, o `EnvVault` para piloto/homologação e o uso de
envelope encryption + storage privado em produção, mas deixou o fornecedor exato do backend
KMS para uma decisão posterior. Este checkpoint fecha essa lacuna para produção sem mudar o
contrato do port, o schema de negócio nem os callers.

Esta ADR substitui **somente a D3 da ADR-0009**. As demais decisões da ADR-0009 continuam vigentes,
inclusive segredo por referência opaca, operação server-side, auditoria, fail-closed e isolamento
multi-loja.

**Restrições obrigatórias:**

- A chave mestra deve ser criada e gerenciada pelo Supabase, fora da aplicação e separada dos
  blobs fiscais cifrados.
- Nenhuma DEK pode ser global ou compartilhada entre lojas, segredos ou versões.
- Browser/cliente não pode acessar Vault, plaintext, bucket fiscal, chave mestra ou DEK.
- Fiscal e Contador HUB não podem compartilhar bucket, políticas ou permissões.
- Esta decisão é arquitetural: não autoriza código, migrations, upload de certificado nem
  provisionamento de recursos.

**Estado atual relevante:**

- `ADR-0009 D3` definia `KmsStorageVault` genérico e uma data key por loja.
- A documentação oficial do Supabase informa que cada projeto recebe uma chave de criptografia
  gerenciada nos sistemas protegidos do Supabase, separada dos dados, e que o Vault usa
  criptografia autenticada em repouso.
- Supabase Storage oferece buckets privados e políticas próprias por bucket; a separação do
  Fiscal será também administrativa, não apenas por prefixo de objeto.

---

## 2. Decisão

Adotar, em produção, o adapter lógico **`SupabaseVaultStorageVault`** atrás do port
`FiscalSecretVault`:

1. **Chave mestra/KEK fora da aplicação.** A root key do projeto permanece gerenciada pelo
   Supabase em seus sistemas protegidos. A aplicação fiscal não a busca, exporta, persiste,
   recebe em variável de ambiente nem a utiliza diretamente. A eventual capacidade administrativa
   de portabilidade da chave não faz parte do runtime da aplicação.

2. **Envelope encryption obrigatório.** Cada valor secreto é cifrado no serviço fiscal com uma
   DEK aleatória própria. O blob/ciphertext fica no Storage; a DEK fica protegida como secret no
   Supabase Vault, cifrada pela chave do projeto mantida pelo Supabase. A referência opaca associa
   o objeto cifrado à versão imutável da DEK, sem expor nenhuma das chaves aos callers.

3. **Uma DEK por segredo e por versão.** Cada `.pfx`, senha, CSC ou token de provider recebe uma
   DEK diferente em cada versão. Uma nova versão do certificado cria novas DEKs para o `.pfx` e
   para a senha. É proibida DEK global, por ambiente, por bucket ou apenas por loja; também é
   proibido reutilizar DEK entre lojas, certificados, finalidades ou versões.

4. **Vínculo criptográfico por AAD.** A cifra autenticada usa Associated Authenticated Data em
   representação canônica e versionada contendo, no mínimo:

   ```text
   storeId | certificadoId | versao | finalidadeFiscal | tipoSegredo | aadSchemaVersion
   ```

   A descriptografia só é válida se todos os campos coincidirem. Troca de blob, referência,
   certificado, loja, versão ou finalidade deve falhar antes que qualquer plaintext seja liberado.
   Para CSC/token sem um certificado material, `certificadoId` deve usar o identificador canônico
   do vínculo fiscal definido para aquela versão; não pode ser omitido silenciosamente.

5. **Bucket Fiscal exclusivo.** O ciphertext fica em bucket Supabase Storage privado dedicado
   exclusivamente aos segredos fiscais. O nome definitivo será escolhido no provisionamento,
   mas o bucket não pode guardar anexos ou artefatos de nenhum outro módulo. Prefixos por
   `storeId` reforçam organização e defesa em profundidade, porém não substituem autorização.

6. **Separação do Contador HUB.** Fiscal e Contador HUB podem reutilizar apenas o padrão técnico
   e a infraestrutura Supabase. Não podem compartilhar bucket, policies, grants, credenciais,
   roles de runtime, funções de acesso nem permissões. Alterar a permissão de um módulo não pode
   ampliar o acesso do outro.

7. **Somente server-side e com privilégio mínimo.** `anon`, `authenticated`, browser, cliente,
   Edge exposto e qualquer credencial client-side não recebem acesso a `vault.secrets`, à view de
   segredos descriptografados, ao bucket fiscal, à root key ou às DEKs. Apenas um serviço fiscal
   server-side autorizado pode executar as operações mínimas necessárias. O runtime não deve
   depender de uma credencial geral compartilhada com outros módulos; credenciais administrativas
   ou `service_role`, que podem contornar RLS, nunca podem ir para o cliente.

8. **Isolamento rigoroso por `storeId`.** Todo acesso valida o `storeId` autorizado contra os
   metadados, a referência, o path/policy e o AAD antes de resolver a DEK. Não existe fallback
   global, fallback para `loja-1`, enumeração cross-store nem resolução apenas por `blobRef`.

### 2.1 Ciclo de vida obrigatório

- **Versionamento:** versões são imutáveis; nova versão significa novo ciphertext, nova DEK e nova
  referência. Metadados distinguem `PENDENTE_VALIDACAO`, `ATIVA`, `REVOGADA` e `REMOVIDA`.
- **Rotação:** cria e valida a nova versão antes de ativá-la; a troca do ponteiro ativo é atômica.
  Versões anteriores deixam de servir a novas emissões e seguem a política de retenção/remoção.
- **Revogação:** bloqueia imediatamente novas resoluções e emissões antes de qualquer limpeza
  assíncrona. Revogação de certificado fiscal também preserva os documentos já autorizados.
- **Remoção segura:** realiza crypto-shredding da DEK protegida, remove o ciphertext pela API do
  Storage, verifica o resultado e mantém somente tombstone/metadados não secretos para auditoria.
  Exclusão apenas de metadados em `storage.objects` não conta como remoção do objeto.
- **Auditoria:** registra ator/serviço, operação, `storeId`, certificado, versão, finalidade,
  resultado, correlation id e timestamp, nunca segredo, chave, DEK, AAD completo sensível ou
  conteúdo cifrado. Leitura, criação, rotação, ativação, revogação, recuperação e remoção são
  eventos auditáveis.
- **Recuperação:** backups/restores do Vault e Storage devem ser coordenados; o runbook deve cobrir
  restore no mesmo projeto, restore/migração para outro projeto, preservação controlada da root key,
  teste periódico de recuperação e reemissão do A1 quando a recuperação criptográfica não for
  possível. A root key nunca passa pela aplicação durante o processo.
- **Fail-closed:** Vault indisponível, objeto ausente, versão inválida, policy negada, divergência de
  `storeId`/AAD, falha de autenticação do ciphertext, auditoria obrigatória indisponível ou estado
  revogado/removido resultam em “segredo fiscal indisponível” e nenhuma emissão.

### 2.2 Evolução futura

AWS KMS ou Google Cloud KMS ficam registrados como evolução futura, não como fallback automático.
A reavaliação exige nova ADR se surgir requisito regulatório, HSM dedicado, BYOK/HYOK, custódia
independente do Supabase, segregação organizacional adicional ou requisito de disponibilidade que
o backend escolhido não possa atender. A migração deve preservar envelope encryption, DEK por
segredo/versão, AAD, auditoria, fail-closed e isolamento por `storeId`.

**O que esta decisão NÃO inclui (escopo fechado):**

- Não implementa o adapter, algoritmo, RPC, role, policy, bucket ou workflow de administração.
- Não cria nem consulta `vault.secrets`, não cria bucket e não faz upload de segredo real.
- Não autoriza acesso de browser, Contador HUB ou serviço genérico ao cofre fiscal.
- Não escolhe o provider de emissão fiscal (Gate G-F5).
- Não altera schema, runtime fiscal, Supabase, Vercel ou APIs neste GOAL.

---

## 3. Alternativas consideradas

| Alternativa | Prós | Contras | Decisão |
|---|---|---|---|
| **A) Supabase Vault + Storage privado exclusivo** | Integrado ao stack; root key gerenciada e separada; menor carga operacional | Acoplamento ao Supabase; exige hardening rigoroso de grants, policies e recuperação | **Escolhida** |
| B) AWS/GCP KMS + object storage | HSM/cloud KMS maduro; custódia independente possível | Mais integração, identidade e OPEX agora | Evolução futura sob gatilho regulatório/técnico |
| C) Uma DEK por loja | Menos chaves e referências | Aumenta blast radius e compartilha chave entre segredos/versões | Rejeitada |
| D) Bucket/policies compartilhados com Contador HUB | Menos recursos administrativos | Mistura domínios e amplia risco de permissão lateral | Proibida |

---

## 4. Consequências

### 4.1 Positivas

- Fecha o fornecedor de produção sem mudar o port nem o schema de negócio.
- Reduz o blast radius a um único segredo/versionamento e reforça isolamento multi-loja.
- Mantém chave mestra fora da aplicação e ciphertext fora das tabelas de negócio.
- Define desde já operação, recuperação e critérios fail-closed verificáveis.

### 4.2 Negativas / Custos

- A quantidade de DEKs e referências cresce por segredo e versão.
- Rotação e recuperação exigem coordenação entre Vault, Storage e metadados.
- O acoplamento ao Supabase permanece até eventual ADR de migração para KMS externo.

### 4.3 Riscos introduzidos

- **Grant indevido à view descriptografada** · mitigação: deny-by-default, role fiscal dedicada e
  testes negativos para `anon`, `authenticated`, browser e módulos não fiscais.
- **Uso de credencial ampla que contorna RLS** · mitigação: credencial server-only, escopo mínimo,
  separação por serviço e verificação de autorização fora e dentro do adapter.
- **Restore inconsistente entre Vault e Storage** · mitigação: runbook coordenado, inventário de
  versões/referências e testes periódicos de recuperação.
- **Dependência de um único fornecedor** · mitigação: referências opacas, port estável e gatilhos
  explícitos para AWS/GCP KMS.

### 4.4 O que muda imediatamente

- Esta ADR passa a decidir e substituir a ADR-0009 D3.
- `FISCAL_SECURITY.md`, `MASTER_FISCAL_EXECUTION_PLAN.md`, `ROADMAP_FISCAL.md` e o índice de ADRs
  passam a registrar Supabase Vault como backend de produção.
- Nenhum código ou recurso externo muda neste GOAL.

### 4.5 O que muda no longo prazo

- A implementação de produção deverá entregar `SupabaseVaultStorageVault` e provar todos os
  controles desta ADR antes do Gate F12.
- Uma futura custódia independente exigirá nova ADR e migração versionada, nunca fallback oculto.

---

## 5. Plano de implementação

**Esta decisão é só decisão — implementação e provisionamento vão para GOAL/sprint próprios.**

- Sprint sugerida: fase de hardening do cofre anterior ao Gate F12 (a planejar).
- Owner humano: Rafael Faria.
- Pré-requisitos: threat model detalhado, desenho de roles/grants/policies, política de retenção,
  runbook de recuperação e plano de testes de isolamento.
- Critério de pronto futuro: adapter server-only, envelope encryption e ciclo de vida implementados;
  testes negativos cross-store/client/Contador HUB; auditoria e recuperação exercitadas; nenhum
  segredo ou chave exposto; fail-closed comprovado.

---

## 6. Validação / como saberemos que deu certo

- 0 acessos de `anon`, `authenticated`, browser ou Contador HUB ao Vault/bucket fiscal.
- 0 reutilizações de DEK entre segredos, versões ou lojas.
- 100% das descriptografias autenticadas pelo AAD canônico esperado.
- 100% das operações de ciclo de vida com evento de auditoria sem material sensível.
- 100% dos testes cross-store e de indisponibilidade resultando em fail-closed.
- Restore exercitado e documentado antes do Gate F12.

---

## 7. Referências

- ADRs relacionados: ADR-0003, ADR-0008 e ADR-0009.
- Arquitetura: `docs/architecture/FISCAL_SECURITY.md`.
- Governança: `docs/governance/MASTER_FISCAL_EXECUTION_PLAN.md`.
- Supabase Vault: <https://supabase.com/docs/guides/database/vault>.
- Supabase Storage — buckets: <https://supabase.com/docs/guides/storage/buckets/fundamentals>.
- Supabase Storage — access control: <https://supabase.com/docs/guides/storage/security/access-control>.

---

## 8. Notas / discussão

- Aprovação humana registrada em 2026-07-22: **opção A — Supabase Vault como backend KMS de
  produção da ADR-0009 D3**, sujeita integralmente às condições normativas desta ADR.
- “Gerenciada pelo Supabase” não autoriza a aplicação a obter a root key. Portabilidade é uma
  operação administrativa de recuperação/migração, fora do runtime e sujeita a controle próprio.
- “Bucket privado” não é suficiente sozinho: a decisão exige bucket exclusivo, ausência de policy
  client-side e separação total do Contador HUB.
