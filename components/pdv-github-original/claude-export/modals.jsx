/* ============== Modais — OmniGestão Pro PDV ============== */
const { useState, useEffect, useRef, useMemo, useCallback } = React;

const formatBRL = (n) =>
  (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const formatNum = (n, d = 2) =>
  (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const parseAmount = (s) => {
  if (typeof s === "number") return s;
  if (!s) return 0;
  const cleaned = String(s).replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
};

/* ---------- Modal shell ---------- */
const ModalShell = ({ title, badge, onClose, children, size = "default", footer }) => {
  const ref = useRef(null);
  useEffect(() => {
    const t = setTimeout(() => {
      const el = ref.current?.querySelector("[data-autofocus]");
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
const SearchModal = ({ initialQuery, onClose, onPick }) => {
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

  const onKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setFocusIdx((i) => Math.min(i + 1, results.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setFocusIdx((i) => Math.max(i - 1, 0)); }
    if (e.key === "Enter") {
      e.preventDefault();
      if (results[focusIdx]) onPick(results[focusIdx]);
    }
  };

  return (
    <ModalShell title="Busca avançada de produtos" badge="F3" onClose={onClose} size="wide">
      <div className="search-box">
        <span className="si"><Icon name="search" size={16}/></span>
        <input
          data-autofocus
          placeholder="Buscar por nome, código, EAN ou categoria…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
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
const QtyModal = ({ item, onClose, onSave }) => {
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
const CustomerModal = ({ customer, onClose, onSave }) => {
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

const DiscountModal = ({ subtotal, current, onClose, onSave }) => {
  const [tipo, setTipo] = useState(current?.tipo || "desconto"); // desconto | acrescimo
  const [modo, setModo] = useState(current?.modo || "valor"); // valor | percent
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

  // reset autorização ao alterar tipo/valor
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
const CpfNotaModal = ({ current, onClose, onSave }) => {
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
const CancelModal = ({ itensCount, onClose, onConfirm }) => (
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
const SuspendModal = ({ suspended, currentCount, onClose, onSuspend, onResume, onDiscard }) => {
  const total = (items) => items.reduce((s, i) => s + i.qtd * i.preco, 0);
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
          {suspended.map((s) => (
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
const METHODS = [
  { id: "dinheiro",   nome: "Dinheiro",        ds: "Cédulas e moedas", icon: "cash",   k: "1" },
  { id: "pix",        nome: "PIX",             ds: "Chave / QR Code",  icon: "pix",    k: "2" },
  { id: "debito",     nome: "Cartão débito",   ds: "Aprovação direta", icon: "card",   k: "3" },
  { id: "credito",    nome: "Cartão crédito",  ds: "À vista ou parcelado", icon: "card", k: "4" },
  { id: "crediario",  nome: "Crediário",       ds: "Conta do cliente", icon: "wallet", k: "5" },
];

const PaymentModal = ({ total, customer, onClose, onComplete }) => {
  const [payments, setPayments] = useState([]);
  const [activeMethod, setActiveMethod] = useState(null);
  const [amountStr, setAmountStr] = useState("");
  const amtRef = useRef(null);

  const paid = payments.reduce((s, p) => s + p.amount, 0);
  const remaining = Math.max(0, total - paid);
  const change = Math.max(0, paid - total);
  const isComplete = paid >= total - 0.0001;

  const startMethod = (m) => {
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

  const removePayment = (id) => setPayments((p) => p.filter((x) => x.id !== id));

  useEffect(() => {
    const onKey = (e) => {
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
const SuccessModal = ({ sale, onNew }) => (
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
            {sale.payments.map((p) => p.method.nome).join(" + ")}
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

/* expose */
Object.assign(window, {
  SearchModal, QtyModal, CustomerModal, DiscountModal,
  CpfNotaModal, CancelModal, SuspendModal, PaymentModal, SuccessModal,
  formatBRL, formatNum, parseAmount, METHODS,
});
