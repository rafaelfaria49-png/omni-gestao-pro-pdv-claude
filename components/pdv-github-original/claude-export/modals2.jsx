/* ============== Modais avançados — OmniGestão Pro PDV ============== */

/* ---------- F6 Troca e devolução ---------- */
const ReturnModal = ({ pastSales, onClose, onConfirm }) => {
  const [tab, setTab] = useState("devolucao"); // "devolucao" | "troca"
  const [step, setStep] = useState("search"); // "search" | "items"
  const [cupomQ, setCupomQ] = useState("");
  const [foundSale, setFoundSale] = useState(null);
  const [selection, setSelection] = useState({}); // {itemIdx: { qty, reason }}
  const [creditMode, setCreditMode] = useState("estorno"); // "estorno" | "credito"

  const finalizable = pastSales.filter((s) => s.status === "finalizada");

  const doSearch = () => {
    const q = cupomQ.trim().replace(/^#/, "").padStart(6, "0");
    const sale = finalizable.find((s) => s.cupom === q || s.cupom.endsWith(q.replace(/^0+/, "")));
    if (sale) {
      setFoundSale(sale);
      const initial = {};
      sale.items.forEach((_, i) => { initial[i] = { selected: false, qty: 1, reason: "defeito" }; });
      setSelection(initial);
      setStep("items");
    } else {
      setFoundSale("notfound");
    }
  };

  const toggleItem = (i) => {
    setSelection((s) => ({ ...s, [i]: { ...s[i], selected: !s[i].selected } }));
  };
  const setItemQty = (i, q) => {
    const orig = foundSale.items[i];
    const max = orig.qtd;
    setSelection((s) => ({ ...s, [i]: { ...s[i], qty: Math.max(1, Math.min(max, parseInt(q, 10) || 1)) } }));
  };
  const setItemReason = (i, r) => {
    setSelection((s) => ({ ...s, [i]: { ...s[i], reason: r } }));
  };

  const selectedRows = useMemo(() => {
    if (!foundSale || typeof foundSale !== "object") return [];
    return foundSale.items
      .map((it, idx) => ({ it, idx, sel: selection[idx] }))
      .filter((r) => r.sel?.selected);
  }, [foundSale, selection]);

  const totalDevolvido = selectedRows.reduce((s, r) => s + r.sel.qty * r.it.preco, 0);

  const confirm = () => {
    if (selectedRows.length === 0) return;
    const lines = selectedRows.map((r) => ({
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
              {finalizable.map((s) => (
                <div
                  key={s.cupom}
                  className="prod-row"
                  style={{ gridTemplateColumns: "110px 1fr 130px 110px 120px" }}
                  onClick={() => { setCupomQ(s.cupom); setFoundSale(s); const initial = {}; s.items.forEach((_, i) => { initial[i] = { selected: false, qty: 1, reason: "defeito" }; }); setSelection(initial); setStep("items"); }}
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
            {foundSale.items.map((it, idx) => {
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
                        <button onClick={() => setItemQty(idx, (selection[idx]?.qty || 1) - 1)}><Icon name="minus" size={12}/></button>
                        <input
                          className="mono"
                          value={selection[idx]?.qty || 1}
                          onChange={(e) => setItemQty(idx, e.target.value)}
                        />
                        <button onClick={() => setItemQty(idx, (selection[idx]?.qty || 1) + 1)}><Icon name="plus" size={12}/></button>
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
const CashOpsModal = ({ ops, openingBalance, onClose, onAdd }) => {
  const [type, setType] = useState("reforco"); // "reforco" | "sangria"
  const [val, setVal] = useState("");
  const [just, setJust] = useState("");

  const reforco = ops.filter((o) => o.type === "reforco").reduce((s, o) => s + o.value, 0);
  const sangria = ops.filter((o) => o.type === "sangria").reduce((s, o) => s + o.value, 0);
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

  const typeLabel = (t) =>
    t === "abertura" ? "Abertura" : t === "reforco" ? "Reforço" : "Sangria";
  const typeIcon = (t) =>
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
        {ops.map((o) => (
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
const CashCloseModal = ({ openingBalance, ops, sales, fiscalSummary, onClose, onConfirm }) => {
  const finalizadas = sales.filter((s) => s.status === "finalizada");
  const canceladas = sales.filter((s) => s.status === "cancelada");
  const devolucoes = sales.filter((s) => s.status === "devolucao" || (s.total < 0));

  const vendasTotal = finalizadas.reduce((s, x) => s + x.total, 0);
  const devolucoesTotal = devolucoes.reduce((s, x) => s + Math.abs(x.total), 0);

  /* totais por forma de pagamento */
  const byMethod = useMemo(() => {
    const map = {};
    finalizadas.forEach((s) => {
      (s.payments || []).forEach((p) => {
        const id = p.method.id;
        if (!map[id]) map[id] = { nome: p.method.nome, icon: p.method.icon, total: 0 };
        map[id].total += p.amount;
      });
    });
    return Object.values(map);
  }, [finalizadas]);

  const reforcos = ops.filter((o) => o.type === "reforco").reduce((s, o) => s + o.value, 0);
  const sangrias = ops.filter((o) => o.type === "sangria").reduce((s, o) => s + o.value, 0);
  const dinheiroSistema = (byMethod.find((m) => m.nome === "Dinheiro")?.total || 0) + openingBalance + reforcos - sangrias;

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
            <div className="cstat"><div className="lb">Itens vendidos</div><div className="vl">{finalizadas.reduce((s, x) => s + x.itemCount, 0)}</div></div>
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
            {byMethod.map((m) => (
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
                <div className="vl" style={{ color: "var(--accent)" }}>+{formatBRL(byMethod.find((m) => m.nome === "Dinheiro")?.total || 0)}</div>
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
const TurnHistoryModal = ({ sales, onClose, onCancel }) => {
  const [filter, setFilter] = useState("todas");
  const filtered = useMemo(() => {
    if (filter === "todas") return sales;
    if (filter === "devolucoes") return sales.filter((s) => s.status === "devolucao" || s.total < 0);
    return sales.filter((s) => s.status === filter);
  }, [sales, filter]);

  const counts = {
    todas: sales.length,
    finalizada: sales.filter((s) => s.status === "finalizada").length,
    cancelada: sales.filter((s) => s.status === "cancelada").length,
    devolucoes: sales.filter((s) => s.status === "devolucao" || s.total < 0).length,
  };

  const statusBadge = (s) => {
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
          {filtered.map((s) => (
            <div key={s.cupom} className="prod-row" style={{ gridTemplateColumns: "110px 90px 1fr 150px 120px 120px 110px" }}>
              <div className="code">#{s.cupom}</div>
              <div className="cat" style={{ textTransform: "none", letterSpacing: 0, fontFamily: "var(--font-mono)" }}>{s.timestamp}</div>
              <div className="nm">{s.customer?.nome || "Consumidor final"}<small>{s.itemCount} itens</small></div>
              <div className="cat" style={{ textTransform: "none", letterSpacing: 0, fontWeight: 500 }}>
                {(s.payments || []).map((p) => p.method.nome).join(" + ") || "—"}
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
const LoyaltyModal = ({ customer, currentTotal, onClose, onSet }) => {
  const [q, setQ] = useState(customer?.doc || "");
  const [found, setFound] = useState(customer || null);
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
            {found.historico.map((h, i) => (
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

window.ReturnModal = ReturnModal;
window.CashOpsModal = CashOpsModal;
window.CashCloseModal = CashCloseModal;
window.TurnHistoryModal = TurnHistoryModal;
window.LoyaltyModal = LoyaltyModal;
