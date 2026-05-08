import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, FileText, ImageIcon, Lock, Receipt, Upload, Video, X } from "lucide-react";
import type { Anexo, OrdemServico } from "@/types/os";
import { useOS } from "@/store/osStore";
import { Button } from "@/components/ui/button";
import { dt } from "@/lib/os/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { categoriaFromTipo, buildLocalIdbUrl, toCanonicalFromPayload, toPayloadFromCanonical } from "@/components/operacoes/lovable/services/anexos/helpers";
import { putLocalBlob, deleteLocalBlob } from "@/components/operacoes/lovable/services/anexos/storage";
import { resolvePreviewUrl, revokePreviewUrlFor, gcPreviewCache } from "@/components/operacoes/lovable/services/anexos/preview";

const TIPO_LABEL: Record<Anexo["tipo"], string> = {
  foto_antes: "Antes",
  foto_depois: "Depois",
  video: "Vídeo",
  laudo: "Laudo",
  nota: "Nota fiscal",
  outro: "Outro",
};

const BOTOES: { tipo: Anexo["tipo"]; label: string; icon: typeof Camera; accept: string }[] = [
  { tipo: "foto_antes", label: "Foto antes", icon: Camera, accept: "image/*" },
  { tipo: "foto_depois", label: "Foto depois", icon: Camera, accept: "image/*" },
  { tipo: "video", label: "Vídeo", icon: Video, accept: "video/*" },
  { tipo: "laudo", label: "Laudo PDF", icon: FileText, accept: "application/pdf" },
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
      toast.success(`${files.length} anexo(s) adicionado(s)`);
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

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border p-4">
        <div className="flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Anexos & evidências</span>
        </div>
        <span className="text-[11px] text-muted-foreground">{os.anexos.length} arquivos</span>
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
            const isPersisted = a.persisted && a.storageProvider !== "legacy-blob";
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
              <div className="absolute inset-x-0 top-0 flex items-center justify-between p-1.5">
                <span className={cn(
                  "rounded-full border px-1.5 py-0.5 text-[9px] font-medium backdrop-blur",
                  a.publico
                    ? "border-emerald-500/40 bg-emerald-500/20 text-emerald-100"
                    : "border-amber-500/40 bg-amber-500/20 text-amber-100",
                )}>
                  {a.publico ? "Público" : <><Lock className="inline h-2.5 w-2.5" /> Privado</>}
                </span>
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
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1.5">
                <div className="text-[10px] font-medium text-white">{TIPO_LABEL[a.tipo]}</div>
                <div className="text-[9px] text-white/70">{dt(a.createdAt)}</div>
                <div className="mt-0.5 text-[9px] text-white/70">
                  {a.categoria} · {a.tamanho ? `${Math.round(a.tamanho / 1024)} KB` : "—"} · {isPersisted ? "Persistido" : "Sessão atual"}
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
