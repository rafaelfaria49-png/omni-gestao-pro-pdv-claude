"use client"

import { motion } from "framer-motion"
import { Copy, Download, FileSpreadsheet, FileText, Trash2 } from "lucide-react"
import { useMemo, useState } from "react"

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function toCsvFromMarkdownOrLines(content: string): string {
  const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const hasTable = lines.some((l) => l.includes("|")) && lines.some((l) => /^\|?\s*:-{2,}/.test(l.replace(/\s+/g, " ")));
  if (hasTable) {
    const tableLines = lines.filter((l) => l.includes("|"));
    const rows = tableLines
      .filter((l) => !/^\|?\s*:-{2,}/.test(l.replace(/\s+/g, " ")))
      .map((l) => l.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim()));
    return rows
      .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
      .join("\n");
  }

  const rows = lines.map((line, idx) => [String(idx + 1), line]);
  return [["linha", "conteudo"], ...rows]
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

export function RightPanel({
  title,
  content,
  onClear,
}: {
  title?: string;
  content: string;
  onClear: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const hasContent = Boolean(content?.trim());
  const safeTitle = (title || "Documento").trim() || "Documento";

  const canExportCsv = useMemo(() => {
    const t = (content || "").trim();
    if (!t) return false;
    return t.includes("|") || t.includes("\t") || t.split(/\r?\n/).filter(Boolean).length >= 2;
  }, [content]);

  const handleCopy = async () => {
    if (!hasContent) return;
    await navigator.clipboard.writeText(content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const handleExportPdf = () => {
    if (!hasContent) return;
    const win = window.open("", "_blank", "noopener,noreferrer");
    if (!win) return;
    const safeContent = escapeHtml(content).replace(/\n/g, "<br />");
    const safe = escapeHtml(safeTitle);
    win.document.write(`<!doctype html>
      <html>
        <head>
          <title>${safe}</title>
          <style>
            body { margin: 0; padding: 40px; color: #111827; background: #ffffff; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
            main { max-width: 820px; margin: 0 auto; }
            h1 { margin: 0 0 18px; font-size: 18px; }
            .content { font-size: 14px; line-height: 1.75; white-space: normal; }
            @media print { body { padding: 28px; } }
          </style>
        </head>
        <body>
          <main>
            <h1>${safe}</h1>
            <div class="content">${safeContent}</div>
          </main>
          <script>window.onload = () => { window.print(); window.close(); };</script>
        </body>
      </html>`);
    win.document.close();
  };

  const handleExportCsv = () => {
    if (!hasContent) return;
    const csv = toCsvFromMarkdownOrLines(content);
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeTitle.toLowerCase().replace(/\s+/g, "-").slice(0, 40) || "documento"}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <aside className="flex h-full w-[350px] flex-none flex-col border-l border-border bg-panel/80 backdrop-blur-xl">
      <header className="flex items-center justify-between border-b border-border/60 px-5 py-3.5">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface text-muted-foreground">
            <FileText className="h-3.5 w-3.5" />
          </span>
          <div className="leading-tight">
            <h2 className="text-sm font-semibold">Editor de Documentos</h2>
            <p className="text-[11px] text-muted-foreground">Saída em tempo real</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-surface/60 px-2.5 text-[13px] font-medium text-muted-foreground transition hover:text-foreground disabled:opacity-50"
            type="button"
            onClick={() => void handleCopy()}
            disabled={!hasContent}
          >
            <Copy className="h-3 w-3" />
            <span className="hidden xl:inline">{copied ? "Copiado!" : "Copiar"}</span>
          </button>
          <button
            className="inline-flex h-8 items-center gap-1 rounded-lg bg-gradient-primary px-2.5 text-[13px] font-semibold text-primary-foreground shadow-elegant transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            type="button"
            onClick={handleExportPdf}
            disabled={!hasContent}
          >
            <Download className="h-3 w-3" />
            <span className="hidden xl:inline">Exportar</span>
          </button>
        </div>
      </header>

      {!hasContent ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.85, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="relative"
          >
            <div className="absolute inset-0 -z-10 rounded-full bg-gradient-primary opacity-20 blur-3xl" />
            <div className="flex h-24 w-24 items-center justify-center rounded-3xl border border-border bg-card shadow-elegant">
              <FileText className="h-10 w-10 text-muted-foreground" strokeWidth={1.4} />
            </div>
          </motion.div>
          <h3 className="mt-6 font-display text-base font-bold">Nenhum documento aberto</h3>
          <p className="mt-2 max-w-[260px] text-[13px] leading-relaxed text-muted-foreground">
            Quando a IA gerar um relatório, contrato, roteiro ou campanha longa, ele vai aparecer aqui pronto pra editar e exportar.
          </p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="border-b border-border/60 px-5 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Documento</div>
            <div className="mt-1 text-[14px] font-semibold text-foreground">{safeTitle}</div>
          </div>
          <div className="min-h-0 flex-1 p-5">
            <textarea
              value={content}
              readOnly
              className="h-full w-full resize-none rounded-2xl border border-border bg-background/40 p-4 text-[14px] leading-relaxed text-foreground outline-none"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-border/60 px-5 py-3">
            <button
              type="button"
              onClick={handleExportPdf}
              className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-gradient-primary px-3 text-[13px] font-semibold text-primary-foreground shadow-elegant transition hover:opacity-90"
            >
              <Download className="h-4 w-4" /> Exportar PDF
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={!canExportCsv}
              className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-border bg-surface/60 px-3 text-[13px] font-semibold text-foreground transition hover:border-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FileSpreadsheet className="h-4 w-4" /> Exportar CSV
            </button>
            <button
              type="button"
              onClick={onClear}
              className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-xl border border-border bg-surface/60 px-3 text-[13px] font-semibold text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" /> Limpar documento
            </button>
          </div>
        </div>
      )}

      <div className="border-t border-border/60 px-5 py-3 text-[10px] text-muted-foreground">
        Dica: peça <span className="font-semibold text-foreground">"escreva um contrato"</span> no chat.
      </div>
    </aside>
  )
}

