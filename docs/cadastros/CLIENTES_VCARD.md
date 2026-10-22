# Clientes — importação assistida de contato vCard

Missão descritiva de evolução funcional do Cadastros HUB, sobre a main publicada
após a PR #296. Não cria nem renumera CAD-R2/GOAL; não reabre #294/#295/#296.
AEP opt-in inativo na worktree; nenhum state, ledger ou registry alterado.

## O que o operador faz

Em **Clientes → Novo → Importar contato (vCard)**:

1. Seleciona um arquivo `.vcf` **ou** cola o conteúdo e clica em "Ler conteúdo colado".
2. Se o arquivo tiver vários contatos, escolhe **um** (rótulo = nome; final do
   telefone só quando o nome se repete). Os demais não são usados nem enviados.
3. Revisa a prévia editável (Nome, Telefone/WhatsApp, Email, Endereço, Cidade, UF).
   Vários telefones/emails/endereços exigem escolha explícita ("Escolha um valor…",
   ou "Não usar"); a preferência do arquivo só ordena a lista.
4. **Aplicar aos campos vazios** só preenche campos vazios do formulário. Campo já
   digitado com valor diferente aparece em "Divergências com o formulário" e só muda
   com "Substituir … pelo do contato".
5. O cadastro segue o fluxo existente: revisão, "Revisei os dados e confirmo o
   cadastro.", **Salvar cliente** → `salvarClienteRevisado` → `ClientWriteService`.

Nada é salvo ao selecionar, interpretar ou aplicar. Texto/voz e o cadastro manual
continuam disponíveis; a importação é uma seção própria, fechada por padrão e
ausente na edição de cliente existente. Não é importação de agenda, de clientes em
lote nem de backup.

## Formatos e limites

| Item | Suporte |
| --- | --- |
| vCard 3.0 (RFC 2426) e 4.0 (RFC 6350) | Subconjunto: BEGIN/END, VERSION, FN, TEL (texto e URI `tel:`), EMAIL, ADR; linhas dobradas; escapes `\\` `\,` `\;` `\n`; nomes/parâmetros sem diferenciar maiúsculas; grupos (`item1.TEL`); vários contatos e versões no mesmo arquivo |
| Codificação | UTF-8 estrito (BOM UTF-8 aceito). Byte inválido, UTF-16/32, `CHARSET` ≠ UTF-8 e QUOTED-PRINTABLE são recusados |
| Recusas com mensagem clara | vazio, não vCard, truncado (sem END), estrutura inválida (aninhado, conteúdo fora do cartão, linha sem `:`), sem VERSION, **vCard 2.1**, versão desconhecida, base64 em campo de texto, caracteres de controle |

Não é conformidade completa com as normas. Limites de **produto** (não do formato),
exibidos na UI e cobertos por testes: arquivo/conteúdo até **256 KiB** (bytes UTF-8,
checado antes de ler o arquivo); até **50 contatos**; **300** propriedades por
contato; **20** valores por campo; **1.000** caracteres por campo utilizado; **512**
caracteres de nome+parâmetros; **20.000** linhas físicas. Ultrapassar = recusa
explícita, nunca truncamento. O parser é linear (sem regex com retrocesso no valor).
Validação é pelo conteúdo, não pela extensão ou MIME. Sem dependência nova.

## Mapeamento

| vCard | Editor | Regra |
| --- | --- | --- |
| FN | Nome | Nome formatado do arquivo. N não compõe nome; sem FN = "Ausente no contato: preencha o nome" |
| TEL | Telefone / WhatsApp | Texto como está; URI `tel:` perde só o esquema e parâmetros (`;ext=`). Sem DDD/+55 inventado; não marca WhatsApp; DDI estrangeiro recebe aviso; número que o editor recusaria não é aplicado |
| EMAIL | Email | Um endereço escolhido; nunca concatenados |
| ADR | Endereço, Cidade, UF | Rua + complemento → Endereço; localidade → Cidade; região → UF só se for UF ou nome de estado brasileiro e o país for vazio ou Brasil. CEP, país, caixa postal e região estrangeira/desconhecida são listados como **não importados** |

Nunca vêm do arquivo: CPF/CNPJ, tipo PF/PJ (ORG não implica PJ), tags e observações.
Não utilizados (só a categoria é mostrada, sem valores, e nada é guardado): fotos,
logotipos e sons; datas; localização e fuso; chaves e certificados; notas livres;
links, mensageiros e calendários; relações e grupos; organização, cargo e função;
apelido; etiqueta de endereço; identificadores/metadados; extensões desconhecidas.

## Privacidade e segurança

- Leitura e interpretação só no navegador (`FileReader` + parser puro). Sem endpoint
  de upload, sem LLM/OCR, sem requisição a URLs do arquivo (PHOTO/URL/SOURCE/LOGO/KEY).
- Arquivo bruto, nome do arquivo, lista de contatos e prévia não vão para servidor,
  storage (local/session/IndexedDB), URL, logs ou mensagens de erro. Valores são
  renderizados como texto (sem `dangerouslySetInnerHTML`).
- Estado transitório descartado ao cancelar, fechar o diálogo, trocar de loja (o
  editor remonta por loja), sair da tela, trocar de arquivo/texto e após aplicar.
  Leituras assíncronas antigas são invalidadas por número de série.
- Nenhuma permissão de câmera, microfone ou agenda é solicitada.
- O servidor continua validando os campos finais e o acesso à loja: a origem "vCard"
  é só apresentação e não é enviada (`captureSource` text/voice inalterado).

## Salvamento, duplicidade e resposta incerta

Sem Server Action nova, sem gravação direta por Prisma, sem schema/migration/draft
persistido. Duplicidade segue o `ClientWriteService`: contato compatível na loja é
recusado com revisão humana obrigatória, sem fusão nem UNIQUE por nome/telefone;
correspondências de outra loja não são consultadas. Duplo clique = uma submissão
(guarda existente). **Ajuste no editor:** quando a resposta do salvar não chega, a
mensagem passou a informar a incerteza ("o cadastro pode ter sido gravado: confira
a lista antes de salvar de novo"), preserva o formulário e desmarca a confirmação —
sem retry automático. Vale para todos os caminhos do editor (manual, texto, voz, vCard).

## Arquivos

- `lib/cadastros/vcard/parser.ts` — parser e limites; `lib/cadastros/vcard/cliente.ts` — mapeamento, prévia, aplicação e divergências; `lib/cadastros/vcard/__fixtures__/vcards.ts` — vCards sintéticos.
- `components/cadastros/lovable/components/cadastros/ClienteVcardImport.tsx` — seção de importação.
- `ClienteEditor.tsx` — ligação aditiva (`applyContact`) e mensagem de resposta incerta.
- `e2e/cadastros-ramos/05-clientes-vcard.spec.ts` — E2E autenticado.

## Testes

| Tipo | Arquivo | Cobertura |
| --- | --- | --- |
| Unitário | `lib/cadastros/vcard/parser.test.ts` | 3.0/4.0, acentos, escapes, dobras, URI `tel:`, múltiplos valores, grupos, recusas (vazio, truncado, 2.1, QP, charset, UTF-8 inválido, UTF-16, estrutura, controle), limites exatos (256 KiB ±1 byte, 50/51 contatos, 1.000/1.001 caracteres, propriedades, valores, cabeçalho, linhas), entrada hostil em tempo linear |
| Unitário | `lib/cadastros/vcard/cliente.test.ts` | prévia, escolha explícita, UF brasileira vs estrangeira/desconhecida, aplicar só a vazios e só válidos, divergências, rótulos mínimos |
| Componente (jsdom) | `ClienteVcardImport.test.ts` | editor real: aplicar e salvar só após confirmação; campos manuais intactos e substituição explícita; escolha de contato sem mistura; contatos não escolhidos fora do salvar; texto colado; cancelar; extensão vs conteúdo; 256 KiB sem leitura; leituras antigas, cancelamento e troca de loja; fechar/reabrir; sem rede/storage/log/URL/HTML ativo; Enter na prévia não submete; resposta incerta + dupla submissão; recusa de duplicidade |
| E2E autenticado | `05-clientes-vcard.spec.ts` (job `e2e-authenticated` do workflow `Ramos e Cadastros`) | build de produção + `next start` + PostgreSQL descartável + login NextAuth real: arquivo → escolha → prévia → aplicar → revisar → salvar (duplo clique = 1 Server Action e 1 registro) → listagem → reabertura → logout/login → banco conferido; nada sai do navegador além dos campos revisados; storage limpo; cancelar não grava; duplicidade recusada sem fusão; leitura de B não chega a A; Server Action real reenviada: controle do admin grava, CAIXA recusado, operador de B recusado em A; 390/320 px sem overflow |

## Voz (frente preservada) — intermitência pré-existente registrada

Localmente (Node 26, com `--no-experimental-webstorage` porque o `localStorage`
nativo do Node 26 encobre o do jsdom; a CI usa Node 24), testes de voz do
`ClienteEditor.test.ts` falharam de forma intermitente sob carga paralela
(`checks pt-BR locally…`, `hiding the tab…`, `closing the dialog aborts…`). Isolado:
37/37 em 3 execuções. Com o **editor da main inalterado** (cópia de `HEAD`) e a mesma
carga: falhas em 4 de 8 execuções nos mesmos testes; com o candidato: 2 de 8. Conclusão:
intermitência pré-existente do arranjo de voz sob carga, não introduzida por esta
integração (que não toca voz, diagnóstico, política de áudio nem o parser de texto
livre). Não foi corrigida aqui (fora do escopo).

## Limitações

Não entregues por esta missão: QR/câmera, agenda online/do dispositivo, importação
em lote, consulta de CNPJ, vCard 2.1, fotos/aniversário/notas. Homologação isolada
com dados sintéticos não equivale a cadastro real na loja.

`docs/ai/CURRENT_STATUS.md` não foi alterado: a PR #290 (aberta) também o edita; este
documento é o handoff de estado da funcionalidade.
