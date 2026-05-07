"use client"

import { Bot, Check, Copy, Download, FileSpreadsheet, FileText, ImageIcon, Pin, Sparkles, User } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";

export type ChatMsg = {
  id: string
  role: "user" | "ai"
  content: string
  /** Novo contrato do orquestrador: texto vs imagem. */
  type?: "text" | "image"
  imageUrl?: string
  /** Legado/compat: já existia no chat (mock inicial). */
  image?: { url: string; tool: string }
}

export function ChatMessage({ msg, index }: { msg: ChatMsg; index: number }) {
  const isUser = msg.role === "user";
  const [copied, setCopied] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const resolvedImageUrl = msg.imageUrl || msg.image?.url || ""
  const wantsImageCard = msg.type === "image" || !!msg.image || !!msg.imageUrl
  const shouldShowImageCard = wantsImageCard

  const handleDownload = async (url: string) => {
    if (!url) return
    try {
      const response = await fetch(url)
      const blob = await response.blob()
      const blobUrl = window.URL.createObjectURL(blob)

      const a = document.createElement("a")
      a.href = blobUrl
      a.download = "imagem-ia.png"
      document.body.appendChild(a)
      a.click()
      a.remove()

      window.URL.revokeObjectURL(blobUrl)
    } catch (error) {
      console.error("Erro ao baixar imagem:", error)
    }
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(msg.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const handleExportPDF = () => {
    const win = window.open("", "_blank", "noopener,noreferrer");
    if (!win) return;
    const safeContent = escapeHtml(msg.content).replace(/\n/g, "<br />");
    win.document.write(`<!doctype html>
      <html>
        <head>
          <title>IA Mestre - Resposta</title>
          <style>
            body { margin: 0; padding: 40px; color: #111827; background: #ffffff; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
            main { max-width: 820px; margin: 0 auto; }
            h1 { margin: 0 0 24px; font-size: 18px; }
            .content { font-size: 16px; line-height: 1.75; white-space: normal; }
            @media print { body { padding: 28px; } }
          </style>
        </head>
        <body>
          <main>
            <h1>IA Mestre - Resposta</h1>
            <div class="content">${safeContent}</div>
          </main>
          <script>window.onload = () => { window.print(); window.close(); };</script>
        </body>
      </html>`);
    win.document.close();
  };

  const handleExportCSV = () => {
    const rows = msg.content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => [String(index + 1), line]);
    const csv = [["linha", "conteudo"], ...rows]
      .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ia-mestre-resposta-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: index * 0.04, ease: [0.22, 1, 0.36, 1] }} className={`group flex items-start gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div className={`flex h-9 w-9 flex-none items-center justify-center rounded-full ${isUser ? "bg-surface border border-border" : "bg-gradient-primary shadow-glow"}`}>
        {isUser ? <User className="h-4 w-4 text-foreground" /> : <Bot className="h-4 w-4 text-primary-foreground" />}
      </div>
      <div className={`flex ${isUser ? "max-w-[78%] items-end" : "max-w-[85%] items-start"} flex-col gap-2`}>
          <div className={`relative px-5 py-4 text-[14px] leading-relaxed shadow-elegant ${isUser ? "bubble-user-bg text-[var(--color-bubble-user-foreground)] rounded-2xl rounded-tr-sm" : "bg-bubble-ai text-bubble-ai-foreground rounded-2xl rounded-tl-sm border border-border/60"}`}>
          {!isUser && <span className="absolute -top-2 left-3 inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground"><Sparkles className="h-2.5 w-2.5" /> IA Mestre</span>}
          <div className="whitespace-pre-wrap text-[14px] leading-relaxed [&_p]:mb-4 [&_p:last-child]:mb-0">{msg.content}</div>
        </div>
        {!isUser && (
          <div className="mt-2 flex items-center gap-2 pl-1 opacity-80 transition group-hover:opacity-100">
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copiado!" : "Copiar"}
            </button>
            <button
              type="button"
              onClick={handleExportPDF}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <FileText className="h-3.5 w-3.5" />
              Exportar PDF
            </button>
            <button
              type="button"
              onClick={handleExportCSV}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Exportar Planilha
            </button>
          </div>
        )}
        {shouldShowImageCard && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.15 }}
            className="w-[320px] max-w-full overflow-hidden rounded-2xl border border-border bg-card shadow-elegant"
          >
            <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
              {!resolvedImageUrl || !imageLoaded ? (
                <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-6 text-center">
                  <div className="grid h-12 w-12 place-items-center rounded-2xl border border-border bg-background/40">
                    <ImageIcon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="text-[12px] font-medium text-muted-foreground">Gerando imagem...</div>
                </div>
              ) : null}
              {resolvedImageUrl ? (
                <img
                  src={resolvedImageUrl}
                  alt="Imagem gerada pela IA Mestre"
                  className={`h-full w-full max-w-full rounded-[8px] object-cover transition duration-700 hover:scale-105 ${imageLoaded ? "opacity-100" : "opacity-0"}`}
                  onLoad={() => setImageLoaded(true)}
                />
              ) : null}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
              <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-md">
                <ImageIcon className="h-3 w-3" /> {msg.image?.tool || "Gerado com IA"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 px-3 py-2.5">
              <span className="text-[11px] text-muted-foreground">Gerado com DALL·E 3</span>
              <button className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[12px] font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground" type="button">
                <Pin className="h-3.5 w-3.5" /> Fixar
              </button>
            </div>
            <div className="px-3 pb-3">
              <button
                type="button"
                onClick={() => void handleDownload(resolvedImageUrl)}
                className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-primary text-[13px] font-semibold text-primary-foreground shadow-elegant transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!resolvedImageUrl}
              >
                <Download className="h-4 w-4" /> Baixar imagem
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

