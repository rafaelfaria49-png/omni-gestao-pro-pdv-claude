# Release pública do desktop — configuração e homologação

GOAL `OMNI-DESKTOP-DISTRIBUICAO-PUBLICA-SAAS-001` · etapa `CONFIGURACAO_E_HOMOLOGACAO_RELEASE_PUBLICA` · 2026-11-19

> **SUSPENSO em 20/11/2026.** O proprietário não aprovou a despesa do certificado (orçamento R$ 0).
> Este documento e a integração eSigner no workflow ficam preservados, dormentes e fail-closed (sem os
> segredos, `publish` falha no 1º passo). Estratégia vigente: `DISTRIBUICAO_CUSTO_ZERO.md`.

Complementa `DISTRIBUICAO_PUBLICA.md` (arquitetura). Nada foi comprado, nenhum bucket criado, nada
publicado. Download público segue **desligado**.

## 1. Assinatura de código — comparação

Câmbio de referência: PTAX venda 19/11/2026 = **R$ 5,8889**. Cartão internacional soma IOF (3,5%).

| Opção | Custo ano 1 (US$) | ≈ R$ (+IOF) | CI oficial, sem interação | signtool | Empresa BR | Situação |
|---|---|---|---|---|---|---|
| **SSL.com OV + eSigner Tier 1** | 129 (certificado) + 180 (eSigner, 240 assinaturas/ano, cobrança anual) = **309** | ~1.880 | **Sim**: eSigner CKA oficial, TOTP em segredo | **Sim**: certificado aparece em `Cert:\CurrentUser\My` → `signtool /sha1` (modo `store` já existente, sem mudar `forge.config.js`) | Sim (D-U-N-S gratuito ou outra fonte aceita + ligação de verificação) | **Recomendado** |
| Certum Standard Code Signing in the Cloud (SimplySign) | ~249 na loja oficial (€209); revendas a partir de ~99–167 | ~1.520 (oficial) | **Não oficial**: só ferramentas da comunidade (semente TOTP extraída, `ssign`, automação do SimplySign Desktop) | Sim, via SimplySign Desktop/PKCS#11 | Sim | Descartado: a automação não é suportada pelo fornecedor |
| Sectigo OV (revenda) + chave em Google Cloud HSM | ~220 + ~30 de HSM = ~250 | ~1.520 | Sim (provedor CNG oficial do Google; Workload Identity, sem segredo fixo) | Sim, mas com `/f cert /csp /kc` | Sim | Alternativa ~US$ 60/ano mais barata; exige conta Google Cloud com cobrança, atestação de chave com a Sectigo e mudança na assinatura do `forge.config.js` |
| Azure Artifact Signing (Trusted Signing) | 120 (US$ 9,99/mês) | ~730 | Sim | Sim | **Não**: organizações só de EUA, Canadá, UE e Reino Unido | Inelegível |
| DigiCert KeyLocker | acima de 500 (não verificado) | — | Sim | Sim | Sim | Mais caro |

**Escolha: SSL.com OV + eSigner (Tier 1).** Entre as opções oficiais, sem interação, compatíveis com o
pipeline e disponíveis para empresa brasileira, é a que cabe no modo `store` já implementado e testado
(sem mexer no código de assinatura) e tem integração documentada pelo próprio fornecedor. A Sectigo +
Google Cloud HSM é cerca de US$ 60 por ano mais barata no preço de tabela, mas acrescenta um segundo
fornecedor de nuvem, o processo de atestação da chave e a mudança da assinatura; fica registrada como
alternativa se o proprietário preferir essa economia.

Pontos de atenção:

- **Validade**: desde 27/02/2026 um certificado de code signing vale no máximo 459 dias → renovação anual
  (há desconto em plano plurianual; cada ano é uma reemissão).
- **Cota**: cada arquivo assinado conta 1. O `@electron/windows-sign` assina todo PE do pacote (exe, dll,
  node) e o Squirrel assina Setup/Update: estimativa de **~15 assinaturas por publicação** → Tier 1
  (240/ano, saldo não usado acumula) ≈ 15 publicações/ano. Publicação que falha depois de assinar também
  consome. Tier 2 = US$ 63,75/mês (1.200/ano) se faltar.
- **Validação da empresa**: razão social e endereço conferidos em fonte oficial (D-U-N-S da Dun &
  Bradstreet é a preferida, gratuita, alguns dias úteis) + ligação para telefone publicado + autorização
  do pedido. Empresa com menos de 3 anos: também documento com foto do solicitante.
- O instalador do eSigner CKA é fixado por versão (v1.1.2, 28/07/2026) e **SHA-256** do release oficial
  `SSLcom/eSignerCKA`; o job recusa arquivo diferente.
- Os primeiros downloads podem mostrar o SmartScreen **com o nome da empresa** até a reputação se formar.
  Nunca contornar.

### 1.1 Integração no `desktop-release.yml` (pronta, não executada)

Job `publish`, modo `store`:

1. *Fornecedor — SSL.com eSigner CKA*: baixa o CKA fixado, confere SHA-256, instala silencioso no
   diretório temporário do runner, `eSignerCKATool config -mode product` com usuário/senha/TOTP vindos
   só de segredos (saída descartada), `unload` + `load`.
2. *Certificado — repositório do Windows* (já existia): exige o thumbprint em `Cert:\CurrentUser\My`, na
   lista confiável e válido por mais de 7 dias.
3. Build assinado + `verify-artifacts --require-signed`.
4. *Encerrar eSigner CKA* (`always()`): `unload`, apaga `master.key` e a configuração da conta e tira o
   certificado do repositório **antes** de qualquer instalador ser executado.

Configuração no environment `desktop-release`, depois da compra:

| Tipo | Nome | Valor |
|---|---|---|
| var | `OMNI_DESKTOP_SIGN_PROVIDER` | `store` (**já configurada**) |
| var | `OMNI_DESKTOP_SIGN_VENDOR` | `sslcom-esigner` |
| var | `OMNI_DESKTOP_TIMESTAMP_URL` | `http://ts.ssl.com` |
| var | `OMNI_DESKTOP_SIGN_SHA1` | thumbprint do certificado emitido |
| var | `OMNI_DESKTOP_TRUSTED_SHA1` | o mesmo thumbprint (e o anterior, na troca) |
| secret | `OMNI_DESKTOP_ESIGNER_USERNAME` | usuário da conta SSL.com |
| secret | `OMNI_DESKTOP_ESIGNER_PASSWORD` | senha da conta SSL.com |
| secret | `OMNI_DESKTOP_ESIGNER_TOTP_SECRET` | segredo TOTP do eSigner (gerado no painel, "automated signing") |

Recomenda-se um usuário SSL.com dedicado à assinatura automática (não o login pessoal do proprietário).

Risco conhecido: o guia do fornecedor diz que, se o `signtool` x64 falhar com o CKA, deve-se usar o x86.
O `@electron/windows-sign` usa o `signtool.exe` que ele mesmo traz. Se a 1ª publicação falhar ali,
apontar `signToolPath` para o x86 do Windows SDK do runner.

## 2. Cloudflare R2 e domínio

Achados (somente leitura):

- A conta Cloudflare do projeto **existe** (o Contador HUB usa R2: `R2_ACCOUNT_ID`/`R2_BUCKET` na Vercel).
  O `wrangler` desta máquina está **sem login**, então os buckets não foram listados nem tocados.
- **Nenhum domínio do proprietário está na Cloudflare.** `rafacellassistec.com.br` usa DNS da HostGator
  (loja Tray em `www`, landing em `servico.`). `omnigestao.com.br` pertence a **outra empresa** (não usar).
  `omnigestaopro.com.br`, `omnigestaopro.app` e `omnigestao.app` estavam **livres** em 19/11/2026.
- Domínio próprio no R2 exige a zona DNS na Cloudflare. `r2.dev` não serve (limitado, não é para
  produção, e o workflow o recusa).

Plano (ações do proprietário no painel; o workflow não cria nada):

1. Registrar `omnigestaopro.com.br` no Registro.br (~R$ 40/ano) e apontar os servidores DNS para a
   Cloudflare (plano Free). Alternativa: mover o DNS de `rafacellassistec.com.br` — **não recomendado**
   (mexe na loja Tray e no e-mail, e a marca é outra).
2. R2 → Create bucket `omni-desktop-releases`, classe **Standard**. Não alterar os buckets existentes.
3. Bucket → Settings → Custom Domains → `downloads.omnigestaopro.com.br` (HTTPS automático). Manter
   **r2.dev desativado**. Sem CORS (download é navegação direta).
4. R2 → Manage API tokens → **Object Read & Write**, aplicado **somente** a `omni-desktop-releases`,
   sem TTL longo desnecessário. Gravar no environment (nunca em chat/arquivo):
   secrets `OMNI_DESKTOP_R2_ENDPOINT` (`https://<account-id>.r2.cloudflarestorage.com`),
   `OMNI_DESKTOP_R2_ACCESS_KEY_ID`, `OMNI_DESKTOP_R2_SECRET_ACCESS_KEY`;
   var `OMNI_DESKTOP_RELEASES_BASE_URL` = `https://downloads.omnigestaopro.com.br`.
   (`OMNI_DESKTOP_R2_BUCKET` = `omni-desktop-releases` **já configurada**.)
5. Bloqueio extra de sobrescrita: Bucket → Settings → **Bucket lock rules** → regra sem prazo para o
   prefixo `desktop/production/1` (todas as versões 1.x). Esse prefixo **não** cobre `latest.json` nem
   `versions.json`, que o `promote` precisa reescrever. Conferir na doc da Cloudflare se a regra impede
   só exclusão/sobrescrita e continua aceitando objetos novos antes de ativar.
6. Rodar *Actions → Desktop Release pública → `verify-storage`*: grava `desktop/_probe/<run>.txt`, prova
   que a 2ª escrita com `If-None-Match: *` é recusada (412), que o domínio serve o objeto por HTTPS e que
   não lista o bucket. Não toca em versões.

URLs imutáveis por versão (já no pipeline):
`https://downloads.omnigestaopro.com.br/desktop/production/<versão>/OmniGestaoPro-Setup.exe`.
Custo R2: armazenamento US$ 0,015/GB-mês (10 GB grátis), saída gratuita.

## 3. GitHub Actions — estado

- Environment **`desktop-release` criado** em 19/11/2026: *Required reviewers* = proprietário,
  *Deployment branches* = somente `main`. (Repositório pessoal: o próprio proprietário aprova.)
- Vars configuradas: `OMNI_DESKTOP_SIGN_PROVIDER=store`, `OMNI_DESKTOP_R2_BUCKET=omni-desktop-releases`.
- Nenhum secret configurado. Sem certificado e sem R2, `publish` falha no 1º passo (fail-closed):
  instalador não assinado nunca é publicado.

## 4. Homologação Windows (com o arquivo baixado da CDN)

Máquinas:

| Alvo | Onde | Observação |
|---|---|---|
| Windows 11 x64 | PC de desenvolvimento (Win 11 Home) ou PC de teste | **Não** usar o PC do caixa da RAFACELL sem autorização. |
| Windows 10 22H2 x64 | PC físico com Win 10 ou VM VirtualBox (roda no Win 11 Home sem Hyper-V) com ISO oficial 22H2 | O Win 10 saiu de suporte em 14/10/2025 (só ESU); manter "em validação" se não houver máquina. |

Roteiro por máquina (registrar em `docs/ai-execution/_evidence/`):

| # | Passo | Como verificar | Win 11 | Win 10 |
|---|---|---|---|---|
| 1 | Baixar da CDN e conferir hash | `Get-FileHash .\OmniGestaoPro-Setup.exe -Algorithm SHA256` = `release.json` | | |
| 2 | Assinatura e editor | `Get-AuthenticodeSignature .\OmniGestaoPro-Setup.exe` → `Valid`, titular = empresa, carimbo de tempo; Propriedades → Assinaturas Digitais | | |
| 3 | SmartScreen | aviso, se houver, mostra o **nome da empresa** (nunca "Editor desconhecido") | | |
| 4 | Instalação nova | atalhos Área de Trabalho + Menu Iniciar, ícone correto, item em Aplicativos instalados com editor | | |
| 5 | Login / logout / troca de loja | ADMIN ou GERENTE com 2+ lojas | | |
| 6 | Impressão | estação de impressão persiste após reiniciar; impressão direta POS-80 | | |
| 7 | Atualização | instalar a versão anterior, depois a nova por cima: perfil, impressora e vendas pendentes preservados | | |
| 8 | Aviso de versão | *Sobre* (Ctrl+Shift+Alt+V) mostra versão nova quando há `latest.json` maior | | |
| 9 | Desinstalação | remove programa e atalhos; `%AppData%\OmniGestão Pro` preservado; reinstalar sem perder perfil | | |

## 5. Publicação controlada (só após certificado, R2 e homologação)

1. `verify-storage` verde.
2. `publish` na `main` (aprovação no environment) → assina, envia imutável, baixa pela CDN, confere
   SHA-256 + certificado, instala o arquivo baixado, grava `<versão>/release.json`.
3. Matriz da seção 4 com esse mesmo arquivo.
4. **Parar.** `promote` (gera `latest.json`) e `DESKTOP_PUBLIC_DOWNLOAD=on` na Vercel só com autorização
   expressa do proprietário.
