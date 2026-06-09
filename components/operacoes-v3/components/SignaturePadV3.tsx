"use client";

// ============================================================================
// Operações V3 — SPRINT_3E.2 · Captura de assinatura (canvas → PNG base64)
// ----------------------------------------------------------------------------
// Pad simples (pointer/touch) reutilizado pela Prova de Entrada (assinatura do
// cliente) e pela Entrega (assinatura de retirada). Sem libs externas.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { Eraser, Loader2, PenLine } from "lucide-react";
import { ButtonV3 } from "./UiV3";

export function SignaturePadV3({
  onSave,
  salvando = false,
  height = 150,
  label = "Salvar assinatura",
  hint,
}: {
  onSave: (dataUrl: string) => void | Promise<void>;
  salvando?: boolean;
  height?: number;
  label?: string;
  hint?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [temTraco, setTemTraco] = useState(false);

  const setup = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth || 300;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111827";
    ctxRef.current = ctx;
  }, [height]);

  useEffect(() => {
    setup();
    const onResize = () => setup();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [setup]);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = pos(e);
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !ctxRef.current || !last.current) return;
    const p = pos(e);
    const ctx = ctxRef.current;
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    if (!temTraco) setTemTraco(true);
  };
  const onUp = () => {
    drawing.current = false;
    last.current = null;
  };
  const limpar = () => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setTemTraco(false);
  };
  const salvar = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !temTraco) return;
    await onSave(canvas.toDataURL("image/png"));
  };

  return (
    <div className="rounded-lg border border-border bg-background p-2">
      <canvas
        ref={canvasRef}
        style={{ height, touchAction: "none" }}
        className="w-full cursor-crosshair rounded-md border border-dashed border-border bg-card"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">{hint ?? "Assine no quadro acima."}</span>
        <div className="flex items-center gap-1.5">
          <ButtonV3 variant="ghost" onClick={limpar} disabled={salvando || !temTraco}>
            <Eraser className="h-4 w-4" /> Limpar
          </ButtonV3>
          <ButtonV3 variant="primary" onClick={salvar} disabled={salvando || !temTraco}>
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />}
            {label}
          </ButtonV3>
        </div>
      </div>
    </div>
  );
}
