"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type NovaCategoriaResult = { ok: true; name: string } | { ok: false; message: string };

/**
 * Criação explícita de categoria (experiência do cliente). Só informa sucesso depois
 * que `onSubmit` devolve o nome canônico confirmado pelo writer; a ficha do produto
 * por trás continua montada, então o rascunho não se perde ao abrir ou cancelar.
 */
export function NovaCategoriaDialog({
  open,
  initialName,
  onOpenChange,
  onSubmit,
  returnFocusTo,
}: {
  open: boolean;
  initialName: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string) => Promise<NovaCategoriaResult>;
  /** Sem `DialogTrigger` o Radix não sabe quem abriu a janela; o foco volta para este elemento. */
  returnFocusTo?: () => HTMLElement | null;
}) {
  const inputId = useId();
  const descriptionId = useId();
  const errorId = useId();
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // Trava síncrona: dois cliques/Enter no mesmo tick não disparam duas gravações.
  const lockRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setError(null);
  }, [open, initialName]);

  const close = (next: boolean) => {
    if (!next && lockRef.current) return;
    onOpenChange(next);
  };

  const submit = async () => {
    if (lockRef.current) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Informe o nome da categoria.");
      return;
    }
    lockRef.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await onSubmit(trimmed);
      if (result.ok) {
        lockRef.current = false;
        onOpenChange(false);
        return;
      }
      setError(result.message);
    } finally {
      lockRef.current = false;
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        className="sm:max-w-md"
        aria-describedby={descriptionId}
        showCloseButton={!pending}
        onEscapeKeyDown={(event) => { if (lockRef.current) event.preventDefault(); }}
        onInteractOutside={(event) => { if (lockRef.current) event.preventDefault(); }}
        onCloseAutoFocus={(event) => {
          const target = returnFocusTo?.();
          if (target?.isConnected) {
            event.preventDefault();
            target.focus();
          }
        }}
      >
        <form
          className="grid min-w-0 gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void submit();
          }}
        >
          <DialogHeader>
            <DialogTitle>Nova categoria</DialogTitle>
            <DialogDescription id={descriptionId}>
              A categoria fica salva nesta loja e passa a aparecer na lista. O produto em edição continua aberto.
            </DialogDescription>
          </DialogHeader>
          <div className="grid min-w-0 gap-1.5">
            <label htmlFor={inputId} className="text-sm font-medium text-foreground">
              Nome da categoria
            </label>
            <input
              id={inputId}
              autoFocus
              autoComplete="off"
              maxLength={120}
              value={name}
              disabled={pending}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              onChange={(event) => {
                setName(event.target.value);
                if (error) setError(null);
              }}
              className="h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors focus:ring-2 focus:ring-ring disabled:opacity-60"
            />
            {error && (
              <p id={errorId} role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => close(false)}
              className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending}
              aria-busy={pending || undefined}
              className="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {pending ? "Salvando…" : "Salvar categoria"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
