/** Bancada CLI isolada. Todo dado e todo transporte deste arquivo são SIMULADOS. */
import { ScaleConnection, transportForStream } from "../../services/pesagem"
import { encode, fixture, flush, frame, simulatedStream } from "./helpers"

function show(label: string, f: ReturnType<typeof fixture>): void {
  console.log(JSON.stringify({ source: "SIMULADO_SEM_EQUIPAMENTO", step: label, ...f.session.snapshot() }))
}

async function scenario(name: string): Promise<void> {
  const f = fixture("simulated-" + name)
  const source = simulatedStream()
  const connection = new ScaleConnection(f.session, transportForStream(source.stream, source.close), name === "timeout" ? 30 : 5000)
  const done = connection.run()
  const send = async (text: string) => { source.send(text); await flush() }
  try {
    show("conexão", f)
    if (name === "stability") {
      for (const value of ["0.300", "0.350", "0.350", "0.350", "0.350"]) {
        await send(frame(value))
        show("oscilação / estimação", f)
        f.advance(150)
      }
      f.advance(1000)
      show("ausência de dados novos: peso vencido", f)
    } else if (name === "fragmented") {
      await send("SIM|ST|NET|350|"); show("mensagem fragmentada", f)
      await send("g\n" + frame("0.351", "ST")); show("fragmento completo e outra mensagem no mesmo pacote", f)
    } else if (name === "invalid") {
      for (const text of [frame("0.350", "ST"), "inválido\n", frame("350", "ST", "NET", "lb"),
        frame("-350", "ST", "NET", "g"), "SIM|OL\n", "SIM|ERR|E01\n", frame("350", "ST", "GROSS", "g")]) {
        await send(text); show("mensagem e estado", f)
      }
    } else if (name === "previous-session") {
      const rejection = f.session.receive({ sessionId: "simulated-old-session", packetSequence: 1, bytes: encode(frame("9", "ST")) })
      console.log(JSON.stringify({ source: "SIMULADO_SEM_EQUIPAMENTO", rejection: rejection.rejection }))
      show("sessão anterior rejeitada", f)
    } else {
      await send(frame("350", "ST", "NET", "g")); show("350 g = 0.350 kg", f)
      if (name === "disconnect") { source.disconnect(); await done }
      else if (name === "cancel") await connection.stop()
      else if (name === "context") await connection.stop("context_changed")
      else if (name === "timeout") await done
    }
  } finally {
    await connection.stop()
    await done
    show("encerramento", f)
    console.log(JSON.stringify({ source: "SIMULADO_SEM_EQUIPAMENTO", resources: source.stats() }))
  }
  if (name === "disconnect") {
    const fresh = fixture("simulated-reconnection")
    const stream = simulatedStream()
    const next = new ScaleConnection(fresh.session, transportForStream(stream.stream, stream.close), 5000)
    const finished = next.run()
    try {
      show("reconexão sem herdar peso", fresh)
      stream.send(frame("0.450", "ST")); await flush()
      show("reconexão com amostra nova", fresh)
    } finally { await next.stop(); await finished }
  }
}

async function main(): Promise<void> {
  const names = ["stability", "fragmented", "invalid", "previous-session", "disconnect", "cancel", "context", "timeout"]
  const selected = process.argv[2] ?? "all"
  if (selected !== "all" && !names.includes(selected)) {
    throw new Error("Cenário desconhecido. Use all ou " + names.join(", "))
  }
  console.log("BANCADA SIMULADA — sem banco, sem porta serial e sem venda produtiva")
  for (const name of selected === "all" ? names : [selected]) await scenario(name)
}
void main().catch((error: unknown) => { console.error(error); process.exitCode = 1 })
