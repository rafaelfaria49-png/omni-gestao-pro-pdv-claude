# Privacidade e termos comerciais do piloto pago — PROPOSTA PARA APROVAÇÃO HUMANA

GOAL `OMNI-SAAS-LANCAMENTO-COMERCIAL-PILOTO-001` · 2026-11-22 · sobre `main` `8286a4a`.

> **Nada aqui está publicado.** `/privacy` continua com o texto de 2026-10-15. Este rascunho
> precisa de revisão do proprietário e, de preferência, de um advogado antes de ir ao ar.
> Itens entre `[[ ]]` são decisões que só o proprietário pode tomar — não foram inventados.

## 1. Lacunas do texto atual de `/privacy`

| Lacuna | Por que importa no piloto pago |
|---|---|
| Não identifica o controlador/operador (razão social, CNPJ) | O cliente lojista precisa saber com quem contrata e a quem confia os dados dos clientes dele |
| Não separa os dois papéis: OmniGestão como **controlador** (dados do lojista e do pedido comercial) e como **operador** (dados que o lojista cadastra sobre os clientes dele) | Define quem responde por cada pedido de exclusão |
| Não descreve o formulário de `/gestao-lojas` | O consentimento do formulário aponta para esta página |
| Não tem prazo de retenção nem de exclusão | Hoje não existe expurgo de nada (pedidos descartados, lojas encerradas) |
| Não lista suboperadores | Vercel (hospedagem), Neon (banco), Cloudflare R2 (arquivos do Contador HUB, se usado) |
| Contato = email pessoal | Decidir se fica esse canal ou um dedicado |

## 2. Texto proposto para `/privacy` (rascunho)

**Quem somos.** O OmniGestão Pro é operado por `[[razão social]]`, CNPJ `[[CNPJ]]`.
Contato para privacidade: `[[email aprovado]]`.

**Dois tipos de dado.**
1. *Dados da sua empresa e da sua conta* (nome, email, WhatsApp, nome da loja, endereço,
   CNPJ, usuários e senhas cifradas): nós decidimos como tratamos. Usamos para criar e manter
   o acesso, dar suporte e cobrar a mensalidade.
2. *Dados que você cadastra sobre os seus clientes, produtos e vendas*: quem decide é a sua
   empresa. Nós guardamos e processamos só para o sistema funcionar para você, não usamos para
   outra finalidade e não compartilhamos com outras lojas.

**Pedido de teste em `/gestao-lojas`.** Guardamos nome, nome da loja, email, WhatsApp, tipo de
loja e a mensagem, com a data do seu consentimento. Usamos só para falar com você sobre o teste
e liberar o acesso. Guardamos um código derivado da sua conexão (não o endereço IP) para evitar
envios em massa.

**Onde os dados ficam.** Hospedagem Vercel e banco Neon `[[confirmar regiões contratadas]]`.
Arquivos enviados ao Contador HUB ficam no Cloudflare R2. Não vendemos dados.

**Isolamento.** Cada loja só acessa os próprios dados; o acesso é checado no servidor a cada
consulta.

**Retenção** (proposta — ver §3).

**Seus direitos.** Acesso, correção, portabilidade e exclusão pelo contato acima. Respondemos em
até `[[15]]` dias. Vendas, caixa e documentos fiscais podem ter guarda obrigatória por lei e não
são apagados antes do prazo legal.

## 3. Retenção e exclusão — proposta de regra (decisão do proprietário)

| Dado | Proposta | Situação no código hoje |
|---|---|---|
| Pedido de teste **descartado** | apagar após `[[90]]` dias | sem expurgo; histórico só cresce |
| Pedido de teste **provisionado** | manter enquanto a loja existir (é o vínculo do contrato) | `historico[]` guarda `storeId`/`userId` |
| Loja que **encerra** o contrato | acesso desativado no dia; exportação oferecida por `[[30]]` dias; exclusão depois, exceto registros com guarda legal | não há "encerrar loja"; só desativar usuário. Exclusão exige procedimento manual autorizado |
| Vendas, caixa, financeiro | manter `[[5 anos]]` (prazo contábil/fiscal usual — validar com contador) | registros nunca são apagados (`historico[]`) |
| Usuários desativados | manter o registro (auditoria), sem login | `active=false` |
| Logs da Vercel | retenção do provedor (~1 dia no plano atual) | — |

**Exclusão a pedido do titular** (cliente final de um lojista): o pedido vai ao lojista
(controlador); nós executamos a pedido dele. **Não existe ferramenta de exclusão na interface** —
hoje seria um procedimento manual no banco, com backup antes e registro de quem pediu. Implementar
isso é item do backlog (G-09 em `LANCAMENTO_PILOTO_PAGO_001.md`).

## 4. Termos comerciais do piloto pago — pontos para o contrato (rascunho)

1. **Objeto:** acesso ao OmniGestão Pro, oferta "Vendas e Estoque" (PDV, Caixa, Produtos,
   Estoque, Clientes, Relatórios básicos), pelo navegador.
2. **Não incluído:** emissão fiscal (NF-e/NFC-e), venda por peso (kg), grade de tamanho/cor,
   aplicativo Windows, IA, WhatsApp, Financeiro completo. **O lojista continua responsável pela
   própria emissão fiscal** — o comprovante do sistema é não fiscal.
3. **Período de piloto:** início `[[data]]`, fim `[[data]]`, com acompanhamento assistido.
4. **Preço e cobrança:** `[[valor]]` por `[[loja/mês]]`, por `[[Pix/boleto manual]]`, vencimento `[[dia]]`.
5. **Limite de usuários:** `[[n]]` — **hoje o sistema não aplica limite**; vale como regra contratual.
6. **Inadimplência:** após `[[n]]` dias, aviso; após `[[n]]` dias, acesso restrito pela
   plataforma ("Liberação por loja"). Nada disso é automático.
7. **Suporte:** canal `[[contato aprovado]]`, horário `[[horário]]`, prazo de resposta `[[prazo]]`.
8. **Disponibilidade:** sem SLA formal no piloto; manutenção avisada com antecedência.
9. **Dados:** remete à política de privacidade (§2) e à retenção (§3); exportação no encerramento.
10. **Responsabilidade:** limitada ao valor pago no período `[[validar com advogado]]`.

## 5. O que muda no código quando aprovado

- `app/privacy/page.tsx`: trocar o texto e a data de atualização.
- Versão do consentimento do formulário (`gestao-lojas-2026-11-18` em `lib/comercial`) sobe junto,
  para os pedidos novos registrarem a versão aprovada.
- Termos: hoje "enviados junto com a proposta" (rodapé da `/gestao-lojas`); manter assim no piloto
  ou publicar `/termos` — decisão do proprietário.
