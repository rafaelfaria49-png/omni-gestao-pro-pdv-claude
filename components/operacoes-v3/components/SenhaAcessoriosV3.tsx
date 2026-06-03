"use client";

// ============================================================================
// Operações V3 — Senha + acessórios recebidos (item 5) · editável + persistível.
// Persiste em senhaEquipamento/Tipo + equipamento.acessorios via workspace-actions.
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { Check, KeyRound, Loader2, Package2, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OrdemServico } from "@/types/os";
import {
  ACESSORIOS_RECEBIDOS_PADRAO_V3,
  lerSenhaAcessoriosV3,
  type SenhaTipoV3,
} from "@/lib/operacoes-v3/workspace-model";
import { ButtonV3 } from "./UiV3";
import { PatternPadV3 } from "./PatternPadV3";

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

export function SenhaAcessoriosV3({
  os,
  storeId,
  onChanged,
  salvar,
  pending,
  notificar,
}: {
  os: OrdemServico;
  storeId: string | null;
  onChanged: () => void;
  salvar: (input: { senha: string; senhaTipo: SenhaTipoV3; acessorios: string[] }) => Promise<boolean>;
  pending: boolean;
  notificar: (msg: string) => void;
}) {
  const inicial = useMemo(() => lerSenhaAcessoriosV3(os), [os]);
  const [senha, setSenha] = useState(inicial.senha);
  const [senhaTipo, setSenhaTipo] = useState<SenhaTipoV3>(inicial.senhaTipo);
  const [acessorios, setAcessorios] = useState<string[]>(inicial.acessorios);
  const [outros, setOutros] = useState("");
  const [dirty, setDirty] = useState(false);

  const editKey = `${os.id}:${os.atualizadoEm ?? ""}`;
  useEffect(() => {
    setSenha(inicial.senha);
    setSenhaTipo(inicial.senhaTipo);
    setAcessorios(inicial.acessorios);
    setOutros("");
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editKey]);

  const toggle = (a: string) => {
    setAcessorios((arr) => (arr.includes(a) ? arr.filter((x) => x !== a) : [...arr, a]));
    setDirty(true);
  };

  const onSalvar = async () => {
    if (!storeId) {
      notificar("Selecione uma unidade ativa.");
      return;
    }
    const extras = outros.split(",").map((x) => x.trim()).filter(Boolean);
    const base = acessorios.filter((a) => ACESSORIOS_RECEBIDOS_PADRAO_V3.includes(a));
    const finalAcessorios = [...new Set([...base, ...acessorios.filter((a) => !ACESSORIOS_RECEBIDOS_PADRAO_V3.includes(a)), ...extras])];
    const ok = await salvar({ senha, senhaTipo, acessorios: finalAcessorios });
    if (ok) {
      setDirty(false);
      onChanged();
      notificar("Senha e acessórios salvos.");
    }
  };

  const customAtuais = acessorios.filter((a) => !ACESSORIOS_RECEBIDOS_PADRAO_V3.includes(a));

  return (
    <section id="senha" className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <KeyRound className="h-4 w-4" aria-hidden />
        </span>
        <h3 className="truncate text-sm font-semibold text-foreground">Senha & acessórios</h3>
      </div>

      <div className="space-y-4 px-4 py-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block min-w-0">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Tipo de senha</span>
            <select
              className={inputCls}
              value={senhaTipo}
              onChange={(e) => { setSenhaTipo(e.target.value as SenhaTipoV3); setSenha(""); setDirty(true); }}
            >
              <option value="numerica">Numérica / PIN</option>
              <option value="texto">Texto (alfanumérica)</option>
              <option value="padrao">Padrão (desenho 3×3)</option>
            </select>
          </label>
          {senhaTipo !== "padrao" ? (
            <label className="block min-w-0">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Senha do aparelho</span>
              <input
                className={inputCls}
                value={senha}
                onChange={(e) => { setSenha(e.target.value); setDirty(true); }}
                inputMode={senhaTipo === "numerica" ? "numeric" : "text"}
                placeholder={senhaTipo === "numerica" ? "Ex.: 1234" : "Senha"}
                maxLength={40}
                autoComplete="off"
              />
            </label>
          ) : null}
        </div>

        {senhaTipo === "padrao" ? (
          <div>
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Senha padrão (desenho 3×3)</span>
            <PatternPadV3 value={senha} onChange={(v) => { setSenha(v); setDirty(true); }} />
          </div>
        ) : null}

        <div>
          <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Package2 className="h-3.5 w-3.5" aria-hidden /> Acessórios recebidos
          </span>
          <div className="flex flex-wrap gap-2">
            {ACESSORIOS_RECEBIDOS_PADRAO_V3.map((a) => {
              const on = acessorios.includes(a);
              return (
                <button
                  key={a}
                  type="button"
                  onClick={() => toggle(a)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {on ? <Check className="h-3 w-3" aria-hidden /> : null}
                  {a}
                </button>
              );
            })}
          </div>
          <label className="mt-2 block min-w-0">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Outros acessórios</span>
            <input
              className={inputCls}
              defaultValue={customAtuais.join(", ")}
              onChange={() => setDirty(true)}
              onBlur={(e) => setOutros(e.target.value)}
              placeholder="Separe por vírgula (ex.: brinde, manual)"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ButtonV3 variant="primary" disabled={pending || !dirty} onClick={onSalvar}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
            Salvar senha & acessórios
          </ButtonV3>
          {dirty ? (
            <ButtonV3 variant="ghost" disabled={pending} onClick={() => { setSenha(inicial.senha); setSenhaTipo(inicial.senhaTipo); setAcessorios(inicial.acessorios); setOutros(""); setDirty(false); }}>
              Descartar
            </ButtonV3>
          ) : null}
        </div>
      </div>
    </section>
  );
}
