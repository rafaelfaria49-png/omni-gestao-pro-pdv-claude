import { forwardRef, type ReactNode, useState } from "react";
import { X } from "lucide-react";

export function Modal({ open, onClose, title, subtitle, children, size = "lg" }: {
  open: boolean; onClose: () => void; title: string; subtitle?: string; children: ReactNode;
  size?: "md" | "lg" | "xl";
}) {
  if (!open) return null;
  const w = size === "xl" ? "max-w-5xl" : size === "lg" ? "max-w-3xl" : "max-w-xl";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full ${w} max-h-[90vh] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl flex flex-col`}>
        <div className="flex items-start justify-between gap-4 border-b border-border p-6">
          <div>
            <h2 className="text-xl font-semibold text-foreground">{title}</h2>
            {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-accent text-muted-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children, span = 1 }: { label: string; children: ReactNode; span?: 1 | 2 }) {
  return (
    <div className={span === 2 ? "col-span-2" : ""}>
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(
  props,
  ref
) {
  return (
    <input
      {...props}
      ref={ref}
      className={`w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring ${props.className ?? ""}`}
    />
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  props,
  ref
) {
  return (
    <textarea
      {...props}
      ref={ref}
      className={`w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring ${props.className ?? ""}`}
    />
  );
});

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { children, ...props },
  ref
) {
  return (
    <select
      {...props}
      ref={ref}
      className={`w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring ${props.className ?? ""}`}
    >
      {children}
    </select>
  );
});

export function Badge({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "success" | "warning" | "danger" | "info" | "primary" }) {
  const tones: Record<string, string> = {
    default: "bg-muted text-muted-foreground",
    success: "bg-[color-mix(in_oklab,var(--success)_18%,transparent)] text-[color:var(--success)]",
    warning: "bg-[color-mix(in_oklab,var(--warning)_20%,transparent)] text-[color:var(--warning)]",
    danger: "bg-[color-mix(in_oklab,var(--destructive)_18%,transparent)] text-[color:var(--destructive)]",
    info: "bg-[color-mix(in_oklab,var(--info)_18%,transparent)] text-[color:var(--info)]",
    primary: "bg-primary/15 text-primary",
  };
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function Card({
  children,
  className = "",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { children: ReactNode; className?: string }) {
  return (
    <div
      {...props}
      className={`min-w-0 max-w-full rounded-2xl border border-border bg-card ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex min-w-0 items-end justify-between gap-4">
      <div className="min-w-0">
        <h3 className="truncate text-lg font-semibold text-foreground">{title}</h3>
        {subtitle && <p className="truncate text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function useToggle(init = false) {
  const [v, setV] = useState(init);
  return { open: v, openIt: () => setV(true), close: () => setV(false), toggle: () => setV(!v) };
}
