"use client";

// ============================================================================
// Operações V3 — SPRINT_3E.1 · PROVA DE ENTRADA (bloco do Workspace)
// ----------------------------------------------------------------------------
// Documenta o aparelho na entrada: estado físico estruturado, mapa de avarias
// (texto), fotos (upload real comprimido), credenciais e acessórios recebidos.
// Persistência via `prova-entrada-actions` (payload). Sem estoque/financeiro.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, ClipboardCheck, KeyRound, Loader2, Plus, Save, ShieldAlert, Trash2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OrdemServico } from "@/types/os";
import {
  ACESSORIOS_ENTRADA_V3,
  CATEGORIAS_FOTO_V3,
  COMPONENTES_FISICOS_V3,
  ESTADO_FISICO_STATUS_META_V3,
  FOTO_MAX_V3,
  TIPOS_AVARIA_V3,
  componenteFisicoLabelV3,
  lerProvaEntradaV3,
  resumoEstadoFisicoV3,
  tipoAvariaLabelV3,
  type AcessorioEntradaV3,
  type AvariaV3,
  type CategoriaFotoV3,
  type CredenciaisEntradaV3,
  type EstadoFisicoItemV3,
  type EstadoFisicoStatusV3,
  type TipoAvariaV3,
} from "@/lib/operacoes-v3/prova-entrada-model";
import { useProvaEntradaV3 } from "../hooks/use-prova-entrada-v3";
import { ButtonV3 } from "./UiV3";

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

const STATUS_CLS: Record<EstadoFisicoStatusV3, string> = {
  ok: "border-success/40 bg-success/10 text-success",
  avariado: "border-destructive/40 bg-destructive/10 text-destructive",
  ausente: "border-warning/40 bg-warning/10 text-warning",
};
const STATUS_ORDER: EstadoFisicoStatusV3[] = ["ok", "avariado", "ausente"];

function uid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `av_${Date.now()}_${Math.random()}`;
}

/** Reduz a imagem no cliente (lado máx. 1024px, JPEG ~0.6) antes de enviar. */
async function comprimirImagemV3(file: File, maxLado = 1024, quality = 0.6): Promise<string> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error("Falha ao ler a imagem."));
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("Imagem inválida."));
    i.src = dataUrl;
  });
  const scale = Math.min(1, maxLado / Math.max(img.width || 1, img.height || 1));
  const w = Math.max(1, Math.round((img.width || 1) * scale));
  const h = Math.max(1, Math.round((img.height || 1) * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}

export function ProvaEntradaV3({
  os,
  storeId,
  onChanged,
  notificar,
}: {
  os: OrdemServico;
  storeId: string | null;
  onChanged: () => void;
  notificar: (msg: string) => void;
}) {
  const prova = useMemo(() => lerProvaEntradaV3(os), [os]);
  const { pending, error, salvarProva, salvarAcessorios, adicionarFoto, removerFoto } = useProvaEntradaV3(storeId, os.id, onChanged);

  // --- estado editável (estado físico + avarias + credenciais) ---
  const [estado, setEstado] = useState<EstadoFisicoItemV3[]>(prova.estadoFisico);
  const [avarias, setAvarias] = useState<AvariaV3[]>(prova.avarias);
  const [cred, setCred] = useState<CredenciaisEntradaV3>(prova.credenciais);
  const [acessorios, setAcessorios] = useState<AcessorioEntradaV3[]>(prova.acessorios);
  const [dirty, setDirty] = useState(false);
  const [acDirty, setAcDirty] = useState(false);

  // nova avaria (form)
  const [avTipo, setAvTipo] = useState<TipoAvariaV3>("risco");
  const [avLocal, setAvLocal] = useState("");
  const [avDesc, setAvDesc] = useState("");

  // foto
  const [fotoCategoria, setFotoCategoria] = useState<CategoriaFotoV3>("frontal");
  const fileRef = useRef<HTMLInputElement>(null);
  const [comprimindo, setComprimindo] = useState(false);

  const editKey = `${os.id}:${os.atualizadoEm ?? ""}`;
  useEffect(() => {
    setEstado(prova.estadoFisico);
    setAvarias(prova.avarias);
    setCred(prova.credenciais);
    setAcessorios(prova.acessorios);
    setDirty(false);
    setAcDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editKey]);

  const resumo = resumoEstadoFisicoV3(estado);

  const setStatus = (componente: string, status: EstadoFisicoStatusV3) => {
    setEstado((rows) => rows.map((r) => (r.componente === componente ? { ...r, status } : r)));
    setDirty(true);
  };
  const addAvaria = () => {
    if (!avLocal.trim()) {
      notificar("Informe onde está a avaria.");
      return;
    }
    setAvarias((r) => [...r, { id: uid(), tipo: avTipo, local: avLocal.trim(), descricao: avDesc.trim() || undefined }]);
    setAvLocal("");
    setAvDesc("");
    setDirty(true);
  };
  const removeAvaria = (id: string) => {
    setAvarias((r) => r.filter((a) => a.id !== id));
    setDirty(true);
  };
  const mutCred = (patch: Partial<CredenciaisEntradaV3>) => {
    setCred((c) => ({ ...c, ...patch }));
    setDirty(true);
  };
  const toggleAcessorio = (id: string) => {
    setAcessorios((r) => r.map((a) => (a.id === id ? { ...a, presente: !a.presente } : a)));
    setAcDirty(true);
  };

  const onSalvar = async () => {
    const ok = await salvarProva({ estadoFisico: estado, avarias, credenciais: cred });
    if (ok) {
      setDirty(false);
      notificar("Prova de entrada salva.");
    } else if (error) notificar(error);
  };
  const onSalvarAcessorios = async () => {
    const ok = await salvarAcessorios(acessorios);
    if (ok) {
      setAcDirty(false);
      notificar("Acessórios registrados.");
    } else if (error) notificar(error);
  };
  const onUpload = async (file: File | null | undefined) => {
    if (!file) return;
    if (prova.fotos.length >= FOTO_MAX_V3) {
      notificar(`Limite de ${FOTO_MAX_V3} fotos atingido.`);
      return;
    }
    setComprimindo(true);
    try {
      const dataUrl = await comprimirImagemV3(file);
      const ok = await adicionarFoto({ categoria: fotoCategoria, nome: file.name, dataUrl });
      if (ok) notificar("Foto adicionada.");
      else if (error) notificar(error);
    } catch (e) {
      notificar(e instanceof Error ? e.message : "Falha ao processar a imagem.");
    } finally {
      setComprimindo(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  const onRemoverFoto = async (id: string) => {
    const ok = await removerFoto(id);
    if (ok) notificar("Foto removida.");
  };

  const busy = pending !== null || comprimindo;

  return (
    <section id="prova-entrada" className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ClipboardCheck className="h-4 w-4" aria-hidden />
          </span>
          <h3 className="truncate text-sm font-semibold text-foreground">Prova de entrada</h3>
        </div>
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {resumo.avariado > 0 ? <span className="text-destructive">{resumo.avariado} avariado(s)</span> : null}
          {resumo.ausente > 0 ? <span className="text-warning">{resumo.ausente} ausente(s)</span> : null}
          {avarias.length > 0 ? <span>· {avarias.length} avaria(s)</span> : null}
          {prova.fotos.length > 0 ? <span>· {prova.fotos.length} foto(s)</span> : null}
        </span>
      </div>

      <div className="space-y-5 px-4 py-4">
        {/* 1. Estado físico estruturado */}
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Estado físico</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {estado.map((it) => (
              <div key={it.componente} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-1.5">
                <span className="min-w-0 truncate text-sm text-foreground">{componenteFisicoLabelV3(it.componente)}</span>
                <div className="flex shrink-0 items-center gap-1">
                  {STATUS_ORDER.map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setStatus(it.componente, st)}
                      className={cn(
                        "rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
                        it.status === st ? STATUS_CLS[st] : "border-border bg-card text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {ESTADO_FISICO_STATUS_META_V3[st].label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 2. Mapa de avarias (texto) */}
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <ShieldAlert className="h-3.5 w-3.5" aria-hidden /> Avarias
          </p>
          {avarias.length > 0 ? (
            <ul className="mb-2 space-y-1.5">
              {avarias.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-1.5">
                  <span className="min-w-0 text-sm text-foreground">
                    <strong>{tipoAvariaLabelV3(a.tipo)}</strong> · {a.local}
                    {a.descricao ? <span className="text-muted-foreground"> — {a.descricao}</span> : null}
                  </span>
                  <button type="button" onClick={() => removeAvaria(a.id)} className="shrink-0 text-muted-foreground hover:text-destructive" aria-label="Remover avaria">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-2 text-xs text-muted-foreground">Nenhuma avaria registrada.</p>
          )}
          <div className="grid gap-2 sm:grid-cols-[140px_1fr_auto]">
            <select className={inputCls} value={avTipo} onChange={(e) => setAvTipo(e.target.value as TipoAvariaV3)}>
              {TIPOS_AVARIA_V3.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
            <input className={inputCls} value={avLocal} onChange={(e) => setAvLocal(e.target.value)} placeholder="Onde? (ex.: canto inferior direito)" maxLength={80} />
            <ButtonV3 variant="outline" onClick={addAvaria}>
              <Plus className="h-4 w-4" /> Avaria
            </ButtonV3>
          </div>
          <input className={cn(inputCls, "mt-2")} value={avDesc} onChange={(e) => setAvDesc(e.target.value)} placeholder="Descrição (opcional)" maxLength={160} />
        </div>

        {/* 4. Credenciais */}
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <KeyRound className="h-3.5 w-3.5" aria-hidden /> Credenciais
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[11px] text-muted-foreground">PIN</span>
              <input className={inputCls} value={cred.pin ?? ""} onChange={(e) => mutCred({ pin: e.target.value })} placeholder="Ex.: 0000" maxLength={20} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] text-muted-foreground">Senha / desenho</span>
              <input className={inputCls} value={cred.senha ?? ""} onChange={(e) => mutCred({ senha: e.target.value })} placeholder="Senha de desbloqueio" maxLength={60} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] text-muted-foreground">Conta Google</span>
              <input className={inputCls} value={cred.contaGoogle ?? ""} onChange={(e) => mutCred({ contaGoogle: e.target.value })} placeholder="email@gmail.com" maxLength={120} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] text-muted-foreground">Conta Apple / iCloud</span>
              <input className={inputCls} value={cred.contaApple ?? ""} onChange={(e) => mutCred({ contaApple: e.target.value })} placeholder="email@icloud.com" maxLength={120} />
            </label>
          </div>
          <div className="mt-2 flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input type="checkbox" className="accent-primary" checked={cred.faceId === true} onChange={(e) => mutCred({ faceId: e.target.checked })} />
              Face ID
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input type="checkbox" className="accent-primary" checked={cred.biometria === true} onChange={(e) => mutCred({ biometria: e.target.checked })} />
              Biometria (digital)
            </label>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">As credenciais são <strong>mascaradas</strong> na OS impressa entregue ao cliente.</p>
        </div>

        {/* Salvar (estado físico + avarias + credenciais) */}
        <div className="flex flex-wrap items-center gap-2">
          <ButtonV3 variant="primary" disabled={busy || !dirty} onClick={onSalvar}>
            {pending === "prova" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar prova de entrada
          </ButtonV3>
          {dirty ? (
            <ButtonV3 variant="ghost" disabled={busy} onClick={() => { setEstado(prova.estadoFisico); setAvarias(prova.avarias); setCred(prova.credenciais); setDirty(false); }}>
              Descartar
            </ButtonV3>
          ) : null}
        </div>

        {/* 3. Fotos */}
        <div className="border-t border-border pt-4">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Camera className="h-3.5 w-3.5" aria-hidden /> Fotos da entrada ({prova.fotos.length}/{FOTO_MAX_V3})
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select className={cn(inputCls, "max-w-[160px]")} value={fotoCategoria} onChange={(e) => setFotoCategoria(e.target.value as CategoriaFotoV3)}>
              {CATEGORIAS_FOTO_V3.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onUpload(e.target.files?.[0])} />
            <ButtonV3 variant="outline" disabled={busy || prova.fotos.length >= FOTO_MAX_V3} onClick={() => fileRef.current?.click()}>
              {comprimindo || pending === "foto" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Adicionar foto
            </ButtonV3>
          </div>
          {prova.fotos.length > 0 ? (
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {prova.fotos.map((f) => (
                <div key={f.id} className="group relative overflow-hidden rounded-lg border border-border bg-muted/30">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.dataUrl} alt={f.nome ?? f.categoria} className="aspect-square w-full object-cover" />
                  <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                    {CATEGORIAS_FOTO_V3.find((c) => c.id === f.categoria)?.label ?? f.categoria}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemoverFoto(f.id)}
                    disabled={busy}
                    className="absolute right-1 top-1 rounded bg-black/60 p-1 text-white opacity-0 transition-opacity hover:bg-destructive group-hover:opacity-100"
                    aria-label="Remover foto"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">Sem fotos. As imagens são reduzidas automaticamente antes de salvar.</p>
          )}
        </div>

        {/* 5. Acessórios recebidos */}
        <div className="border-t border-border pt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Acessórios recebidos</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {acessorios.map((a) => {
              const label = ACESSORIOS_ENTRADA_V3.find((x) => x.id === a.id)?.label ?? a.id;
              return (
                <label key={a.id} className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground">
                  <input type="checkbox" className="accent-primary" checked={a.presente} onChange={() => toggleAcessorio(a.id)} />
                  {label}
                </label>
              );
            })}
          </div>
          <div className="mt-2">
            <ButtonV3 variant="outline" disabled={busy || !acDirty} onClick={onSalvarAcessorios}>
              {pending === "acessorios" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar acessórios
            </ButtonV3>
          </div>
        </div>

        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>
    </section>
  );
}
