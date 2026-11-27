/**
 * G007 + G008 ponta a ponta em PostgreSQL DESCARTÁVEL:
 * webhook assinado → inbox/job G006 → worker oficial (`rodarWorker` + gancho) → motor → G001/G004/G005 reais →
 * respostas (fila própria) e resultado (outbox G006) pelo transporte SIMULADO. Nenhuma sessão de navegador.
 */
// Fixture primeiro: registra os mocks (@/auth nulo, @/lib/prisma descartável) antes de qualquer serviço.
import { bancoG007, cenarioG007, corpoMeta, dinheiro, drenar, encerrarG007, ENV, habilitadoG007, hashCodigo, ingress, leitor,
  owner, parear, receber, worker, type CenarioG007 } from "./assistente-fixtures"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { randomBytes, randomUUID } from "node:crypto"
import { consultarFinanceiro } from "@/lib/gastos/query"
import { claimJob } from "@/lib/gastos/queue"
import { requireFinanceiroPerfilAccess, requireFinanceiroPerfilAccessPorPrincipal } from "@/lib/gastos/access"
import { validarPapelWorker } from "@/lib/gastos/worker"
import { execucaoG004 } from "@/lib/gestor-money-assistente/adaptador-servidor"
import { processadorStagingGestao, reconciliarConversasGestao, TEXTOS } from "@/lib/gestor-money-assistente/whatsapp/gateway"
import { revogarVinculo, iniciarPareamento, CONSENTIMENTO_VERSAO_ATUAL, VinculoError } from "@/lib/gestor-money-assistente/whatsapp/vinculo"
import { processarWebhookGestao } from "@/lib/gestor-money-assistente/whatsapp/webhook"
import { formatarCentavos } from "@/lib/gestor-money-assistente/texto"
import { filtroDoPlano } from "@/lib/gestor-money-assistente/consultas"
import { diaCivil } from "@/lib/gestor-money-assistente/datas"
import type { PortaExecucao } from "@/lib/gestor-money-assistente/tipos"

const suite = habilitadoG007 ? describe : describe.skip
const textos = (l: Array<{ texto: string }>) => l.map(x => x.texto).join("\n---\n")

suite("G007 vínculo + G008 conversa persistente (PostgreSQL descartável)", () => {
  beforeAll(async () => { await bancoG007() })
  afterAll(async () => { await encerrarG007() })

  it("isolamento de papéis: worker G006 segue válido e NÃO lê as tabelas do assistente", async () => {
    await validarPapelWorker(worker)
    await expect(worker.$queryRaw`SELECT count(*) FROM gm_assist_vinculos`).rejects.toThrow()
    await expect(ingress.$queryRaw`SELECT count(*) FROM gm_assist_conversas`).rejects.toThrow()
  })

  it("pareamento válido: código só da sessão, do telefone declarado; uso único", async () => {
    const c = await cenarioG007(), ler = leitor(c)
    const d = await iniciarPareamento(owner, { userId: c.U1, telefoneE164: c.T1, consentimentoVersao: CONSENTIMENTO_VERSAO_ATUAL })
    const banco = await owner.gmAssistDesafio.findUniqueOrThrow({ where: { id: d.desafioId } })
    expect(banco.codigoHash).not.toContain(d.codigo) // só hash
    expect(JSON.stringify(banco)).not.toContain(`"${d.codigo}"`)
    await receber(c, c.T1, `código ${d.codigo.slice(0, 3)} ${d.codigo.slice(3)}`)
    await drenar(c)
    expect(textos(ler(c.T1))).toContain("vinculado à sua conta")
    const v = await owner.gmAssistVinculo.findUniqueOrThrow({ where: { ativoTelefone: c.T1 } })
    expect(v).toMatchObject({ adminUserId: c.U1, estado: "ATIVO", versao: 1, consentimentoVersao: CONSENTIMENTO_VERSAO_ATUAL })
    // Reutilizar o mesmo código: desafio já CONFIRMADO → recusado.
    await receber(c, c.T1, d.codigo)
    await drenar(c)
    const eventos = await owner.gmAssistEvento.findMany({ where: { adminUserId: c.U1 }, orderBy: { criadoEm: "asc" } })
    expect(eventos.map(e => e.tipo)).toEqual(expect.arrayContaining(["DESAFIO_CRIADO", "VINCULO_CRIADO"]))
    expect(eventos.every(e => !e.telefoneMascarado || e.telefoneMascarado.endsWith(c.T1.slice(-4)) && !e.telefoneMascarado.includes(c.T1.slice(3, 8)))).toBe(true)
    // Auditoria e vínculo imutáveis.
    await expect(owner.gmAssistEvento.deleteMany({ where: { adminUserId: c.U1 } })).rejects.toThrow()
    await expect(owner.gmAssistVinculo.update({ where: { id: v.id }, data: { adminUserId: c.U2 } })).rejects.toThrow()
  })

  it("pareamento inválido: código errado, bloqueio por tentativas, outro telefone, expirado, consentimento e limite", async () => {
    const c = await cenarioG007(), ler = leitor(c)
    const d = await iniciarPareamento(owner, { userId: c.U1, telefoneE164: c.T1, consentimentoVersao: CONSENTIMENTO_VERSAO_ATUAL })
    // Mesmo código vindo de OUTRO telefone: não há desafio para ele; o do T1 continua pendente.
    await receber(c, c.T3, d.codigo)
    await drenar(c)
    expect(textos(ler(c.T3))).toContain(TEXTOS.semDesafio)
    expect((await owner.gmAssistDesafio.findUniqueOrThrow({ where: { id: d.desafioId } })).estado).toBe("PENDENTE")
    const errado = d.codigo === "000000" ? "111111" : "000000"
    for (let i = 0; i < 4; i++) await receber(c, c.T1, errado)
    await drenar(c)
    expect(textos(ler(c.T1))).toContain("Você ainda tem 1 tentativa")
    await receber(c, c.T1, errado)
    await drenar(c)
    expect(textos(ler(c.T1))).toContain(TEXTOS.bloqueado)
    await receber(c, c.T1, d.codigo) // código certo depois do bloqueio: não vale mais
    await drenar(c)
    expect(await owner.gmAssistVinculo.count({ where: { adminUserId: c.U1 } })).toBe(0)
    // Expirado: desafio sintético criado há 20 min (validade 10 min).
    const salt = randomBytes(16).toString("hex"), criadoEm = new Date(Date.now() - 20 * 60_000)
    await owner.gmAssistDesafio.create({ data: { id: randomUUID(), adminUserId: c.U2, telefoneE164: c.T2, codigoSalt: salt, codigoHash: hashCodigo(salt, "424242"),
      pendenteUsuario: c.U2, consentimentoVersao: CONSENTIMENTO_VERSAO_ATUAL, criadoEm, expiraEm: new Date(criadoEm.getTime() + 10 * 60_000) } })
    await receber(c, c.T2, "424242")
    await drenar(c)
    expect(textos(ler(c.T2))).toContain(TEXTOS.expirado)
    await expect(iniciarPareamento(owner, { userId: c.U2, telefoneE164: c.T2, consentimentoVersao: "" })).rejects.toThrow(VinculoError)
    await expect(iniciarPareamento(owner, { userId: c.U2, telefoneE164: "11999", consentimentoVersao: CONSENTIMENTO_VERSAO_ATUAL })).rejects.toThrow(VinculoError)
    for (let i = 0; i < 4; i++) await iniciarPareamento(owner, { userId: c.U2, telefoneE164: c.T2, consentimentoVersao: CONSENTIMENTO_VERSAO_ATUAL })
    await expect(iniciarPareamento(owner, { userId: c.U2, telefoneE164: c.T2, consentimentoVersao: CONSENTIMENTO_VERSAO_ATUAL }))
      .rejects.toMatchObject({ codigo: "LIMITE_DESAFIOS" })
  })

  it("telefone não autorizado: onboarding, nenhuma conversa, nenhum dinheiro; HMAC inválido e número de atendimento recusados", async () => {
    const c = await cenarioG007(), ler = leitor(c)
    await receber(c, c.T3, "gastei 50 no mercado no pix")
    await drenar(c)
    expect(textos(ler(c.T3))).toContain("vincule este WhatsApp")
    expect((await dinheiro([c.P1, c.P2, c.E1, c.E2])).ops).toHaveLength(0)
    expect(await owner.gmAssistConversa.count({ where: { adminUserId: { in: [c.U1, c.U2] } } })).toBe(0)
    const corpo = corpoMeta(c, c.T3, "oi")
    const antes = await owner.whatsAppGestaoInbox.count()
    expect((await processarWebhookGestao({ rawBody: corpo.raw, assinatura: "sha256=" + "0".repeat(64), env: ENV, ingress })).status).toBe(401)
    expect((await processarWebhookGestao({ rawBody: corpo.raw, assinatura: corpo.assinatura, env: { ...ENV, GESTOR_MONEY_WHATSAPP_GESTAO: "" }, ingress })).status).toBe(404)
    const outro = corpoMeta({ ...c, canal: { ...c.canal, phoneNumberId: "999999999" } }, c.T3, "oi")
    expect((await processarWebhookGestao({ rawBody: outro.raw, assinatura: outro.assinatura, env: ENV, ingress })).body).toMatchObject({ persistidas: 0, ignoradas: 1 })
    expect(await owner.whatsAppGestaoInbox.count()).toBe(antes)
  })

  it("despesa pelo chat, correção antes da confirmação e confirmação antiga recusada; resultado pós-COMMIT", async () => {
    const c = await cenarioG007(), ler = leitor(c)
    await parear(c, c.U1, c.T1); ler(c.T1)
    await receber(c, c.T1, "gastei 250 no mercado no pix pelo nubank pessoal")
    await drenar(c)
    const resumo1 = ler(c.T1)
    expect(textos(resumo1)).toContain("Despesa de R$ 250,00")
    await receber(c, c.T1, "na verdade foi 300")
    await drenar(c)
    expect(textos(ler(c.T1))).toContain("R$ 300,00")
    // "sim" respondendo (reply) ao resumo ANTIGO: recusado, nada gravado.
    await receber(c, c.T1, "sim", { contexto: resumo1.at(-1)!.externalMessageId })
    await drenar(c)
    expect(textos(ler(c.T1))).toContain("versão anterior")
    expect((await dinheiro([c.P1])).ops).toHaveLength(0)
    await receber(c, c.T1, "sim")
    await drenar(c)
    const m = await dinheiro([c.P1, c.E1, c.E2])
    expect(m.ops).toHaveLength(1)
    expect(m.gastos).toHaveLength(1)
    expect(m.gastos[0]).toMatchObject({ perfilId: c.P1, storeId: null })
    expect(String(m.gastos[0].valorCentavos)).toBe("30000")
    expect(textos(ler(c.T1))).toContain("Registrado ✅ R$ 300,00") // pela outbox G006 (ENVIAR_RESULTADO)
    const job = await owner.gastoJob.findFirstOrThrow({ where: { tipo: "ENVIAR_RESULTADO", outbox: { operacaoId: m.ops[0].id } } })
    expect(job).toMatchObject({ estado: "CONCLUIDO", envioEstado: "ACEITO" })
  })

  it("PESSOAL × EMPRESA: pergunta o perfil, grava na loja escolhida; loja sem módulo finance é recusada", async () => {
    const c = await cenarioG007(), ler = leitor(c)
    await parear(c, c.U1, c.T1); ler(c.T1)
    await receber(c, c.T1, "gastei 120 de energia no pix")
    await drenar(c)
    const pergunta = textos(ler(c.T1))
    expect(pergunta).toContain("Em qual perfil")
    expect(pergunta).not.toContain("Loja Sem Financeiro") // listada? se listada, a autorização recusa abaixo
    const opcoes = pergunta.split("\n").filter(l => /^\d\)/.test(l))
    const n = opcoes.findIndex(l => l.includes("Loja Centro")) + 1
    expect(n).toBeGreaterThan(0)
    await receber(c, c.T1, String(n))
    await drenar(c)
    await receber(c, c.T1, "sim")
    await drenar(c)
    const m = await dinheiro([c.P1, c.E1, c.E2, c.E3])
    expect(m.gastos).toHaveLength(1)
    expect(m.gastos[0]).toMatchObject({ perfilId: c.E1, storeId: c.L1 })
    // Emissor G001 por principal: módulo finance ausente na loja → negado, sem sessão alguma.
    const verificar = async () => ({ userId: c.U1 })
    expect((await requireFinanceiroPerfilAccessPorPrincipal(verificar, { tipo: "EMPRESA", perfilId: c.E3, storeId: c.L3 }, "view")).ok).toBe(false)
    expect((await requireFinanceiroPerfilAccessPorPrincipal(verificar, { tipo: "EMPRESA", perfilId: c.E1, storeId: c.L1 }, "edit")).ok).toBe(true)
    expect((await requireFinanceiroPerfilAccessPorPrincipal(async () => null, { tipo: "PESSOAL", perfilId: c.P1 }, "view")).ok).toBe(false)
    expect((await requireFinanceiroPerfilAccess({ tipo: "PESSOAL", perfilId: c.P1 }, "view")).ok).toBe(false) // sem sessão web
  })

  it("isolamento entre usuários: U2 só vê e grava no próprio pessoal", async () => {
    const c = await cenarioG007(), ler = leitor(c)
    await parear(c, c.U1, c.T1); await parear(c, c.U2, c.T2); ler(c.T1); ler(c.T2)
    await receber(c, c.T1, "gastei 400 no mercado no pix pelo nubank pessoal"); await drenar(c)
    await receber(c, c.T1, "sim"); await drenar(c)
    await receber(c, c.T2, "quanto gastei este mês?"); await drenar(c)
    expect(textos(ler(c.T2))).toContain("Não encontrei gastos")
    await receber(c, c.T2, "gastei 400 no mercado no pix pelo nubank"); await drenar(c)
    expect(textos(ler(c.T2))).toContain("Não encontrei a conta “Nubank”") // conta de U1 é invisível a U2
    expect((await dinheiro([c.P2])).ops).toHaveLength(0)
    expect((await dinheiro([c.P1])).ops).toHaveLength(1)
  })

  it("pagamento parcial, quitação e transferência interna PESSOAL", async () => {
    const c = await cenarioG007(), ler = leitor(c)
    await parear(c, c.U1, c.T1); ler(c.T1)
    await receber(c, c.T1, "estou devendo 800 para o fornecedor, vence dia 10, pessoal"); await drenar(c)
    await receber(c, c.T1, "sim"); await drenar(c)
    let m = await dinheiro([c.P1])
    expect(m.titulos).toHaveLength(1)
    await receber(c, c.T1, "paguei 200 daquela dívida no pix pelo nubank"); await drenar(c)
    expect(textos(ler(c.T1))).toContain("Pagamento de R$ 200,00")
    await receber(c, c.T1, "sim"); await drenar(c)
    await receber(c, c.T1, "quitei aquela dívida no pix pelo nubank"); await drenar(c)
    expect(textos(ler(c.T1))).toContain("R$ 600,00")
    await receber(c, c.T1, "sim"); await drenar(c)
    m = await dinheiro([c.P1])
    expect(m.pagamentos).toHaveLength(2)
    expect(m.pagamentos.map(p => String(p.valorCentavos)).sort()).toEqual(["20000", "60000"])
    await receber(c, c.T1, "transferi 150 do nubank para a carteira"); await drenar(c)
    expect(textos(ler(c.T1))).toContain("De: Nubank → Para: Carteira")
    await receber(c, c.T1, "sim"); await drenar(c)
    m = await dinheiro([c.P1])
    const transf = m.ops.find(o => o.tipo === "TRANSFERENCIA_INTERNA")!
    expect(transf).toBeTruthy()
    expect(m.movimentos.filter(x => x.operacaoFinanceiraId === transf.id)).toHaveLength(2)
    expect(m.gastos).toHaveLength(1) // só a dívida original; transferência não é despesa
  })

  it("consultas: números iguais aos do G005 canônico", async () => {
    const c = await cenarioG007(), ler = leitor(c)
    await parear(c, c.U1, c.T1); ler(c.T1)
    await receber(c, c.T1, "gastei 99,90 de farmácia no débito pelo nubank pessoal"); await drenar(c)
    await receber(c, c.T1, "sim"); await drenar(c)
    await receber(c, c.T1, "quanto gastei este mês no pessoal?"); await drenar(c)
    const resposta = textos(ler(c.T1))
    const ctx = await requireFinanceiroPerfilAccessPorPrincipal(async () => ({ userId: c.U1 }), { tipo: "PESSOAL", perfilId: c.P1 }, "view")
    if (!ctx.ok) throw Error("ctx")
    const hoje = diaCivil(new Date())
    const dto = await consultarFinanceiro(ctx.contexto, filtroDoPlano(hoje.slice(0, 8) + "01", hoje))
    expect(resposta).toContain(formatarCentavos(dto.despesaRealizadaCentavos))
    expect(dto.despesaRealizadaCentavos).toBe("9990")
  })

  it("mensagem duplicada (reentrega Meta) e confirmações simultâneas: uma única escrita", async () => {
    const c = await cenarioG007(), ler = leitor(c)
    await parear(c, c.U1, c.T1); ler(c.T1)
    const w = await receber(c, c.T1, "gastei 70 no mercado no pix pelo nubank pessoal")
    await receber(c, c.T1, "gastei 70 no mercado no pix pelo nubank pessoal", { wamid: w }) // mesma wamid
    await drenar(c)
    expect(ler(c.T1)).toHaveLength(1)
    // Dois "sim" distintos processados em paralelo pelo worker (concorrência 2).
    await receber(c, c.T1, "sim"); await receber(c, c.T1, "confirmo")
    await drenar(c)
    expect((await dinheiro([c.P1])).ops).toHaveLength(1)
  })

  it("reinício do worker antes e depois do COMMIT G004: retomada sem duplicar", async () => {
    for (const momento of ["ANTES", "DEPOIS"] as const) {
      const c = await cenarioG007(), ler = leitor(c)
      await parear(c, c.U1, c.T1); ler(c.T1)
      await receber(c, c.T1, "gastei 55 no mercado no pix pelo nubank pessoal"); await drenar(c)
      await receber(c, c.T1, "sim")
      // Worker "morre": execução trava (antes ou depois do G004 real) e a lease não é renovada.
      let liberar!: () => void
      const travada = new Promise<void>(r => { liberar = r })
      const zumbi: PortaExecucao = { async executar(ctx, input) {
        if (momento === "DEPOIS") await execucaoG004.executar(ctx, input)
        await travada
        return execucaoG004.executar(ctx, input)
      } }
      const claim = (await claimJob(worker, "worker-morto", 3000))!
      expect(claim.tipo).toBe("STAGING")
      const morto = processadorStagingGestao({ execucao: zumbi })(worker, claim, new AbortController().signal).catch(() => "lease_perdida")
      await new Promise(r => setTimeout(r, 4000)) // lease vence
      await drenar(c) // novo worker reivindica (LEASE_RECUPERADA) e conclui
      expect((await dinheiro([c.P1])).ops).toHaveLength(1)
      liberar(); await morto // o zumbi continua e não grava de novo
      await drenar(c)
      expect((await dinheiro([c.P1])).ops).toHaveLength(1)
      const eventos = await owner.gastoJobEvento.findMany({ where: { jobId: claim.id } })
      expect(eventos.some(e => e.codigo === "LEASE_RECUPERADA")).toBe(true)
    }
  })

  it("recuperação após falhas: G004 incerto, reconciliação periódica e entrega incerta não reenviada", async () => {
    const c = await cenarioG007(), ler = leitor(c)
    await parear(c, c.U1, c.T1); ler(c.T1)
    await receber(c, c.T1, "gastei 44 no mercado no pix pelo nubank pessoal"); await drenar(c)
    // Falha incerta DEPOIS do COMMIT (resposta perdida): o motor guarda a mesma chave.
    let falhou = false
    const incerta: PortaExecucao = { async executar(ctx, input) {
      const r = await execucaoG004.executar(ctx, input)
      if (!falhou) { falhou = true; return { ok: false, tipo: "INCERTO", codigo: "rede" } }
      return r
    } }
    await receber(c, c.T1, "sim"); await drenar(c, { execucao: incerta })
    const primeira = textos(ler(c.T1))
    expect(primeira).toContain("NÃO será registrada duas vezes")
    // O COMMIT existiu: a outbox G006 já entrega o resultado, mesmo com a resposta do G004 perdida.
    expect(primeira).toContain("Registrado ✅")
    expect((await dinheiro([c.P1])).ops).toHaveLength(1)
    // Reconciliação periódica do worker (sem mensagem do usuário) com a MESMA chave.
    expect(await reconciliarConversasGestao(worker, { execucao: incerta }, 0)).toBe(1)
    await drenar(c)
    expect((await dinheiro([c.P1])).ops).toHaveLength(1)
    expect(textos(ler(c.T1))).not.toContain("Registrado ✅") // reconciliação não duplica a mensagem de resultado
    expect(await owner.gmAssistConversa.count({ where: { adminUserId: c.U1, estado: { path: ["rascunho", "estado"], equals: "INCERTO" } } })).toBe(0)
    // Entrega: 500 depois de cruzar a fronteira → INCERTA, não reenviada; 429 comprovado → retentada.
    c.sim.falharProxima({ tipo: "FALHA", falha: { tipo: "HTTP", status: 500 } })
    await receber(c, c.T1, "quanto gastei este mês no pessoal?"); await drenar(c)
    expect(ler(c.T1)).toHaveLength(0)
    expect(await owner.gmAssistResposta.count({ where: { destinatarioE164: c.T1, estado: "INCERTA" } })).toBe(1)
    c.sim.falharProxima({ tipo: "FALHA", falha: { tipo: "HTTP", status: 429, rejeicaoComprovada: true, retryAfterMs: 0 } })
    await receber(c, c.T1, "qual meu saldo?"); await drenar(c)
    await new Promise(r => setTimeout(r, 1200)); await drenar(c)
    expect(textos(ler(c.T1))).toContain("Saldo")
    const enviada = await owner.gmAssistResposta.findFirstOrThrow({ where: { destinatarioE164: c.T1, estado: "ENVIADA" }, orderBy: { criadoEm: "desc" } })
    expect(enviada.texto).toBeNull() // minimização após entrega
  })

  it("revogação: congela a conversa, recusa novas mensagens e não envia resultado pendente", async () => {
    const c = await cenarioG007(), ler = leitor(c)
    await parear(c, c.U1, c.T1); ler(c.T1)
    await receber(c, c.T1, "gastei 33 no mercado no pix pelo nubank pessoal"); await drenar(c)
    await revogarVinculo(owner, { userId: c.U1, motivo: "USUARIO" })
    await receber(c, c.T1, "sim"); await drenar(c)
    expect(textos(ler(c.T1))).toContain("vincule este WhatsApp")
    expect((await dinheiro([c.P1])).ops).toHaveLength(0)
    const conversa = await owner.gmAssistConversa.findFirstOrThrow({ where: { adminUserId: c.U1 } })
    await expect(owner.gmAssistConversa.update({ where: { chave: conversa.chave }, data: { versaoEstado: conversa.versaoEstado + 1 } })).rejects.toThrow()
    // Novo pareamento = nova conversa: o rascunho antigo nunca é retomado.
    await parear(c, c.U1, c.T1); ler(c.T1)
    await receber(c, c.T1, "sim"); await drenar(c)
    expect(textos(ler(c.T1))).toContain("Não há nenhuma operação aguardando confirmação")
    // Resultado já COMMITado e revogação antes do envio: job G006 estaciona, nada sai.
    await receber(c, c.T1, "gastei 22 no mercado no pix pelo nubank pessoal"); await drenar(c)
    await receber(c, c.T1, "sim")
    const claim = (await claimJob(worker, "so-staging", 30_000, false))!
    await processadorStagingGestao()(worker, claim, new AbortController().signal)
    await revogarVinculo(owner, { userId: c.U1, motivo: "SEGURANCA" })
    ler(c.T1)
    await drenar(c)
    expect(textos(ler(c.T1))).not.toContain("Registrado")
    const op = (await dinheiro([c.P1])).ops.at(-1)!
    const job = await owner.gastoJob.findFirstOrThrow({ where: { tipo: "ENVIAR_RESULTADO", outbox: { operacaoId: op.id } } })
    expect(job.estado).toBe("ESTACIONADO")
    expect(job.falhaCodigo).toBe("VINCULO_AUSENTE")
  })
})

export type { CenarioG007 }
