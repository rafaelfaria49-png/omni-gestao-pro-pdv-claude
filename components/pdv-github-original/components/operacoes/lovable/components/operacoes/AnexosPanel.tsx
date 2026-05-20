import { useRef } from "react";
import { Camera, FileText, ImageIcon, Lock, Receipt, Upload, Video } from "lucide-react";
import type { Anexo, OrdemServico } from "@/types/os";
import { useOS } from "@/store/osStore";
import { Button } from "@/components/ui/button";
import { dt } from "@/lib/os/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

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
  const { addAnexo } = useOS();
  const inputRef = useRef<HTMLInputElement>(null);
  const tipoRef = useRef<Anexo["tipo"]>("outro");

  const trigger = (tipo: Anexo["tipo"], accept: string) => {
    tipoRef.current = tipo;
    if (inputRef.current) {
      inputRef.current.accept = accept;
      inputRef.current.click();
    }
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    addAnexo(os.id, {
      tipo: tipoRef.current,
      nome: f.name,
      url,
      tamanho: f.size,
      mimeType: f.type,
      enviadoPor: "Você",
      publico: tipoRef.current === "foto_antes" || tipoRef.current === "foto_depois",
    });
    toast.success(`Anexo "${f.name}" adicionado`);
    e.target.value = "";
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
          {os.anexos.map((a) => (
            <a
              key={a.id}
              href={a.url}
              target="_blank"
              rel="noreferrer"
              className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted"
            >
              {a.mimeType?.startsWith("image/") ? (
                <img src={a.url} alt={a.nome} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
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
              </div>
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1.5">
                <div className="text-[10px] font-medium text-white">{TIPO_LABEL[a.tipo]}</div>
                <div className="text-[9px] text-white/70">{dt(a.enviadoEm)}</div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
