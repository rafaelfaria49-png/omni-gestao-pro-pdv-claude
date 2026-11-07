# P2 · fase `url` — URL_CHECK=PASS (2026-10-27, sem conexão)

Roteiro: `harness/p2-preparo-preview.cjs url`. Ele lê o arquivo local e valida a URL. **Não abre conexão** com o
banco: não chama psql nem Prisma e não resolve DNS.

## Arquivo

O caminho real é `C:\Projetos\secrets\neon-preview\.env`: pasta `neon-preview`, arquivo `.env`. Isso difere do
`neon-preview.env` previsto no `05`. A P2.1 usa `P2_SECRETS_FILE` com esse caminho.

| Conferência | Resultado |
| --- | --- |
| Existe, é arquivo, nome `.env` | sim (191 bytes); variantes `.env.txt` ausentes |
| Fora de repositório git | sim (`not a git repository`) |
| Chaves | só `PREVIEW_MAIN_OWNER_URL`, 1 linha, sem BOM, LF |

## Saída (redigida pelo roteiro)

```
url: OK sem conectar · endpoint=ep-purple-morning-b6ajdsfk host_celula=c-2 pooler=off usuário=omnigestao_preview_owner db=omnigestao_preview sslmode=require senha_presente=true
```

| Item | Como foi conferido | Resultado |
| --- | --- | --- |
| Endpoint `ep-purple-morning-b6ajdsfk` | 1º rótulo do host = constante `MAIN_EP` | PASS |
| Pooling desligado | host sem `-pooler` | PASS |
| Database `omnigestao_preview` | path da URL | PASS |
| Role `omnigestao_preview_owner` | usuário da URL = constante `OWNER` | PASS |
| Não é produção | endpoint ≠ `ep-summer-tooth-acltc6wi` | PASS |
| Projeto `nameless-frost-19035275` · branch `br-lively-feather-b6esh64a` | **não estão na URL.** Hoje valem pelo vínculo endpoint→branch confirmado na P2.0 (`06`). Na P2.1 a trava de cada sessão psql confere `neon.project_id`/`neon.branch_id`/`neon.endpoint_id` antes de qualquer escrita | indireto |

## Ajuste no validador: host com célula `.c-2`

O console Neon atual mostra o host direto como `ep-….c-2.sa-east-1.aws.neon.tech`. O regex antigo só aceitava
`ep-….sa-east-1.aws.neon.tech`. O novo aceita **um** segmento opcional `c-<número>`. O endpoint continua sendo o
1º rótulo, comparado às constantes.

O pooler derivado para o runtime vira `ep-…-pooler.c-2.sa-east-1…`, que é o formato do Neon.

Provas com URLs falsas e senha fictícia (sem conexão):

| Caso | Resultado |
| --- | --- |
| main com `c-2` | passa |
| main sem célula | passa |
| `-pooler.c-2` | recusado |
| produção com `c-2` | recusado |
| outro endpoint com `c-2` | recusado |
| célula malformada (`c-x`) | recusado |
| segmento extra antes da célula | recusado |
| outra região | recusado |
| usuário errado | recusado |
| database errado | recusado |

Nada foi executado além disso. A P2.1 aguarda autorização específica.

## Revalidação depois da P2.2: main + `pr315-kg`, URL_CHECK=PASS (2026-10-27, sem conexão)

O arquivo `C:\Projetos\secrets\neon-preview\.env` passou a ter 3 chaves: `PREVIEW_MAIN_OWNER_URL`,
`PREVIEW_KG_OWNER_URL` e `PREVIEW_KG_BRANCH_ID`. São 3 linhas, sem BOM, com CRLF (o leitor aceita).

A fase `url` passou a validar também o filho. Usa as mesmas travas da fase `kg`, sem conectar.

```
url: OK sem conectar · endpoint=ep-purple-morning-b6ajdsfk host_celula=c-2 pooler=off usuário=omnigestao_preview_owner db=omnigestao_preview sslmode=require senha_presente=true
url kg: OK sem conectar · branch=br-wandering-band-b6ov7vmt endpoint=ep-red-wave-b6bbj667 host_celula=c-2 pooler=off usuário=omnigestao_preview_owner db=omnigestao_preview sslmode=require senha_igual_main=true
```

O que a fase confere no filho:
- host direto sa-east-1, sem `-pooler`;
- endpoint diferente de produção e do main;
- database `omnigestao_preview` e usuário `omnigestao_preview_owner`;
- `PREVIEW_KG_BRANCH_ID` no formato `br-…` e diferente do main;
- senha do dono **igual** à do main. O branch copia papéis e senhas, então uma URL de outro projeto teria outra
  senha. A comparação é feita em memória e não é impressa.

Limite: a URL não carrega o branch. O vínculo `ep-red-wave-b6bbj667` → `br-wandering-band-b6ov7vmt` e o projeto só
são provados na P2.3, pela trava de cada sessão psql (`neon.project_id`/`branch_id`/`endpoint_id`).

Negativos com URLs falsas (sem conexão), todos recusados:
- endpoint do filho igual ao do main;
- branch igual ao main;
- branch malformado (`pr315-kg`);
- branch ausente;
- pooler;
- produção;
- usuário errado;
- database errado;
- senha diferente da do main.

O caso válido passa.

P2.3 não executada.
