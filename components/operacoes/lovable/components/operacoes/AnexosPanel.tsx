import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Download, FileText, HardDrive, ImageIcon, Lock, Music, Receipt, Upload, Video, X } from "lucide-react";
import type { Anexo, OrdemServico } from "@/types/os";
import { useOS } from "@/store/osStore";
import { Button } from "@/components/ui/button";
import { dt } from "@/lib/os/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { categoriaFromTipo, buildLocalIdbUrl, toCanonicalFromPayload, toPayloadFromCanonical } from "@/components/operacoes/lovable/services/anexos/helpers";
import { putLocalBlob, deleteLocalBlob, getLocalBlob } from "@/components/operacoes/lovable/services/anexos/storage";
import { resolvePreviewUrl, revokePreviewUrlFor, gcPreviewCache, isLocalIdbUrl, localIdbKeyFromUrl } from "@/components/operacoes/lovable/services/anexos/preview";

const TIPO_LABEL: Record<Anexo["tipo"], string> = {
  foto_antes: "Foto aparelho",
  foto_depois: "Foto depois",
  foto_defeito: "Foto defeito",
  video: "Vídeo",
  audio: "Áudio",
  laudo: "Laudo PDF",
  nota: "Nota fiscal",
  comprovante: "Comprovante",
  documento_tecnico: "Doc. técnico",
  outro: "Outro",
};

const BOTOES: { tipo: Anexo["tipo"]; label: string; icon: typeof Camera; accept: string }[] = [
  { tipo: "foto_antes", label: "Foto aparelho", icon: Camera, accept: "image/*" },
  { tipo: "foto_defeito", label: "Foto defeito", icon: Camera, accept: "image/*" },
  { tipo: "foto_depois", label: "Foto depois", icon: Camera, accept: "image/*" },
  { tipo: "video", label: "Vídeo", icon: Video, accept: "video/*" },
  { tipo: "audio", label: "Áudio", icon: Music, accept: "audio/*" },
  { tipo: "laudo", label: "Laudo PDF", icon: FileText, accept: "application/pdf" },
  { tipo: "comprovante", label: "Comprovante", icon: Receipt, accept: "application/pdf,image/*" },
  { tipo: "documento_tecnico", label: "Doc. técnico", icon: FileText, accept: "application/pdf" },
  { tipo: "nota", label: "Nota fiscal", icon: Receipt, accept: "application/pdf,image/*" },
  { tipo: "outro", label: "Outro", icon: Upload, accept: "*" },
];

export function AnexosPanel({ os }: { os: OrdemServico }) {
  const { addAnexo, removeAnexo } = useOS();
  const inputRef = useRef<HTMLInputElement>(null);
  const tipoRef = useRef<Anexo["tipo"]>("outro");
  const [uploading, setUploading] = useState(false);
  const [previewById, setPreviewById] = useState<Record<string, string | null>>({});

  const anexosCanon = useMemo(() => os.anexos.map(toCanonicalFromPayload), [os.anexos]);

  const trigger = (tipo: Anexo["tipo"], accept: string) => {
    tipoRef.current = tipo;
    if (inputRef.current) {
      inputRef.current.accept = accept;
      inputRef.current.multiple = true;
      inputRef.current.click();
    }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setUploading(true);
    try {
      for (const f of files) {
        const id = `an_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        await putLocalBlob(id, f, f.type);
        const canonical = {
          id,
          nome: f.name,
          tipo: tipoRef.current,
          mimeType: f.type,
          tamanho: f.size,
          createdAt: new Date().toISOString(),
          enviadoPor: "Você",
          origem: "operacoes-hub" as const,
          categoria: categoriaFromTipo(tipoRef.current),
          url: buildLocalIdbUrl(id),
          storageProvider: "local-idb" as const,
          persisted: true,
          publico: tipoRef.current === "foto_antes" || tipoRef.current === "foto_depois",
        };
        addAnexo(os.id, toPayloadFromCanonical(canonical));
      }
      toast.success(`${files.length} anexo(s) — arquivo neste navegador; metadados na OS`);
    } catch (err) {
      toast.error("Falha ao salvar anexo localmente");
      // best-effort cleanup: nada a fazer sem rastrear ids parciais
      console.error(err);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Resolve previews para itens locais e faz GC periódico.
      gcPreviewCache();
      const next: Record<string, string | null> = {};
      for (const a of anexosCanon) {
        // Legacy blob: mantemos a.url (mas marcamos como não persistido na UI)
        if (a.storageProvider === "legacy-blob") {
          next[a.id] = a.url;
          continue;
        }
        const url = await resolvePreviewUrl(a);
        next[a.id] = url;
      }
      if (!cancelled) setPreviewById(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [anexosCanon]);

  const handleRemove = async (a: CanonicalAnexoLike) => {
    // remove do payload (persistência real via server action)
    removeAnexo(os.id, a.id);
    // remove blob local (se existir)
    if (a.storageProvider === "local-idb") {
      try {
        await deleteLocalBlob(a.id);
      } catch {
        // best-effort
      }
      revokePreviewUrlFor(a.url);
    }
    toast.success("Anexo removido");
  };

  const handleDownload = async (a: CanonicalAnexoLike, preview: string | null) => {
    try {
      if (a.storageProvider === "local-idb" && isLocalIdbUrl(a.url)) {
        const key = localIdbKeyFromUrl(a.url);
        const blob = await getLocalBlob(key);
        if (!blob) {
          toast.error("Arquivo não encontrado no armazenamento local");
          return;
        }
        const u = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = u;
        link.download = a.nome || "anexo";
        link.click();
        URL.revokeObjectURL(u);
        toast.success("Download iniciado");
        return;
      }
      const openUrl = preview && preview.length > 0 ? preview : a.url;
      if (openUrl) window.open(openUrl, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("Falha ao baixar anexo");
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border p-4">
        <div className="flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Anexos & evidências</span>
        </div>
        <span className="text-[11px] text-muted-foreground">{os.anexos.length} arquivos</span>
      </div>

      <div
        role="note"
        className="mx-4 mt-4 flex gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground"
      >
        <HardDrive className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <p>
          Os <span className="font-medium text-foreground">arquivos ficam neste navegador</span> (IndexedDB).
          Metadados da lista são salvos na OS no servidor; trocar de dispositivo ou limpar dados do browser pode
          perder os arquivos.
        </p>
      </div>

      <input ref={inputRef} type="file" hidden onChange={onFile} />

      <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3">
        {BOTOES.map((b) => (
          <Button
            key={b.tipo}
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => trigger(b.tipo, b.accept)}
            disabled={uploading}
          >
            <b.icon className="h-4 w-4" /> {b.label}
          </Button>
        ))}
      </div>

      {os.anexos.length === 0 ? (
        <div className="border-t border-border p-6 text-center text-xs text-muted-foreground">
          <Upload className="mx-auto mb-2 h-5 w-5" />
          Nenhum anexo ainda
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 border-t border-border p-3 sm:grid-cols-3">
          {anexosCanon.map((a) => {
            const preview = previewById[a.id] ?? null;
            const href = preview ?? a.url;
            const isLocalFile = a.storageProvider === "local-idb" || a.storageProvider === "legacy-blob";
            const storageLabel = isLocalFile ? "Arquivo local" : "Metadados na OS";
            return (
            <a
              key={a.id}
              href={href}
              target="_blank"
              rel="noreferrer"
              className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted"
            >
              {a.mimeType?.startsWith("image/") && preview ? (
                <img src={preview} alt={a.nome} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
              ) : (
                <div className="flex h-full items-center justify-center p-2 text-center text-[10px] text-muted-foreground">
                  <FileText className="mr-1 h-4 w-4" /> {a.nome}
                </div>
              )}
              <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-1 p-1.5">
                <span className={cn(
                  "rounded-full border px-1.5 py-0.5 text-[9px] font-medium backdrop-blur",
                  a.publico
                    ? "border-emerald-500/40 bg-emerald-500/20 text-emerald-100"
                    : "border-amber-500/40 bg-amber-500/20 text-amber-100",
                )}>
                  {a.publico ? "Público" : <><Lock className="inline h-2.5 w-2.5" /> Privado</>}
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={(ev) => {
                      ev.preventDefault();
                      ev.stopPropagation();
                      void handleDownload(a, preview);
                    }}
                    className="rounded-md border border-border bg-background/40 p-1 text-muted-foreground opacity-0 backdrop-blur transition-opacity group-hover:opacity-100"
                    title="Baixar / abrir"
                  >
                    <Download className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={(ev) => {
                      ev.preventDefault();
                      ev.stopPropagation();
                      void handleRemove(a);
                    }}
                    className="rounded-md border border-border bg-background/40 p-1 text-muted-foreground opacity-0 backdrop-blur transition-opacity group-hover:opacity-100"
                    title="Remover anexo"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1.5">
                <div className="text-[10px] font-medium text-white">{TIPO_LABEL[a.tipo]}</div>
                <div className="text-[9px] text-white/70">{dt(a.createdAt)}</div>
                <div className="mt-0.5 text-[9px] text-white/70">
                  {a.categoria} · {a.tamanho ? `${Math.round(a.tamanho / 1024)} KB` : "—"} · {storageLabel}
                </div>
              </div>
            </a>
          )})}
        </div>
      )}
    </div>
  );
}

type CanonicalAnexoLike = ReturnType<typeof toCanonicalFromPayload>;
