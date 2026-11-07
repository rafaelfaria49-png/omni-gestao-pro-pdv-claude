"use client"

import { useEffect, useId, useRef, useState } from "react"
import { Scale } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useStoreSettings } from "@/lib/store-settings-provider"
import { isWebSerialSupported } from "@/services/hardware-bridge"
import {
  EMPTY_SCALE_SNAPSHOT, ReadonlyScaleSession, SCALE_BAUD_RATES, SCALE_PROFILE,
  type ScaleSnapshot, type ScaleStatus,
} from "@/services/scale-readonly"

const STATUS: Record<ScaleStatus, string> = {
  disconnected: "Desconectada",
  connecting: "Conectando",
  disconnecting: "Desconectando",
  waiting: "Conectada, aguardando leitura",
  unstable: "Peso instável",
  stable: "Peso estável",
  stale: "Leitura desatualizada",
  error: "Erro de comunicação",
}

/** Sem callbacks transacionais: nenhuma leitura pode alimentar o carrinho. */
export function PdvScaleVisor() {
  const id = useId()
  const session = useRef<ReadonlyScaleSession | null>(null)
  const [snapshot, setSnapshot] = useState<ScaleSnapshot>(EMPTY_SCALE_SNAPSHOT)
  const [supported, setSupported] = useState(false)
  const [profile, setProfile] = useState("")
  const [baudRate, setBaudRate] = useState(2400)

  useEffect(() => {
    setSupported(isWebSerialSupported())
    const observer = new ReadonlyScaleSession()
    session.current = observer
    const unsubscribe = observer.subscribe(setSnapshot)
    const leave = () => { void observer.disconnect() }
    window.addEventListener("pagehide", leave)
    return () => {
      window.removeEventListener("pagehide", leave)
      unsubscribe()
      session.current = null
      void observer.disconnect()
    }
  }, [])

  const busy = snapshot.status === "connecting" || snapshot.status === "disconnecting"
  const connected = ["waiting", "stable", "unstable", "stale"].includes(snapshot.status)
  const sample = snapshot.sample
  return (
    <section
      aria-label="Visor de peso"
      data-testid="pdv-scale-visor"
      className="min-w-0 rounded-xl border border-border bg-muted/20 p-3"
      // Enter/Espaço dos controles de hardware não chegam aos atalhos de venda.
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") event.stopPropagation() }}
    >
      <div className="flex items-center gap-2 text-muted-foreground">
        <Scale className="h-4 w-4 shrink-0" aria-hidden="true" />
        <h3 className="text-[11px] font-semibold uppercase tracking-wider">Peso da balança</h3>
      </div>
      <output aria-label="Peso recebido da balança" aria-live="off" className="mt-2 block break-words text-2xl font-semibold tabular-nums tracking-tight text-foreground">
        {sample ? sample.kg.toLocaleString("pt-BR", {
          minimumFractionDigits: sample.decimalPlaces, maximumFractionDigits: sample.decimalPlaces,
        }) : "—"}{" "}<span className="text-sm font-medium text-muted-foreground">kg</span>
      </output>
      <p role="status" aria-label="Estado da balança" className="mt-1 text-xs font-medium text-foreground">{STATUS[snapshot.status]}</p>
      {connected && <p className="mt-1 text-[11px] text-muted-foreground">Conexão ativa neste terminal</p>}
      {!supported && <p className="mt-2 text-xs text-muted-foreground">Navegador sem Web Serial. Use Chrome ou Edge em HTTPS ou localhost.</p>}
      {snapshot.message && <p role={snapshot.status === "error" ? "alert" : undefined} className="mt-2 text-xs text-muted-foreground">{snapshot.message}</p>}
      {!connected && snapshot.status !== "connecting" && (
        <div className="mt-3 grid min-w-0 gap-2">
          <label htmlFor={`${id}-profile`} className="text-xs text-muted-foreground">Protocolo da balança</label>
          <select id={`${id}-profile`} value={profile} onChange={(event) => setProfile(event.target.value)} disabled={busy || !supported}
            className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <option value="">Selecione o protocolo</option>
            <option value={SCALE_PROFILE}>A&amp;D HV-G/HW-G · Format 1</option>
          </select>
          <label htmlFor={`${id}-baud`} className="text-xs text-muted-foreground">Velocidade serial</label>
          <select id={`${id}-baud`} value={baudRate} onChange={(event) => setBaudRate(Number(event.target.value))} disabled={busy || !supported}
            className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {SCALE_BAUD_RATES.map((rate) => <option key={rate} value={rate}>{rate} baud</option>)}
          </select>
          <p className="text-[11px] leading-relaxed text-muted-foreground">Configure saída contínua em kg no equipamento. Toledo Prix 3 Fit: homologação pendente.</p>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {connected || snapshot.status === "connecting" ? (
          <Button type="button" variant="outline" className="min-h-10 text-xs" onClick={() => void session.current?.disconnect()}>Desconectar</Button>
        ) : (
          <Button type="button" variant="outline" className="min-h-10 text-xs" disabled={!supported || busy || profile !== SCALE_PROFILE}
            onClick={() => void session.current?.connect(profile, baudRate)}>Conectar balança</Button>
        )}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">Somente informativo. Não altera a venda.</p>
    </section>
  )
}

/** A chave elimina imediatamente amostra, seletor e sessão da unidade anterior. */
export function PdvStoreScaleVisor({ storeId }: { storeId?: string }) {
  const settings = useStoreSettings()
  if (!storeId || settings.storeId !== storeId || !settings.loaded || !settings.pdvScaleVisorVisible) return null
  return <PdvScaleVisor key={storeId} />
}
