"use client"
import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Icon } from "./Icons";
import { PRODUCTS, CATEGORIAS, LOYALTY_CUSTOMERS, POINTS_PER_REAL, TIER_COLORS } from "./data";

export const formatBRL = (n: any) =>
  (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const formatNum = (n: any, d = 2) =>
  (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
export const parseAmount = (s: any) => {
  if (typeof s === "number") return s;
  if (!s) return 0;
  const cleaned = String(s).replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
};

export const METHODS = [
  { id: "dinheiro",   nome: "Dinheiro",        ds: "Cédulas e moedas", icon: "cash",   k: "1" },
  { id: "pix",        nome: "PIX",             ds: "Chave / QR Code",  icon: "pix",    k: "2" },
  { id: "debito",     nome: "Cartão débito",   ds: "Aprovação direta", icon: "card",   k: "3" },
  { id: "credito",    nome: "Cartão crédito",  ds: "À vista ou parcelado", icon: "card", k: "4" },
  { id: "crediario",  nome: "Crediário",       ds: "Conta do cliente", icon: "wallet", k: "5" },
];

/* ---------- Modal shell ---------- */
const ModalShell = ({ title, badge, onClose, children, size = "default", footer }: any) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      const el = ref.current?.querySelector("[data-autofocus]") as HTMLElement;
      if (el) el.focus();
    }, 30);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div ref={ref} className={`modal ${size === "wide" ? "wide" : size === "narrow" ? "narrow" : ""}`} onKeyDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            {badge && <span className="badge">{badge}</span>}
            <span>{title}</span>
          </div>
          <button className="icon-btn" onClick={onClose} title="Fechar (Esc)"><Icon name="x" size={16}/></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
};

/* ---------- F3 Busca avançada ---------- */
export const SearchModal = ({ initialQuery, onClose, onPick }: any) => {
  const [q, setQ] = useState(initialQuery || "");
  const [cat, setCat] = useState("");
  const [focusIdx, setFocusIdx] = useState(0);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    return PRODUCTS.filter((p) => {
      if (cat && p.categoria !== cat) return false;
      if (!term) return true;
      return (
        p.nome.toLowerCase().includes(term) ||
        p.codigo.includes(term) ||
        p.ean.includes(term) ||
        p.categoria.toLowerCase().includes(term)
      );
    });
  }, [q, cat]);

  useEffect(() => { setFocusIdx(0); }, [q, cat]);

  const onKey = (e: any) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setFocusIdx((i) => Math.min(i + 1, results.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setFocusIdx((i) => Math.max(i - 1, 0)); }
    if (e.key === "Enter") {
      e.preventDefault();
      if (results[focusIdx]) onPick(results[focusIdx]);
    }
  };

  return (
    <ModalShell title="Pesquisar Produto (F3)" badge="" onClose={onClose} size="wide">
      <div className="search-box" style={{ marginBottom: "20px", display: "flex", alignItems: "center", background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: "8px", padding: "0 12px" }}>
        <span className="si" style={{ color: "var(--text-2)", display: "flex", alignItems: "center" }}><Icon name="search" size={20}/></span>
        <input
          autoFocus
          placeholder="Digite para buscar produto com a lupa..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
          style={{ background: "transparent", border: "none", width: "100%", padding: "14px", color: "var(--text-1)", fontSize: "16px", outline: "none" }}
        />
      </div>

      <div className="cat-pills">
        <button className={`cat-pill ${!cat ? "active" : ""}`} onClick={() => setCat("")}>Todas categorias</button>
        {CATEGORIAS.map((c) => (
          <button key={c} className={`cat-pill ${cat === c ? "active" : ""}`} onClick={() => setCat(cat === c ? "" : c)}>{c}</button>
        ))}
      </div>

      <div className="prod-table">
        <div className="prod-thead">
          <div></div>
          <div>Código</div>
          <div>Produto</div>
          <div>Categoria</div>
          <div style={{ textAlign: "right" }}>Preço</div>
          <div></div>
        </div>
        <div className="prod-scroll" onKeyDown={onKey}>
          {results.length === 0 && (
            <div style={{ padding: 32, textAlign: "center", color: "var(--text-2)" }}>
              Nenhum produto encontrado para "{q}".
            </div>
          )}
          {results.map((p, idx) => (
            <div
              key={p.id}
              className={`prod-row ${idx === focusIdx ? "focused" : ""}`}
              onMouseEnter={() => setFocusIdx(idx)}
              onClick={() => onPick(p)}
            >
              <div className="ic">{p.icone}</div>
              <div className="code">{p.codigo}<small style={{ display: "block", fontSize: 10, color: "var(--text-3)" }}>{p.ean}</small></div>
              <div className="nm">{p.nome}<small>id #{p.id}</small></div>
              <div className="cat">{p.categoria}<span className="stock-badge">{p.estoque} un</span></div>
              <div className="pr">{formatBRL(p.preco)}</div>
              <div className="add">
                <button className="btn btn-xs btn-primary" onClick={(e) => { e.stopPropagation(); onPick(p); }}>
                  <Icon name="plus" size={12}/> Add
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="callout" style={{ marginTop: 14 }}>
        <Icon name="info" size={14}/>
        <div>
          Use <span className="kbd-key">↑</span> <span className="kbd-key">↓</span> para navegar,
          <span className="kbd-key" style={{ marginLeft: 6 }}>Enter</span> para adicionar,
          <span className="kbd-key" style={{ marginLeft: 6 }}>Esc</span> para fechar.
        </div>
      </div>
    </ModalShell>
  );
};

/* ---------- F4 Quantidade ---------- */
export const QtyModal = ({ item, onClose, onSave }: any) => {
  const [qty, setQty] = useState(String(item.qtd));
  const submit = () => {
    const n = Math.max(1, parseInt(qty, 10) || 1);
    onSave(n);
  };
  return (
    <ModalShell
      title="Alterar quantidade" badge="F4" onClose={onClose} size="narrow"
      footer={
        <>
          <button className="btn btn-sm btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-sm btn-primary" onClick={submit}>Confirmar (Enter)</button>
        </>
      }
    >
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 600 }}>Item selecionado</div>
        <div style={{ fontWeight: 600, marginTop: 4 }}>{item.icone} {item.nome}</div>
        <div className="fmono muted" style={{ fontSize: 12 }}>{item.codigo} · {formatBRL(item.preco)}</div>
      </div>
      <div className="field">
        <label>Nova quantidade</label>
        <input
          data-autofocus
          type="number" min="1" className="mono"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          onFocus={(e) => e.target.select()}
        />
      </div>
      <div className="row" style={{ marginTop: 14, gap: 6 }}>
        {[1, 2, 5, 10, 12].map((n) => (
          <button key={n} className="btn btn-xs" onClick={() => setQty(String(n))}>{n}</button>
        ))}
      </div>
    </ModalShell>
  );
};

/* ---------- F5 Cliente ---------- */
export const CustomerModal = ({ customer, onClose, onSave }: any) => {
  const [nome, setNome] = useState(customer?.nome || "");
  const [doc, setDoc] = useState(customer?.doc || "");
  const [tel, setTel] = useState(customer?.tel || "");
  const save = () => {
    if (!nome && !doc) { onSave(null); return; }
    onSave({ nome: nome || "Consumidor final", doc, tel });
  };
  return (
    <ModalShell
      title="Cliente da venda" badge="F5" onClose={onClose} size="narrow"
      footer={
        <>
          <button className="btn btn-sm btn-ghost" onClick={() => { onSave(null); }}>Remover</button>
          <button className="btn btn-sm btn-primary" onClick={save}>Salvar</button>
        </>
      }
    >
      <div className="field-grid">
        <div className="field">
          <label>Nome do cliente</label>
          <input data-autofocus value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Consumidor final" />
        </div>
        <div className="field">
          <label>CPF / CNPJ</label>
          <input value={doc} onChange={(e) => setDoc(e.target.value)} placeholder="000.000.000-00" />
        </div>
        <div className="field">
          <label>Telefone (opcional)</label>
          <input value={tel} onChange={(e) => setTel(e.target.value)} placeholder="(11) 91234-5678" />
        </div>
      </div>
    </ModalShell>
  );
};

/* ---------- F8 Desconto / Acréscimo ---------- */
const DISCOUNT_AUTH_LIMIT_PCT = 10;
const MANAGER_PASSWORD = "1234";

export const DiscountModal = ({ subtotal, current, onClose, onSave }: any) => {
  const [tipo, setTipo] = useState(current?.tipo || "desconto");
  const [modo, setModo] = useState(current?.modo || "valor");
  const [val, setVal] = useState(current?.valor ? String(current.valor).replace(".", ",") : "");
  const [pwd, setPwd] = useState("");
  const [authorized, setAuthorized] = useState(!!current?.autorizado);
  const [pwdError, setPwdError] = useState("");

  const valor = parseAmount(val);
  const aplicado = modo === "percent" ? subtotal * (valor / 100) : valor;
  const signed = tipo === "desconto" ? -aplicado : aplicado;
  const novoTotal = Math.max(0, subtotal + signed);

  const percentAplicado = subtotal > 0 ? (aplicado / subtotal) * 100 : 0;
  const needsAuth = tipo === "desconto" && percentAplicado > DISCOUNT_AUTH_LIMIT_PCT;

  useEffect(() => {
    if (!needsAuth) { setAuthorized(false); setPwd(""); setPwdError(""); }
  }, [tipo, modo, val, needsAuth]);

  const tryAuth = () => {
    if (pwd === MANAGER_PASSWORD) { setAuthorized(true); setPwdError(""); }
    else { setPwdError("Senha do gerente incorreta."); }
  };

  const submit = () => {
    if (!valor) { onSave(null); return; }
    if (needsAuth && !authorized) return;
    onSave({ tipo, modo, valor, autorizado: needsAuth ? true : false });
  };

  return (
    <ModalShell
      title="Desconto / Acréscimo" badge="F8" onClose={onClose} size="narrow"
      footer={
        <>
          <button className="btn btn-sm btn-ghost" onClick={() => onSave(null)}>Remover</button>
          <button
            className="btn btn-sm btn-primary"
            onClick={submit}
            disabled={needsAuth && !authorized}
            style={{ opacity: (needsAuth && !authorized) ? 0.4 : 1 }}
          >
            {needsAuth && !authorized
              ? <><Icon name="lock" size={12}/> Autorização necessária</>
              : <>Aplicar</>}
          </button>
        </>
      }
    >
      <div className="field-grid">
        <div className="field">
          <label>Tipo</label>
          <div className="segmented">
            <button className={tipo === "desconto" ? "active" : ""} onClick={() => setTipo("desconto")}>Desconto</button>
            <button className={tipo === "acrescimo" ? "active" : ""} onClick={() => setTipo("acrescimo")}>Acréscimo</button>
          </div>
        </div>
        <div className="field">
          <label>Modo</label>
          <div className="segmented accent">
            <button className={modo === "valor" ? "active" : ""} onClick={() => setModo("valor")}>R$ valor</button>
            <button className={modo === "percent" ? "active" : ""} onClick={() => setModo("percent")}>% percentual</button>
          </div>
        </div>
        <div className="field">
          <label>{modo === "percent" ? "Percentual" : "Valor (R$)"}</label>
          <input
            data-autofocus className="mono"
            placeholder={modo === "percent" ? "0,00 %" : "0,00"}
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          />
        </div>

        <div className="pay-summary" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr" }}>
          <div className="pay-sumcell total">
            <div className="lb">Subtotal</div>
            <div className="vl" style={{ fontSize: 18 }}>{formatBRL(subtotal)}</div>
          </div>
          <div className="pay-sumcell">
            <div className="lb">{tipo === "desconto" ? "Desconto" : "Acréscimo"}</div>
            <div className="vl" style={{ fontSize: 18, color: tipo === "desconto" ? "var(--warn)" : "var(--info)" }}>
              {tipo === "desconto" ? "−" : "+"}{formatBRL(aplicado)}
            </div>
          </div>
          <div className="pay-sumcell remain done">
            <div className="lb">Novo total</div>
            <div className="vl" style={{ fontSize: 18 }}>{formatBRL(novoTotal)}</div>
          </div>
        </div>

        {needsAuth && (
          <div className={`auth-box ${authorized ? "ok" : "warn"}`}>
            {authorized ? (
              <>
                <div className="auth-ic"><Icon name="shield" size={16}/></div>
                <div>
                  <div className="auth-tt">Desconto autorizado pelo gerente</div>
                  <div className="auth-sb">
                    Aplicação de <strong>{percentAplicado.toFixed(1)}%</strong> liberada — acima do limite de {DISCOUNT_AUTH_LIMIT_PCT}%.
                  </div>
                </div>
                <span className="auth-badge"><Icon name="check" size={11}/> Autorizado</span>
              </>
            ) : (
              <>
                <div className="auth-ic"><Icon name="lock" size={16}/></div>
                <div style={{ flex: 1 }}>
                  <div className="auth-tt">Autorização do gerente</div>
                  <div className="auth-sb">
                    O desconto de <strong>{percentAplicado.toFixed(1)}%</strong> ultrapassa o limite operacional de {DISCOUNT_AUTH_LIMIT_PCT}%.
                  </div>
                  <div className="auth-input-row">
                    <input
                      type="password"
                      className="mono"
                      placeholder="Senha do gerente"
                      value={pwd}
                      onChange={(e) => setPwd(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); tryAuth(); } }}
                    />
                    <button className="btn btn-sm" onClick={tryAuth} type="button">
                      <Icon name="check" size={12}/> Liberar
                    </button>
                  </div>
                  {pwdError && <div className="auth-err">{pwdError}</div>}
                  <div className="auth-hint">Senha demo: <code>1234</code></div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </ModalShell>
  );
};

/* ---------- F9 CPF/CNPJ na nota ---------- */
export const CpfNotaModal = ({ current, onClose, onSave }: any) => {
  const [doc, setDoc] = useState(current || "");
  const submit = () => onSave(doc.trim());
  return (
    <ModalShell
      title="CPF / CNPJ na nota" badge="F9" onClose={onClose} size="narrow"
      footer={
        <>
          <button className="btn btn-sm btn-ghost" onClick={() => onSave("")}>Sem documento</button>
          <button className="btn btn-sm btn-primary" onClick={submit}>Confirmar</button>
        </>
      }
    >
      <div className="field">
        <label>Documento do cliente</label>
        <input
          data-autofocus className="mono"
          placeholder="000.000.000-00 ou 00.000.000/0000-00"
          value={doc}
          onChange={(e) => setDoc(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        />
      </div>
      <div className="callout" style={{ marginTop: 12 }}>
        <Icon name="info" size={14}/>
        <div>O documento será impresso no cupom fiscal desta venda. Não vincula cadastro de cliente.</div>
      </div>
    </ModalShell>
  );
};

/* ---------- F10 Cancelar ---------- */
export const CancelModal = ({ itensCount, onClose, onConfirm }: any) => (
  <ModalShell
    title="Cancelar venda" badge="F10" onClose={onClose} size="narrow"
    footer={
      <>
        <button className="btn btn-sm btn-ghost" onClick={onClose}>Voltar</button>
        <button className="btn btn-sm btn-danger" onClick={onConfirm}>Sim, cancelar venda</button>
      </>
    }
  >
    <div className="row" style={{ alignItems: "flex-start", gap: 14 }}>
      <div style={{ width: 44, height: 44, borderRadius: 11, background: "var(--danger-soft)", color: "var(--danger)", display: "grid", placeItems: "center", border: "1px solid var(--danger-line)" }}>
        <Icon name="alert" size={20}/>
      </div>
      <div>
        <div style={{ fontWeight: 700, fontSize: 16 }}>Tem certeza?</div>
        <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>
          Os {itensCount} {itensCount === 1 ? "item" : "itens"} no carrinho serão removidos e esta venda não poderá ser recuperada.
        </div>
      </div>
    </div>
  </ModalShell>
);

/* ---------- F11 Suspender / Retomar ---------- */
export const SuspendModal = ({ suspended, currentCount, onClose, onSuspend, onResume, onDiscard }: any) => {
  const total = (items: any) => items.reduce((s: any, i: any) => s + i.qtd * i.preco, 0);
  return (
    <ModalShell title="Vendas suspensas" badge="F11" onClose={onClose}>
      {currentCount > 0 && (
        <div className="callout" style={{ marginBottom: 14 }}>
          <Icon name="pause" size={14}/>
          <div>
            Há {currentCount} {currentCount === 1 ? "item" : "itens"} no carrinho atual. Suspenda para retomar mais tarde.
            <div style={{ marginTop: 8 }}>
              <button className="btn btn-xs btn-primary" onClick={onSuspend}>Suspender venda atual</button>
            </div>
          </div>
        </div>
      )}

      <div className="card-title">Suspensas ({suspended.length})</div>
      {suspended.length === 0 ? (
        <div className="muted" style={{ padding: 18, textAlign: "center", border: "1px dashed var(--line-2)", borderRadius: 10 }}>
          Nenhuma venda suspensa no momento.
        </div>
      ) : (
        <div className="suspended-list">
          {suspended.map((s: any) => (
            <div key={s.id} className="suspended-item">
              <div className="si-info">
                <div className="nm">{s.items.length} {s.items.length === 1 ? "item" : "itens"} · {formatBRL(total(s.items))}</div>
                <div className="ds">#{s.id} · {s.timestamp} · {s.customer?.nome || "Consumidor final"}</div>
              </div>
              <div className="si-actions">
                <button className="btn btn-xs btn-ghost" onClick={() => onDiscard(s.id)} title="Descartar">
                  <Icon name="trash" size={12}/>
                </button>
                <button className="btn btn-xs btn-primary" onClick={() => onResume(s.id)}>
                  <Icon name="play" size={12}/> Retomar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </ModalShell>
  );
};

/* ---------- F12 Pagamento ---------- */
export const PaymentModal = ({ total, customer, onClose, onComplete }: any) => {
  const [payments, setPayments] = useState<any[]>([]);
  const [activeMethod, setActiveMethod] = useState<any>(null);
  const [amountStr, setAmountStr] = useState("");
  const amtRef = useRef<HTMLInputElement>(null);

  const paid = payments.reduce((s, p) => s + p.amount, 0);
  const remaining = Math.max(0, total - paid);
  const change = Math.max(0, paid - total);
  const isComplete = paid >= total - 0.0001;

  const startMethod = (m: any) => {
    setActiveMethod(m);
    setAmountStr(formatNum(remaining).replace(".", ""));
    setTimeout(() => { amtRef.current?.focus(); amtRef.current?.select(); }, 30);
  };

  const addPayment = () => {
    const amount = parseAmount(amountStr);
    if (!amount || amount <= 0 || !activeMethod) return;
    setPayments((p) => [...p, { method: activeMethod, amount, id: Date.now() + Math.random() }]);
    setActiveMethod(null);
    setAmountStr("");
  };

  const removePayment = (id: any) => setPayments((p) => p.filter((x) => x.id !== id));

  useEffect(() => {
    const onKey = (e: any) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (e.key === "Enter") {
        if (activeMethod) addPayment();
        else if (isComplete) finalize();
      }
      const m = METHODS.find((x) => x.k === e.key);
      if (m && !activeMethod) { e.preventDefault(); startMethod(m); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const finalize = () => {
    if (!isComplete) return;
    onComplete({ payments, change, paid });
  };

  return (
    <ModalShell
      title="Finalizar venda" badge="F12" onClose={onClose}
      footer={
        <>
          <button className="btn btn-sm btn-ghost" onClick={onClose}>Voltar</button>
          <button
            className="btn btn-sm btn-primary"
            onClick={finalize}
            disabled={!isComplete}
            style={{ opacity: isComplete ? 1 : 0.4, cursor: isComplete ? "pointer" : "not-allowed" }}
          >
            <Icon name="check" size={14}/> Concluir venda
          </button>
        </>
      }
    >
      <div className="pay-summary" style={{ marginBottom: 16 }}>
        <div className="pay-sumcell total">
          <div className="lb">Total da venda</div>
          <div className="vl">{formatBRL(total)}</div>
        </div>
        <div className="pay-sumcell paid">
          <div className="lb">Pago</div>
          <div className="vl">{formatBRL(paid)}</div>
        </div>
        <div className={`pay-sumcell remain ${isComplete ? "done" : ""} ${change > 0 ? "over" : ""}`}>
          <div className="lb">{change > 0 ? "Troco" : "Restante"}</div>
          <div className="vl">{formatBRL(change > 0 ? change : remaining)}</div>
        </div>
      </div>

      {payments.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div className="card-title">Formas aplicadas</div>
          {payments.map((p) => (
            <div className="pay-applied" key={p.id}>
              <div className="pa-method">
                <Icon name={p.method.icon} size={16}/> {p.method.nome}
              </div>
              <div className="row">
                <div className="pa-amt">{formatBRL(p.amount)}</div>
                <button className="pa-x" onClick={() => removePayment(p.id)}><Icon name="x" size={14}/></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!isComplete && (
        <>
          <div className="card-title">{activeMethod ? "Informe o valor" : "Selecione a forma de pagamento"}</div>

          {!activeMethod && (
            <div className="pay-grid">
              {METHODS.map((m) => (
                <button key={m.id} className="pay-method" onClick={() => startMethod(m)}>
                  <div className="pm-ic"><Icon name={m.icon} size={18}/></div>
                  <div className="pm-info">
                    <div className="nm">{m.nome}</div>
                    <div className="ds">{m.ds}</div>
                  </div>
                  <div className="pm-kbd">{m.k}</div>
                </button>
              ))}
            </div>
          )}

          {activeMethod && (
            <div className="amt-prompt">
              <div className="field">
                <label>{activeMethod.nome} — valor (R$)</label>
                <input
                  ref={amtRef}
                  className="mono"
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); addPayment(); }
                    if (e.key === "Escape") { e.preventDefault(); setActiveMethod(null); setAmountStr(""); }
                  }}
                  placeholder="0,00"
                />
              </div>
              <div className="chip-row">
                <button className="chip" onClick={() => setAmountStr(formatNum(remaining).replace(".", ""))}>= restante</button>
              </div>
              <button className="btn btn-sm btn-primary" onClick={addPayment} style={{ height: 44 }}>
                <Icon name="plus" size={14}/> Adicionar
              </button>
            </div>
          )}
        </>
      )}

      {isComplete && (
        <div className="callout" style={{ background: "var(--accent-soft)", borderColor: "var(--accent-line)", color: "var(--accent)" }}>
          <Icon name="check-circle" size={16}/>
          <div>
            Pagamento completo. {change > 0 ? <>Troco a entregar: <strong>{formatBRL(change)}</strong>.</> : "Sem troco."}
            <div style={{ marginTop: 4, fontSize: 12, opacity: 0.85 }}>Pressione Enter para concluir.</div>
          </div>
        </div>
      )}

      {customer && (
        <div className="muted" style={{ marginTop: 14, fontSize: 12 }}>
          Cliente: <strong style={{ color: "var(--text-1)" }}>{customer.nome}</strong>
          {customer.doc && <> · {customer.doc}</>}
        </div>
      )}
    </ModalShell>
  );
};

/* ---------- Sucesso ---------- */
export const SuccessModal = ({ sale, onNew }: any) => (
  <ModalShell title="Venda concluída" badge="✓" onClose={onNew} size="narrow"
    footer={
      <button className="btn btn-sm btn-primary" onClick={onNew} style={{ width: "100%", justifyContent: "center", height: 48, fontSize: 14 }}>
        <Icon name="refresh" size={14}/> Nova venda (Enter)
      </button>
    }
  >
    <div className="success-card">
      <div className="icon"><Icon name="check" size={32} stroke={2}/></div>
      <h2>Venda finalizada</h2>
      <div className="sub">Cupom {sale.cupom} · {sale.timestamp}</div>
      <div className="total">{formatBRL(sale.total)}</div>

      <div className="ticket">
        <div className="tk-row"><span className="lb">Itens</span><span className="vl">{sale.itemCount}</span></div>
        <div className="tk-row"><span className="lb">Subtotal</span><span className="vl">{formatBRL(sale.subtotal)}</span></div>
        {sale.discount > 0 && <div className="tk-row"><span className="lb">Desconto</span><span className="vl" style={{ color: "var(--warn)" }}>−{formatBRL(sale.discount)}</span></div>}
        {sale.surcharge > 0 && <div className="tk-row"><span className="lb">Acréscimo</span><span className="vl" style={{ color: "var(--info)" }}>+{formatBRL(sale.surcharge)}</span></div>}
        <div className="tk-row divider"><span className="lb">Pago</span><span className="vl">{formatBRL(sale.paid)}</span></div>
        {sale.change > 0 && <div className="tk-row"><span className="lb">Troco</span><span className="vl" style={{ color: "var(--accent)" }}>{formatBRL(sale.change)}</span></div>}
        <div className="tk-row" style={{ marginTop: 4, fontSize: 11, color: "var(--text-3)" }}>
          <span className="lb">Pagamento</span>
          <span className="vl" style={{ fontFamily: "var(--font-sans)", fontWeight: 500 }}>
            {sale.payments.map((p: any) => p.method.nome).join(" + ")}
          </span>
        </div>
        {sale.customer && (
          <div className="tk-row" style={{ fontSize: 11, color: "var(--text-3)" }}>
            <span className="lb">Cliente</span>
            <span className="vl" style={{ fontFamily: "var(--font-sans)", fontWeight: 500 }}>{sale.customer.nome}</span>
          </div>
        )}
      </div>
    </div>
  </ModalShell>
);

/* ---------- F6 Troca e devolução ---------- */
export const ReturnModal = ({ pastSales, onClose, onConfirm }: any) => {
  const [tab, setTab] = useState("devolucao");
  const [step, setStep] = useState("search");
  const [cupomQ, setCupomQ] = useState("");
  const [foundSale, setFoundSale] = useState<any>(null);
  const [selection, setSelection] = useState<any>({});
  const [creditMode, setCreditMode] = useState("estorno");

  const finalizable = pastSales.filter((s: any) => s.status === "finalizada");

  const doSearch = () => {
    const q = cupomQ.trim().replace(/^#/, "").padStart(6, "0");
    const sale = finalizable.find((s: any) => s.cupom === q || s.cupom.endsWith(q.replace(/^0+/, "")));
    if (sale) {
      setFoundSale(sale);
      const initial: any = {};
      sale.items.forEach((_: any, i: number) => { initial[i] = { selected: false, qty: 1, reason: "defeito" }; });
      setSelection(initial);
      setStep("items");
    } else {
      setFoundSale("notfound");
    }
  };

  const toggleItem = (i: number) => {
    setSelection((s: any) => ({ ...s, [i]: { ...s[i], selected: !s[i].selected } }));
  };
  const setItemQty = (i: number, q: string) => {
    const orig = foundSale.items[i];
    const max = orig.qtd;
    setSelection((s: any) => ({ ...s, [i]: { ...s[i], qty: Math.max(1, Math.min(max, parseInt(q, 10) || 1)) } }));
  };
  const setItemReason = (i: number, r: string) => {
    setSelection((s: any) => ({ ...s, [i]: { ...s[i], reason: r } }));
  };

  const selectedRows = useMemo(() => {
    if (!foundSale || typeof foundSale !== "object") return [];
    return foundSale.items
      .map((it: any, idx: number) => ({ it, idx, sel: selection[idx] }))
      .filter((r: any) => r.sel?.selected);
  }, [foundSale, selection]);

  const totalDevolvido = selectedRows.reduce((s: number, r: any) => s + r.sel.qty * r.it.preco, 0);

  const confirm = () => {
    if (selectedRows.length === 0) return;
    const lines = selectedRows.map((r: any) => ({
      id: `RET-${r.it.id}-${Date.now()}-${r.idx}`,
      baseId: r.it.id,
      codigo: r.it.codigo,
      nome: r.it.nome,
      icone: r.it.icone,
      categoria: r.it.categoria || "Devolução",
      qtd: r.sel.qty,
      preco: -Math.abs(r.it.preco),
      descontoItem: 0,
      isReturn: true,
      returnFrom: foundSale.cupom,
      reason: r.sel.reason,
      creditMode,
      addedAt: Date.now(),
    }));
    onConfirm({ mode: tab, lines, originalCupom: foundSale.cupom, creditMode, totalDevolvido });
  };

  const REASONS = [
    { id: "defeito",       nome: "Defeito" },
    { id: "arrependimento",nome: "Arrependimento" },
    { id: "tamanho",       nome: "Tamanho/Modelo" },
    { id: "outro",         nome: "Outro" },
  ];

  return (
    <ModalShell
      title={tab === "troca" ? "Troca de produto" : "Devolução de produto"}
      badge="F6" onClose={onClose} size="wide"
      footer={
        step === "items" ? (
          <>
            <button className="btn btn-sm btn-ghost" onClick={() => { setStep("search"); setFoundSale(null); setCupomQ(""); }}>
              <Icon name="arrow-right" size={12} style={{ transform: "rotate(180deg)" }}/> Outro cupom
            </button>
            <div className="grow"/>
            <div className="muted" style={{ fontSize: 12, marginRight: 8 }}>
              {selectedRows.length === 0
                ? "Selecione itens para devolver"
                : <>Devolução: <strong style={{ color: "var(--warn)" }}>{formatBRL(totalDevolvido)}</strong></>}
            </div>
            <button
              className="btn btn-sm btn-primary"
              onClick={confirm}
              disabled={selectedRows.length === 0}
              style={{ opacity: selectedRows.length === 0 ? 0.4 : 1 }}
            >
              <Icon name="check" size={14}/>
              {tab === "troca" ? "Aplicar e continuar venda" : "Aplicar devolução no carrinho"}
            </button>
          </>
        ) : null
      }
    >
      <div className="tab-bar">
        <button className={`tab ${tab === "devolucao" ? "active" : ""}`} onClick={() => setTab("devolucao")}>
          <Icon name="rotate" size={14}/> Devolução
        </button>
        <button className={`tab ${tab === "troca" ? "active" : ""}`} onClick={() => setTab("troca")}>
          <Icon name="swap" size={14}/> Troca
        </button>
        <div className="grow"/>
        <div className="muted" style={{ fontSize: 12 }}>
          {tab === "troca"
            ? "Devolve o item e continua a venda no mesmo cupom."
            : "Gera crédito ou estorno ao cliente."}
        </div>
      </div>

      {step === "search" && (
        <div style={{ marginTop: 14 }}>
          <div className="field">
            <label>Número do cupom original</label>
            <div className="row" style={{ gap: 8 }}>
              <input
                data-autofocus className="mono"
                placeholder="ex: 001035"
                value={cupomQ}
                onChange={(e) => setCupomQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") doSearch(); }}
                style={{ flex: 1, height: 48 }}
              />
              <button className="btn btn-primary" onClick={doSearch} style={{ height: 48 }}>
                <Icon name="search" size={14}/> Buscar cupom
              </button>
            </div>
          </div>

          {foundSale === "notfound" && (
            <div className="callout danger" style={{ marginTop: 12 }}>
              <Icon name="alert" size={14}/>
              <div>Cupom <strong>#{cupomQ}</strong> não encontrado no turno atual.</div>
            </div>
          )}

          <div className="card-title" style={{ marginTop: 22 }}>Cupons do turno</div>
          <div className="prod-table">
            <div className="prod-thead" style={{ gridTemplateColumns: "110px 1fr 130px 110px 120px" }}>
              <div>Cupom</div>
              <div>Cliente</div>
              <div>Horário</div>
              <div style={{ textAlign: "right" }}>Total</div>
              <div></div>
            </div>
            <div className="prod-scroll" style={{ maxHeight: "30vh" }}>
              {finalizable.map((s: any) => (
                <div
                  key={s.cupom}
                  className="prod-row"
                  style={{ gridTemplateColumns: "110px 1fr 130px 110px 120px" }}
                  onClick={() => { setCupomQ(s.cupom); setFoundSale(s); const initial: any = {}; s.items.forEach((_: any, i: number) => { initial[i] = { selected: false, qty: 1, reason: "defeito" }; }); setSelection(initial); setStep("items"); }}
                >
                  <div className="code">#{s.cupom}</div>
                  <div className="nm">{s.customer?.nome || "Consumidor final"}<small>{s.items.length} itens</small></div>
                  <div className="cat" style={{ textTransform: "none", letterSpacing: 0, fontFamily: "var(--font-mono)" }}>{s.timestamp}</div>
                  <div className="pr">{formatBRL(s.total)}</div>
                  <div className="add">
                    <button className="btn btn-xs btn-ghost">
                      Selecionar <Icon name="arrow-right" size={12}/>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {step === "items" && foundSale && typeof foundSale === "object" && (
        <>
          <div className="return-sale-head">
            <div>
              <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 600 }}>Cupom original</div>
              <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 16, marginTop: 2 }}>
                #{foundSale.cupom}
              </div>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 600 }}>Cliente</div>
              <div style={{ marginTop: 2 }}>{foundSale.customer?.nome || "Consumidor final"}</div>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 600 }}>Horário</div>
              <div style={{ fontFamily: "var(--font-mono)", marginTop: 2 }}>{foundSale.timestamp}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 600 }}>Total pago</div>
              <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 18, color: "var(--accent)" }}>{formatBRL(foundSale.total)}</div>
            </div>
          </div>

          <div className="card-title" style={{ marginTop: 16 }}>Itens da venda · selecione o que devolver</div>

          <div className="return-items">
            {foundSale.items.map((it: any, idx: number) => {
              const sel = selection[idx]?.selected;
              return (
                <div key={idx} className={`return-row ${sel ? "selected" : ""}`}>
                  <label className="return-check">
                    <input type="checkbox" checked={!!sel} onChange={() => toggleItem(idx)} />
                    <span></span>
                  </label>
                  <div className="ic">{it.icone}</div>
                  <div className="info">
                    <div className="nm">{it.nome}</div>
                    <div className="sub">{it.codigo} · vendido {it.qtd} un · {formatBRL(it.preco)} cada</div>
                  </div>
                  {sel ? (
                    <>
                      <div className="qty-ctl">
                        <button onClick={() => setItemQty(idx, String((selection[idx]?.qty || 1) - 1))}><Icon name="minus" size={12}/></button>
                        <input
                          className="mono"
                          value={selection[idx]?.qty || 1}
                          onChange={(e) => setItemQty(idx, e.target.value)}
                        />
                        <button onClick={() => setItemQty(idx, String((selection[idx]?.qty || 1) + 1))}><Icon name="plus" size={12}/></button>
                      </div>
                      <select className="reason-select" value={selection[idx]?.reason || "defeito"} onChange={(e) => setItemReason(idx, e.target.value)}>
                        {REASONS.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
                      </select>
                      <div className="ret-amt">−{formatBRL((selection[idx]?.qty || 1) * it.preco)}</div>
                    </>
                  ) : (
                    <div style={{ gridColumn: "4 / span 3", color: "var(--text-3)", fontSize: 12, textAlign: "right" }}>
                      Marque a caixa para devolver este item
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {tab === "devolucao" && selectedRows.length > 0 && (
            <div className="credit-mode">
              <div className="card-title" style={{ marginTop: 16 }}>Forma do reembolso</div>
              <div className="segmented" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", width: "100%" }}>
                <button className={creditMode === "estorno" ? "active" : ""} onClick={() => setCreditMode("estorno")}>
                  <Icon name="rotate" size={12} style={{ marginRight: 6 }}/> Estorno na mesma forma de pagamento
                </button>
                <button className={creditMode === "credito" ? "active" : ""} onClick={() => setCreditMode("credito")}>
                  <Icon name="wallet" size={12} style={{ marginRight: 6 }}/> Gerar crédito ao cliente
                </button>
              </div>
            </div>
          )}

          {tab === "troca" && selectedRows.length > 0 && (
            <div className="callout" style={{ marginTop: 16 }}>
              <Icon name="info" size={14}/>
              <div>O valor devolvido será descontado da nova venda automaticamente. Adicione os produtos da troca em seguida.</div>
            </div>
          )}
        </>
      )}
    </ModalShell>
  );
};

/* ---------- Sangria / Reforço ---------- */
export const CashOpsModal = ({ ops, openingBalance, onClose, onAdd }: any) => {
  const [type, setType] = useState("reforco");
  const [val, setVal] = useState("");
  const [just, setJust] = useState("");

  const reforco = ops.filter((o: any) => o.type === "reforco").reduce((s: number, o: any) => s + o.value, 0);
  const sangria = ops.filter((o: any) => o.type === "sangria").reduce((s: number, o: any) => s + o.value, 0);
  const saldoOps = openingBalance + reforco - sangria;

  const submit = () => {
    const v = parseAmount(val);
    if (!v || v <= 0 || !just.trim()) return;
    onAdd({
      id: "M" + String(Date.now()).slice(-5),
      type,
      value: v,
      just: just.trim(),
      time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    });
    setVal("");
    setJust("");
  };

  const typeLabel = (t: string) =>
    t === "abertura" ? "Abertura" : t === "reforco" ? "Reforço" : "Sangria";
  const typeIcon = (t: string) =>
    t === "abertura" ? "vault" : t === "reforco" ? "arrow-down" : "arrow-up";

  return (
    <ModalShell title="Sangria e reforço de caixa" badge="Caixa" onClose={onClose}>
      <div className="cash-top">
        <div className="cash-card">
          <div className="lb">Saldo operacional</div>
          <div className="vl">{formatBRL(saldoOps)}</div>
          <div className="muted" style={{ fontSize: 11 }}>Abertura {formatBRL(openingBalance)} · {ops.length} movimentações</div>
        </div>
        <div className="cash-card good">
          <div className="lb"><Icon name="arrow-down" size={11}/> Reforços</div>
          <div className="vl">{formatBRL(reforco)}</div>
        </div>
        <div className="cash-card warn">
          <div className="lb"><Icon name="arrow-up" size={11}/> Sangrias</div>
          <div className="vl">{formatBRL(sangria)}</div>
        </div>
      </div>

      <div className="card-title" style={{ marginTop: 18 }}>Nova movimentação</div>
      <div className="segmented" style={{ width: "100%", display: "grid", gridTemplateColumns: "1fr 1fr", marginBottom: 12 }}>
        <button className={type === "reforco" ? "active" : ""} onClick={() => setType("reforco")}>
          <Icon name="arrow-down" size={12} style={{ marginRight: 6 }}/> Reforço (entrada)
        </button>
        <button className={type === "sangria" ? "active" : ""} onClick={() => setType("sangria")}>
          <Icon name="arrow-up" size={12} style={{ marginRight: 6 }}/> Sangria (saída)
        </button>
      </div>
      <div className="field-grid" style={{ gridTemplateColumns: "180px 1fr auto", alignItems: "end" }}>
        <div className="field">
          <label>Valor (R$)</label>
          <input data-autofocus className="mono" placeholder="0,00" value={val} onChange={(e) => setVal(e.target.value)} />
        </div>
        <div className="field">
          <label>Justificativa</label>
          <input
            placeholder={type === "sangria" ? "Ex: recolhimento ao cofre" : "Ex: reforço de troco"}
            value={just} onChange={(e) => setJust(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          />
        </div>
        <button className="btn btn-primary" onClick={submit} disabled={!parseAmount(val) || !just.trim()} style={{ opacity: (!parseAmount(val) || !just.trim()) ? 0.4 : 1 }}>
          <Icon name="plus" size={14}/> Registrar
        </button>
      </div>

      <div className="card-title" style={{ marginTop: 22 }}>Movimentações do turno</div>
      <div className="ops-list">
        {ops.length === 0 && <div className="muted" style={{ padding: 18, textAlign: "center", border: "1px dashed var(--line-2)", borderRadius: 10 }}>Sem movimentações.</div>}
        {ops.map((o: any) => (
          <div key={o.id} className={`op-row op-${o.type}`}>
            <div className="ic"><Icon name={typeIcon(o.type)} size={14}/></div>
            <div className="info">
              <div className="nm">{typeLabel(o.type)}</div>
              <div className="sub">{o.just}</div>
            </div>
            <div className="time">{o.time}</div>
            <div className="amt">
              {o.type === "sangria" ? "−" : "+"}{formatBRL(o.value)}
            </div>
          </div>
        ))}
      </div>
    </ModalShell>
  );
};

/* ---------- Fechamento de caixa ---------- */
export const CashCloseModal = ({ openingBalance, ops, sales, fiscalSummary, onClose, onConfirm }: any) => {
  const finalizadas = sales.filter((s: any) => s.status === "finalizada");
  const canceladas = sales.filter((s: any) => s.status === "cancelada");
  const devolucoes = sales.filter((s: any) => s.status === "devolucao" || (s.total < 0));

  const vendasTotal = finalizadas.reduce((s: number, x: any) => s + x.total, 0);
  const devolucoesTotal = devolucoes.reduce((s: number, x: any) => s + Math.abs(x.total), 0);

  const byMethod = useMemo(() => {
    const map: Record<string, any> = {};
    finalizadas.forEach((s: any) => {
      (s.payments || []).forEach((p: any) => {
        const id = p.method.id;
        if (!map[id]) map[id] = { nome: p.method.nome, icon: p.method.icon, total: 0 };
        map[id].total += p.amount;
      });
    });
    return Object.values(map);
  }, [finalizadas]);

  const reforcos = ops.filter((o: any) => o.type === "reforco").reduce((s: number, o: any) => s + o.value, 0);
  const sangrias = ops.filter((o: any) => o.type === "sangria").reduce((s: number, o: any) => s + o.value, 0);
  const dinheiroSistema = (byMethod.find((m: any) => m.nome === "Dinheiro")?.total || 0) + openingBalance + reforcos - sangrias;

  const [valorFisico, setValorFisico] = useState("");
  const diff = parseAmount(valorFisico) - dinheiroSistema;

  return (
    <ModalShell
      title="Fechamento de caixa" badge="Caixa" onClose={onClose} size="wide"
      footer={
        <>
          <button className="btn btn-sm btn-ghost" onClick={() => window.print()}>
            <Icon name="printer" size={14}/> Imprimir relatório
          </button>
          <div className="grow"/>
          <button className="btn btn-sm btn-ghost" onClick={onClose}>Voltar</button>
          <button className="btn btn-sm btn-danger" onClick={onConfirm}>
            <Icon name="lock" size={14}/> Confirmar fechamento
          </button>
        </>
      }
    >
      <div className="close-grid">
        <div className="close-section">
          <div className="card-title">Resumo do turno</div>
          <div className="close-stats">
            <div className="cstat"><div className="lb">Vendas</div><div className="vl">{finalizadas.length}</div></div>
            <div className="cstat"><div className="lb">Itens vendidos</div><div className="vl">{finalizadas.reduce((s: number, x: any) => s + x.itemCount, 0)}</div></div>
            <div className="cstat"><div className="lb">Ticket médio</div><div className="vl">{formatBRL(finalizadas.length > 0 ? vendasTotal / finalizadas.length : 0)}</div></div>
            <div className="cstat"><div className="lb">Faturamento</div><div className="vl strong">{formatBRL(vendasTotal)}</div></div>
            <div className="cstat"><div className="lb">Devoluções</div><div className="vl" style={{ color: "var(--warn)" }}>{devolucoes.length} · {formatBRL(devolucoesTotal)}</div></div>
            <div className="cstat"><div className="lb">Canceladas</div><div className="vl" style={{ color: "var(--danger)" }}>{canceladas.length}</div></div>
            <div className="cstat"><div className="lb">Reforços</div><div className="vl" style={{ color: "var(--accent)" }}>{formatBRL(reforcos)}</div></div>
            <div className="cstat"><div className="lb">Sangrias</div><div className="vl" style={{ color: "var(--warn)" }}>{formatBRL(sangrias)}</div></div>
          </div>

          <div className="card-title" style={{ marginTop: 18 }}>Composição fiscal</div>
          <div className="close-fiscal">
            <div className="fc-row"><div className="ic"><Icon name="receipt" size={14}/></div><div className="nm">Com NF-e</div><div className="vl">{fiscalSummary.nfe} cupons · {formatBRL(fiscalSummary.nfeTotal)}</div></div>
            <div className="fc-row"><div className="ic"><Icon name="doc" size={14}/></div><div className="nm">Sem nota fiscal</div><div className="vl">{fiscalSummary.simples} cupons · {formatBRL(fiscalSummary.simplesTotal)}</div></div>
          </div>
        </div>

        <div className="close-section">
          <div className="card-title">Conferência por forma de pagamento</div>
          <div className="pm-list">
            {byMethod.length === 0 && <div className="muted" style={{ padding: 18, textAlign: "center", border: "1px dashed var(--line-2)", borderRadius: 10 }}>Sem vendas neste turno.</div>}
            {byMethod.map((m: any) => (
              <div key={m.nome} className="pm-row">
                <div className="ic"><Icon name={m.icon} size={14}/></div>
                <div className="nm">{m.nome}</div>
                <div className="vl">{formatBRL(m.total)}</div>
              </div>
            ))}
          </div>

          <div className="cash-check">
            <div className="card-title" style={{ marginTop: 14 }}>Conferência de dinheiro</div>
            <div className="cc-grid">
              <div className="cc-cell">
                <div className="lb">Abertura</div>
                <div className="vl">{formatBRL(openingBalance)}</div>
              </div>
              <div className="cc-cell">
                <div className="lb">+ Vendas dinheiro</div>
                <div className="vl" style={{ color: "var(--accent)" }}>+{formatBRL(byMethod.find((m: any) => m.nome === "Dinheiro")?.total || 0)}</div>
              </div>
              <div className="cc-cell">
                <div className="lb">+ Reforços</div>
                <div className="vl" style={{ color: "var(--accent)" }}>+{formatBRL(reforcos)}</div>
              </div>
              <div className="cc-cell">
                <div className="lb">− Sangrias</div>
                <div className="vl" style={{ color: "var(--warn)" }}>−{formatBRL(sangrias)}</div>
              </div>
              <div className="cc-cell strong">
                <div className="lb">Esperado no caixa</div>
                <div className="vl">{formatBRL(dinheiroSistema)}</div>
              </div>
              <div className="cc-cell input">
                <div className="lb">Valor físico contado</div>
                <input
                  data-autofocus
                  className="mono"
                  placeholder="0,00"
                  value={valorFisico}
                  onChange={(e) => setValorFisico(e.target.value)}
                />
              </div>
            </div>

            {valorFisico !== "" && (
              <div className={`diff-row ${Math.abs(diff) < 0.01 ? "ok" : diff < 0 ? "neg" : "pos"}`}>
                {Math.abs(diff) < 0.01
                  ? <><Icon name="check" size={14}/> Caixa confere exatamente.</>
                  : diff > 0
                    ? <><Icon name="alert" size={14}/> Sobra de <strong>{formatBRL(diff)}</strong> no caixa.</>
                    : <><Icon name="alert" size={14}/> Falta de <strong>{formatBRL(Math.abs(diff))}</strong> no caixa.</>}
              </div>
            )}
          </div>
        </div>
      </div>
    </ModalShell>
  );
};

/* ---------- Histórico do turno ---------- */
export const TurnHistoryModal = ({ sales, onClose, onCancel }: any) => {
  const [filter, setFilter] = useState("todas");
  const filtered = useMemo(() => {
    if (filter === "todas") return sales;
    if (filter === "devolucoes") return sales.filter((s: any) => s.status === "devolucao" || s.total < 0);
    return sales.filter((s: any) => s.status === filter);
  }, [sales, filter]);

  const counts: Record<string, number> = {
    todas: sales.length,
    finalizada: sales.filter((s: any) => s.status === "finalizada").length,
    cancelada: sales.filter((s: any) => s.status === "cancelada").length,
    devolucoes: sales.filter((s: any) => s.status === "devolucao" || s.total < 0).length,
  };

  const statusBadge = (s: any) => {
    if (s.status === "cancelada") return <span className="status-badge danger">Cancelada</span>;
    if (s.status === "devolucao" || s.total < 0) return <span className="status-badge warn">Devolução</span>;
    return <span className="status-badge ok">Finalizada</span>;
  };

  return (
    <ModalShell title="Histórico do turno" badge="Turno" onClose={onClose} size="wide">
      <div className="filter-row">
        <Icon name="filter" size={14} style={{ color: "var(--text-3)" }}/>
        {[
          { id: "todas",      nome: "Todas" },
          { id: "finalizada", nome: "Finalizadas" },
          { id: "cancelada",  nome: "Canceladas" },
          { id: "devolucoes", nome: "Devoluções" },
        ].map((f) => (
          <button key={f.id} className={`cat-pill ${filter === f.id ? "active" : ""}`} onClick={() => setFilter(f.id)}>
            {f.nome} <span style={{ marginLeft: 4, fontFamily: "var(--font-mono)", fontSize: 10, opacity: 0.8 }}>{counts[f.id]}</span>
          </button>
        ))}
      </div>

      <div className="prod-table" style={{ marginTop: 14 }}>
        <div className="prod-thead" style={{ gridTemplateColumns: "110px 90px 1fr 150px 120px 120px 110px" }}>
          <div>Cupom</div>
          <div>Hora</div>
          <div>Cliente</div>
          <div>Pagamento</div>
          <div style={{ textAlign: "right" }}>Valor</div>
          <div>Status</div>
          <div></div>
        </div>
        <div className="prod-scroll" style={{ maxHeight: "52vh" }}>
          {filtered.length === 0 && (
            <div style={{ padding: 28, textAlign: "center", color: "var(--text-2)" }}>
              Nenhuma venda encontrada no filtro selecionado.
            </div>
          )}
          {filtered.map((s: any) => (
            <div key={s.cupom} className="prod-row" style={{ gridTemplateColumns: "110px 90px 1fr 150px 120px 120px 110px" }}>
              <div className="code">#{s.cupom}</div>
              <div className="cat" style={{ textTransform: "none", letterSpacing: 0, fontFamily: "var(--font-mono)" }}>{s.timestamp}</div>
              <div className="nm">{s.customer?.nome || "Consumidor final"}<small>{s.itemCount} itens</small></div>
              <div className="cat" style={{ textTransform: "none", letterSpacing: 0, fontWeight: 500 }}>
                {(s.payments || []).map((p: any) => p.method.nome).join(" + ") || "—"}
              </div>
              <div className="pr" style={{ color: s.status === "cancelada" ? "var(--text-3)" : s.total < 0 ? "var(--warn)" : "var(--text-0)", textDecoration: s.status === "cancelada" ? "line-through" : "none" }}>
                {formatBRL(s.total)}
              </div>
              <div>{statusBadge(s)}</div>
              <div style={{ textAlign: "right" }}>
                {s.status === "finalizada" && (
                  <button
                    className="btn btn-xs btn-ghost"
                    onClick={() => onCancel(s.cupom)}
                    title="Cancelar / estornar venda"
                  >
                    <Icon name="ban" size={11}/> Estornar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </ModalShell>
  );
};

/* ---------- F5 melhorado: Cliente Fidelidade ---------- */
export const LoyaltyModal = ({ customer, currentTotal, onClose, onSet }: any) => {
  const [q, setQ] = useState(customer?.doc || "");
  const [found, setFound] = useState<any>(customer || null);
  const [notFound, setNotFound] = useState(false);

  const search = () => {
    const term = q.trim();
    if (!term) return;
    const c = LOYALTY_CUSTOMERS.find((x) =>
      x.cpf.replace(/\D/g, "").includes(term.replace(/\D/g, "")) ||
      x.nome.toLowerCase().includes(term.toLowerCase())
    );
    if (c) { setFound(c); setNotFound(false); }
    else { setFound(null); setNotFound(true); }
  };

  useEffect(() => { setNotFound(false); }, [q]);

  const pointsEarned = found ? Math.floor((currentTotal || 0) * POINTS_PER_REAL) : 0;
  const newTotal = found ? found.pontos + pointsEarned : 0;

  return (
    <ModalShell
      title="Cliente · Programa de fidelidade" badge="F5" onClose={onClose}
      footer={
        <>
          <button className="btn btn-sm btn-ghost" onClick={() => onSet(null)}>Remover identificação</button>
          <div className="grow"/>
          <button
            className="btn btn-sm btn-primary"
            onClick={() => found && onSet({ nome: found.nome, doc: found.cpf, tel: found.tel, loyalty: found })}
            disabled={!found}
            style={{ opacity: found ? 1 : 0.4 }}
          >
            <Icon name="check" size={14}/> Identificar cliente
          </button>
        </>
      }
    >
      <div className="field">
        <label>Buscar por CPF ou nome</label>
        <div className="row" style={{ gap: 8 }}>
          <input
            data-autofocus className="mono"
            placeholder="000.000.000-00"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") search(); }}
            style={{ flex: 1, height: 44 }}
          />
          <button className="btn btn-primary btn-sm" onClick={search} style={{ height: 44 }}>
            <Icon name="search" size={14}/> Buscar
          </button>
        </div>
      </div>

      {notFound && (
        <div className="callout warn" style={{ marginTop: 12 }}>
          <Icon name="alert" size={14}/>
          <div>Cliente não localizado. Verifique o CPF ou cadastre um novo no ERP.</div>
        </div>
      )}

      {found && (
        <div className="loyalty-card" style={{ marginTop: 14 }}>
          <div className="lc-head">
            <div className="lc-avatar" style={{ background: TIER_COLORS[found.tier] }}>
              <Icon name="user" size={18}/>
            </div>
            <div className="lc-info">
              <div className="lc-name">{found.nome}</div>
              <div className="lc-meta">
                {found.cpf} · {found.tel} · cliente desde {found.desde}
              </div>
            </div>
            <div className="lc-tier" style={{ color: TIER_COLORS[found.tier], borderColor: TIER_COLORS[found.tier] }}>
              <Icon name="star" size={12}/> {found.tier}
            </div>
          </div>

          <div className="lc-points">
            <div className="pts-cell">
              <div className="lb">Pontos atuais</div>
              <div className="vl">{found.pontos.toLocaleString("pt-BR")}</div>
            </div>
            <div className="pts-cell good">
              <div className="lb">+ Ganho nesta venda</div>
              <div className="vl">+{pointsEarned.toLocaleString("pt-BR")}</div>
              <div className="sub">{formatBRL(currentTotal || 0)} × {POINTS_PER_REAL} pt/R$</div>
            </div>
            <div className="pts-cell strong">
              <div className="lb">Saldo após venda</div>
              <div className="vl">{newTotal.toLocaleString("pt-BR")}</div>
            </div>
          </div>

          <div className="card-title" style={{ marginTop: 14 }}>Histórico recente</div>
          <div className="lc-history">
            {found.historico.map((h: any, i: number) => (
              <div key={i} className="lh-row">
                <div className="dt">{h.data}</div>
                <div className="cp">#{h.cupom}</div>
                <div className="tt">{formatBRL(h.total)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!found && !notFound && (
        <div className="muted" style={{ marginTop: 14, fontSize: 12 }}>
          <Icon name="info" size={12} style={{ verticalAlign: "-2px", marginRight: 4 }}/>
          Clientes de exemplo:&nbsp;
          {LOYALTY_CUSTOMERS.map((c, i) => (
            <button
              key={c.cpf}
              className="cat-pill"
              style={{ marginRight: 4, fontFamily: "var(--font-mono)" }}
              onClick={() => { setQ(c.cpf); setFound(c); }}
            >
              {c.cpf}
            </button>
          ))}
        </div>
      )}
    </ModalShell>
  );
};

