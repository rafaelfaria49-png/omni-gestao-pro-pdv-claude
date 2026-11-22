# OmniGestão Pro para Windows — distribuição pública

GOAL `OMNI-DESKTOP-DISTRIBUICAO-PUBLICA-SAAS-001` · 2026-11-19

Estado: **infraestrutura pronta, download público DESLIGADO**. Falta certificado de assinatura,
armazenamento de downloads, teste em Windows 10 e autorização comercial (seção 6).

**2026-11-22 (`OMNI-DESKTOP-WINDOWS-10-11-DOWNLOAD-RELEASE-001`)**: `/baixar` passa a mostrar duas
opções, *Windows 10* e *Windows 11* (64 bits), que apontam para o **mesmo** instalador x64 do
`latest.json` (um binário só: Electron 45 = "Windows 10 and up"). Cada botão só funciona com release
pública válida **e** aquele Windows homologado em `compatibility.ts`
(`lib/desktop-distribution/download-options.ts`). A detecção só destaca uma sugestão. `/gestao-lojas`
deixou de ter canal próprio (`GESTAO_LOJAS_WINDOWS_DOWNLOAD_URL` removida) e aponta sempre para
`/baixar`. Roteiro físico das duas lojas: `HOMOLOGACAO_WINDOWS_10_11.md`.

## 1. Peças

```
GitHub Actions (desktop-release.yml, environment protegido)
  build Production ─► assina (Authenticode + carimbo de tempo) ─► verify-artifacts --require-signed
  ─► R2: desktop/production/<versão>/OmniGestaoPro-Setup.exe  (imutável, --if-none-match "*")
  ─► remove o certificado do runner
  ─► baixa de volta pela URL PÚBLICA ─► confere SHA-256 + assinatura + certificado (lista confiável)
  ─► instala ESSE arquivo no runner: como atualização sobre a versão oficial anterior, se houver;
     senão, instalação nova (a instalação nova do mesmo código também roda em toda PR)
  ─► grava <versão>/release.json
  promote (decisão humana) ─► latest.json + versions.json

CDN de downloads (Cloudflare R2 + domínio próprio, HTTPS)
  └─ latest.json ◄── lido pela Vercel (só JSON, cache 5 min)
                        ├─ /baixar                       (página pública)
                        └─ /api/desktop/update-manifest  (aviso de versão do programa)
```

- O executável **nunca** passa por função da Vercel: o botão aponta direto para a CDN.
- `lib/desktop-distribution/release-manifest.ts` valida o `latest.json` de forma **fail-closed**:
  canal production, x64, URL dentro do diretório imutável da versão, SHA-256, assinatura `Valid`
  com carimbo de tempo, certificado na lista confiável (`DESKTOP_TRUSTED_SIGNER_SHA1` — a Vercel não
  verifica Authenticode, então isto barra um manifesto adulterado na CDN com outro signatário),
  download público conferido e teste de instalação aprovado. Qualquer
  desvio ⇒ página mostra só "acesso pelo navegador" e o endpoint devolve 404.
- O contrato pipeline ↔ web tem teste: `lib/desktop-distribution/release-contract.test.ts` (o
  `checkReleaseManifest` do promote e o validador da página recusam os mesmos casos).
- Certificados aceitos vêm sempre da configuração do proprietário, nunca do manifesto conferido.

### Por que R2

Já é o armazenamento da conta (Contador HUB), não cobra tráfego de saída (instalador ~150 MB × N
lojas), entrega por HTTPS em domínio próprio e aceita escrita condicional (`If-None-Match: *`), que
torna cada versão imutável. Custo previsível: armazenamento por GB/mês (cada versão ≈ 0,15 GB).
GitHub Releases foi descartado como canal de cliente (rascunho exige acesso ao repositório; release
pública num repositório público expõe todo o histórico de builds internos).

## 2. Ligar a página para clientes (Vercel, Production)

| Variável | Valor |
|---|---|
| `DESKTOP_RELEASES_BASE_URL` | origem https da CDN (ex.: `https://downloads.<seu-domínio>`), sem caminho |
| `DESKTOP_TRUSTED_SIGNER_SHA1` | thumbprint(s) SHA-1 do certificado da empresa, separados por vírgula (atual + anterior na troca) |
| `DESKTOP_PUBLIC_DOWNLOAD` | `on` **somente** com autorização comercial do proprietário |

Sem as três, ou sem `latest.json` válido, nada é oferecido. Desligar = remover `DESKTOP_PUBLIC_DOWNLOAD`
e redeploy (lembrar: deployments antigos guardam a env antiga nas URLs diretas).

## 3. Publicar, promover e voltar versão

1. Subir `apps/desktop/package.json` (versão nova) por PR normal; CI `desktop-windows.yml` verde.
2. *Actions → Desktop Release pública → Run workflow* na `main`, `action=publish`.
   Revisor do environment aprova. Saída: `<versão>/release.json` + relatórios (sem o EXE).
3. Testes manuais da seção 5 com o arquivo **baixado da CDN**.
4. `action=promote`, `version=<x.y.z>` ⇒ `latest.json` passa a apontar a versão.
5. **Rollback**: `action=promote` com a versão anterior (o arquivo continua imutável na CDN).
   O programa já instalado numa versão maior não é rebaixado sozinho (não há instalação automática);
   orientar a loja a desinstalar e instalar a anterior — o perfil e as vendas pendentes ficam.

Uma versão enviada que falhar depois do upload fica "queimada" (sem `release.json`, nunca oferecida):
corrigir e publicar a próxima versão. Isso é intencional (imutabilidade).

## 4. Atualizações

| Tipo | Como chega |
|---|---|
| A) Sistema web | Deploy da Vercel. O programa só abre o site: atualiza sozinho, como o navegador. |
| B) Executável Electron | Novo Setup.exe. A partir da **1.0.4** o build Production consulta `/api/desktop/update-manifest` ao abrir; versão nova aparece em *Sobre* (Ctrl+Shift+Alt+V) com o SHA-256, e "baixar" abre `/baixar` no navegador. |

Regras mantidas: o programa **não baixa, não instala e não reinicia** sozinho (não fecha venda
aberta); produção recusa manifesto sem `signed: true`; manifesto só da própria origem por HTTPS
(`build-config.ts`); atualizar pelo Setup.exe preserva `%AppData%\OmniGestão Pro` (sessão, vendas
offline pendentes em localStorage/IndexedDB e `print-station.json`).
Instalações 1.0.0–1.0.3 (lojas piloto) não consultam manifesto: atualizar essas manualmente uma vez.
A verificação acontece na abertura: versão promovida com o programa aberto aparece após reabrir.
Dentro do programa, o botão de download da CDN pede confirmação para abrir no navegador (host externo).

## 5. Matriz de testes antes do `promote`

Todos com o arquivo **baixado da CDN** (o mesmo dos clientes). Registrar evidência em
`docs/ai-execution/_evidence/`. Só então atualizar `lib/desktop-distribution/compatibility.ts`.

| Item | Win 11 x64 | Win 10 22H2 x64 |
|---|---|---|
| Propriedades → Assinaturas Digitais mostra o titular; `Get-AuthenticodeSignature` = Valid | | |
| SmartScreen: o aviso mostra o **nome do titular** (nunca "Editor desconhecido") | | |
| Instalação nova, atalhos Área de Trabalho + Menu Iniciar, ícone em Aplicativos instalados | | |
| Atualização sobre a versão anterior (perfil, impressora e vendas pendentes preservados) | | |
| Login, logout, troca de loja (ADMIN/GERENTE com 2+ lojas) | | |
| Estação de impressão persiste após reinício; impressão direta POS-80 | | |
| Desinstalação (perfil preservado) e reinstalação sem perda de perfil | | |
| *Sobre* mostra a versão nova quando há `latest.json` maior | | |

Situação em 2026-11-19: Windows 11 x64 testado com 1.0.3 (não assinada) na loja piloto; runner
Windows Server prova instalação/atualização/desinstalação automáticas em toda PR. **Windows 10 22H2
nunca foi testado** — a página diz "em validação". A máquina de desenvolvimento é Windows 11 Home
(sem Hyper-V/Windows Sandbox), então o teste em Windows 10 precisa de outro computador ou VM.

## 6. O que o proprietário precisa adquirir/configurar

### 6.1 Certificado de assinatura de código (Authenticode)

Desde 2023 a chave de certificados de code signing precisa ficar em hardware certificado (token
USB ou HSM em nuvem). Para CI, use **assinatura em nuvem**:

- Certificado **OV** (Organization Validation) em nome da empresa, emitido por AC com assinatura
  em nuvem compatível com `signtool` via KSP/CSP no Windows (ex.: SSL.com eSigner, Certum
  SimplySign, DigiCert KeyLocker, Sectigo + HSM próprio). Exige CNPJ e validação da empresa.
- Alternativa: **Azure Artifact Signing** (antigo Trusted Signing) — barato e feito para CI, mas
  verificar elegibilidade da empresa no Brasil antes de contratar.
- EV não dá mais reputação imediata no SmartScreen; um OV assinado constrói reputação com os
  downloads. Os primeiros downloads podem ainda mostrar o aviso **com o nome da empresa** — nunca
  contornar.

Configurar no GitHub: *Settings → Environments → `desktop-release`* (com **Required reviewers**):

| Tipo | Nome | Conteúdo |
|---|---|---|
| var | `OMNI_DESKTOP_SIGN_PROVIDER` | `store` (HSM do fornecedor) ou `pfx` (legado) |
| var | `OMNI_DESKTOP_SIGN_SHA1` | thumbprint do certificado (modo `store`) |
| var | `OMNI_DESKTOP_TIMESTAMP_URL` | servidor RFC 3161 da AC |
| var | `OMNI_DESKTOP_TRUSTED_SHA1` | thumbprint(s) aceitos (mesmo valor de `DESKTOP_TRUSTED_SIGNER_SHA1` na Vercel) |
| secret | `OMNI_DESKTOP_PFX_BASE64` / `OMNI_DESKTOP_PFX_PASSWORD` | só modo `pfx` |

No modo `store`, acrescentar ao job `publish` (antes de "Certificado — repositório do Windows") o
passo oficial do fornecedor que instala o KSP e autentica com a credencial dele (em secrets do
mesmo environment). O job confere que o certificado está em `Cert:CurrentUserMy`, está na lista
confiável e não vence em 7 dias. Assinatura só SHA-256 + RFC 3161. No modo `pfx` o certificado é
removido do runner antes de qualquer instalador ser executado; no modo `store`, encerrar a sessão
do fornecedor no mesmo ponto se a ferramenta dele permitir.

### 6.2 Armazenamento de downloads

1. Cloudflare R2: bucket novo só para isso (ex.: `omni-desktop-releases`), **não** o do Contador.
2. Domínio próprio no bucket (ex.: `downloads.<seu-domínio>`), HTTPS; acesso público só por ele.
3. Token R2 com escrita **somente nesse bucket**.
4. Antes da 1ª publicação, testar com uma chave descartável que o bucket recusa `put-object
   --if-none-match "*"` sobre objeto existente (imutabilidade depende disso).
5. No environment `desktop-release`: var `OMNI_DESKTOP_RELEASES_BASE_URL` (`https://downloads.<…>`),
   var `OMNI_DESKTOP_R2_BUCKET`, secrets `OMNI_DESKTOP_R2_ENDPOINT`
   (`https://<account>.r2.cloudflarestorage.com`), `OMNI_DESKTOP_R2_ACCESS_KEY_ID`,
   `OMNI_DESKTOP_R2_SECRET_ACCESS_KEY`.

### 6.3 Antes de ligar `DESKTOP_PUBLIC_DOWNLOAD=on`

- [ ] 1ª versão publicada e promovida pelo workflow (assinada, conferida, instalada).
- [ ] Matriz da seção 5 aprovada em Windows 11 **e** Windows 10 22H2 (ou página mantém Win10 "em validação").
- [ ] Canal de suporte real (hoje `/suporte` mostra contatos de exemplo — não linkado pela página).
- [ ] Autorização comercial do proprietário.

## 7. Primeiro acesso (auditoria — nada provisionado automaticamente)

Achados em `main` (`b55a9d2`):

| Item | Situação |
|---|---|
| `/` | Página de **acesso piloto** ("liberado pela equipe da plataforma"). Mantida. |
| Landing completa (`/dashboard/landing-preview`) | Só para sessão de plataforma. **Não publicar**: depoimentos fictícios, "+12.000 lojas ativas", "7 dias grátis", ganhos de vendas sem fonte. |
| `SignupModal` | Formulário demonstrativo: o envio só fecha o modal, **não grava nada**. |
| Preços | Três fontes divergentes: `subscription-plans-catalog.ts` (Bronze R$ 59,90…), landing, e a proposta da PR #374 (R$ 39,90/69,90/99,90, não aprovada). Nenhum valor confirmado. |
| Teste grátis | Landing diz 7 dias; `app/api/billing/checkout` cria assinatura Stripe com `trial_period_days: 14`. Não homologado. |
| Assinatura × acesso | Contenção: o proxy **não** verifica assinatura (`lib/auth/session-entitlement.ts`); falta Tenant/Organization. |
| Provisionamento | Manual: `/api/platform/provision` só aceita sessão de plataforma. Correto para o piloto. |
| Pedido de teste | PR #374 (draft) grava pedidos em `solicitacoes_teste_comercial` para a plataforma provisionar à mão; migration não aplicada. |

Decisão: **acesso comercial segue em modo piloto**. `/baixar` não oferece cadastro; diz que o acesso é
liberado pela equipe e aponta para o login.

Fluxo seguro recomendado (próximas trilhas, cada uma com autorização própria):

1. **Visitante → solicitação**: reaproveitar a #374 (pedido gravado, sem tenant), com limite por
   IP/e-mail e captcha de terceiros na borda; aceite de privacidade (LGPD) explícito.
2. **Verificação**: e-mail de confirmação com token de uso único; WhatsApp opcional.
3. **Provisionamento autorizado**: plataforma aprova o pedido → `provisionClient` existente
   (idempotente por e-mail/CNPJ; recusa duplicidade) cria loja isolada + ADMIN com troca de senha
   obrigatória.
4. **Login → onboarding**: assistente de primeiro acesso existente.
5. Automatizar a aprovação **só** depois de: Tenant/Organization (entitlement verificável),
   preço e período de teste aprovados, limites por plano implementados (hoje os planos não limitam
   usuários — ver #374) e cobrança Stripe homologada.
