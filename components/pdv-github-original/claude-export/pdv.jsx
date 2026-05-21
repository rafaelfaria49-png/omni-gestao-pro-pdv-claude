/* ============== PDV principal — OmniGestão Pro ============== */

const initialCart = [];

const FISCAL_LABELS = {
  nfe:     { nome: "NF-e",  icon: "receipt", finalize: "Finalizar com NF-e",   ds: "Emite cupom fiscal eletrônico" },
  simples: { nome: "Cupom simples", icon: "doc", finalize: "Finalizar sem nota", ds: "Recibo não fiscal" },
};

const PDV = () => {
  /* ----------- estado ----------- */
  const [cart, setCart] = useState(initialCart);
  const [selectedId, setSelectedId] = useState(null);
  const [scanValue, setScanValue] = useState("");
  const [received, setReceived] = useState("");
  const [customer, setCustomer] = useState(null);
  const [docNota, setDocNota] = useState(""); // CPF/CNPJ na nota (independente de cliente)
  const [discount, setDiscount] = useState(null); // { tipo, modo, valor, autorizado }
  const [suspended, setSuspended] = useState([]);
  const [now, setNow] = useState(new Date());
  const [online, setOnline] = useState(true);
  const [cupomNum, setCupomNum] = useState(1042);
  const [lastSale, setLastSale] = useState(null);

  /* ---- novos ---- */
  const [fiscalMode, setFiscalMode] = useState("nfe"); // "nfe" | "simples"
  const [selfService, setSelfService] = useState(false);
  const [cashOps, setCashOps] = useState(window.SEED_CASH_OPS || []);
  const [turnSales, setTurnSales] = useState(window.SEED_TURN_SALES || []);
  const [itemsScanned, setItemsScanned] = useState(38); // contador acumulado do turno

  /* modais (somente um por vez) */
  const [modal, setModal] = useState(null);
  // "search" | "qty" | "customer" | "discount" | "cpfnota" | "cancel" | "suspend" | "payment" | "success"
  // | "return" | "cashops" | "cashclose" | "history" | "loyalty"
  const [searchInitial, setSearchInitial] = useState("");

  const scanRef = useRef(null);
  const cartScrollRef = useRef(null);

  const MAX_SUSPENDED = 5;

  /* ----------- relógio ----------- */
  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(i);
  }, []);

  /* ----------- foco no scan ----------- */
  const focusScan = useCallback(() => {
    setTimeout(() => scanRef.current?.focus(), 30);
  }, []);
  useEffect(() => { focusScan(); }, [focusScan]);
  useEffect(() => {
    if (modal === null) focusScan();
  }, [modal, focusScan]);

  /* ----------- totais ----------- */
  const subtotal = useMemo(
    () => cart.reduce((s, i) => s + i.qtd * i.preco - (i.descontoItem || 0), 0),
    [cart]
  );
  const totalItens = useMemo(() => cart.reduce((s, i) => s + i.qtd, 0), [cart]);

  const descontoGeral = useMemo(() => {
    if (!discount || discount.tipo !== "desconto") return 0;
    return discount.modo === "percent" ? subtotal * (discount.valor / 100) : discount.valor;
  }, [discount, subtotal]);

  const acrescimoGeral = useMemo(() => {
    if (!discount || discount.tipo !== "acrescimo") return 0;
    return discount.modo === "percent" ? subtotal * (discount.valor / 100) : discount.valor;
  }, [discount, subtotal]);

  const total = Math.max(0, subtotal - descontoGeral + acrescimoGeral);

  const recebido = parseAmount(received);
  const troco = recebido - total;

  const lastItem = cart[cart.length - 1];

  /* auto-scroll para último item */
  useEffect(() => {
    if (cartScrollRef.current) {
      cartScrollRef.current.scrollTop = cartScrollRef.current.scrollHeight;
    }
  }, [cart.length]);

  /* ----------- regras: adicionar / remover ----------- */
  const addProduct = (product, qtd = 1) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.id === product.id ? { ...i, qtd: i.qtd + qtd } : i
        );
      }
      return [...prev, {
        ...product,
        qtd,
        descontoItem: 0,
        addedAt: Date.now(),
      }];
    });
    setSelectedId(product.id);
    setItemsScanned((n) => n + qtd);
  };

  const addReturnLines = (lines) => {
    setCart((prev) => [...prev, ...lines]);
    if (lines[0]) setSelectedId(lines[0].id);
  };

  const removeItem = (id) => {
    setCart((prev) => prev.filter((i) => i.id !== id));
    setSelectedId(null);
  };

  const updateQty = (id, newQty) => {
    setCart((prev) => prev.map((i) =>
      i.id === id ? { ...i, qtd: Math.max(1, newQty) } : i
    ));
  };

  /* ----------- regras: scan/bipar ----------- */
  const handleScan = (rawInput) => {
    const input = String(rawInput || "").trim();
    if (!input) return;

    // multiplicador: "3x arroz" ou "3*1001"
    const multMatch = input.match(/^(\d+)\s*[x*X×]\s*(.+)$/);
    let qtd = 1;
    let query = input;
    if (multMatch) {
      qtd = Math.max(1, parseInt(multMatch[1], 10) || 1);
      query = multMatch[2].trim();
    }

    // 1) match exato por código ou EAN
    const exact = PRODUCTS.find(
      (p) => p.codigo === query || p.ean === query || String(p.id) === query
    );
    if (exact) {
      addProduct(exact, qtd);
      setScanValue("");
      return;
    }

    // 2) busca por nome parcial
    const term = query.toLowerCase();
    const matches = PRODUCTS.filter(
      (p) => p.nome.toLowerCase().includes(term) ||
             p.categoria.toLowerCase().includes(term)
    );

    if (matches.length === 1) {
      addProduct(matches[0], qtd);
      setScanValue("");
      return;
    }

    if (matches.length > 1) {
      setSearchInitial(query);
      setModal("search");
      setScanValue("");
      return;
    }

    // 3) não encontrou
    if (scanRef.current) {
      scanRef.current.classList.add("not-found-flash");
      setTimeout(() => scanRef.current?.classList.remove("not-found-flash"), 600);
    }
    // mantém scanValue para o operador corrigir
  };

  /* ----------- finalização ----------- */
  const completeSale = ({ payments, change, paid }) => {
    const cupomStr = String(cupomNum).padStart(6, "0");
    const hasReturns = cart.some((i) => i.isReturn);
    const sale = {
      cupom: cupomStr,
      timestamp: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      fullTs: new Date().toLocaleString("pt-BR"),
      itemCount: totalItens,
      subtotal,
      discount: descontoGeral,
      surcharge: acrescimoGeral,
      total,
      paid,
      change,
      payments,
      customer: customer || (docNota ? { nome: "Consumidor final", doc: docNota } : null),
      fiscalMode,
      status: hasReturns && total <= 0 ? "devolucao" : "finalizada",
      pointsEarned: customer?.loyalty ? Math.floor(total * (window.POINTS_PER_REAL || 1)) : 0,
      items: cart.map((it) => ({
        id: it.id, codigo: it.codigo, nome: it.nome, icone: it.icone,
        qtd: it.qtd, preco: it.preco, isReturn: !!it.isReturn,
      })),
    };
    setLastSale(sale);
    setTurnSales((arr) => [...arr, sale]);
    setModal("success");
  };

  const cancelTurnSale = (cupom) => {
    setTurnSales((arr) => arr.map((s) =>
      s.cupom === cupom ? { ...s, status: "cancelada" } : s
    ));
  };

  /* fiscal summary for cash close */
  const fiscalSummary = useMemo(() => {
    const fin = turnSales.filter((s) => s.status === "finalizada");
    const nfe = fin.filter((s) => (s.fiscalMode || "nfe") === "nfe");
    const simples = fin.filter((s) => (s.fiscalMode || "nfe") === "simples");
    return {
      nfe: nfe.length,
      nfeTotal: nfe.reduce((s, x) => s + x.total, 0),
      simples: simples.length,
      simplesTotal: simples.reduce((s, x) => s + x.total, 0),
    };
  }, [turnSales]);

  /* indicadores operacionais */
  const indicators = useMemo(() => {
    const fin = turnSales.filter((s) => s.status === "finalizada");
    const faturamento = fin.reduce((s, x) => s + x.total, 0);
    const ticket = fin.length > 0 ? faturamento / fin.length : 0;
    return {
      vendas: fin.length,
      ticket,
      bipados: itemsScanned,
      faturamento,
    };
  }, [turnSales, itemsScanned]);

  const newSale = () => {
    setCart([]);
    setSelectedId(null);
    setReceived("");
    setCustomer(null);
    setDocNota("");
    setDiscount(null);
    setCupomNum((n) => n + 1);
    setLastSale(null);
    setModal(null);
  };

  /* ----------- suspender / retomar ----------- */
  const suspendSale = () => {
    if (cart.length === 0) return;
    if (suspended.length >= MAX_SUSPENDED) return;
    const id = "SU" + String(Date.now()).slice(-6);
    setSuspended((s) => [...s, {
      id,
      timestamp: new Date().toLocaleString("pt-BR"),
      shortTs: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      suspendedAt: Date.now(),
      items: cart,
      customer,
      discount,
    }]);
    setCart([]);
    setSelectedId(null);
    setReceived("");
    setCustomer(null);
    setDiscount(null);
  };
  const resumeSale = (id) => {
    const s = suspended.find((x) => x.id === id);
    if (!s) return;
    // se há carrinho ativo, sugere suspender primeiro
    if (cart.length > 0) {
      const ok = window.confirm(
        `Você tem ${cart.length} ${cart.length === 1 ? "item" : "itens"} no carrinho atual.\n\n` +
        "Deseja suspender a venda atual antes de retomar?\n\n" +
        "OK = Suspender atual e retomar\nCancelar = Continuar venda atual"
      );
      if (!ok) return;
      if (suspended.length >= MAX_SUSPENDED) {
        alert(`Limite de ${MAX_SUSPENDED} vendas suspensas atingido.`);
        return;
      }
      suspendSale();
      // small delay para garantir que o estado limpou
      setTimeout(() => {
        setCart(s.items);
        setCustomer(s.customer || null);
        setDiscount(s.discount || null);
        setSuspended((all) => all.filter((x) => x.id !== id));
        setModal(null);
      }, 50);
      return;
    }
    setCart(s.items);
    setCustomer(s.customer || null);
    setDiscount(s.discount || null);
    setSuspended((all) => all.filter((x) => x.id !== id));
    setModal(null);
  };
  const discardSuspended = (id) => setSuspended((all) => all.filter((x) => x.id !== id));

  /* ----------- atalhos globais ----------- */
  useEffect(() => {
    const handler = (e) => {
      // Esc fecha modal
      if (e.key === "Escape") {
        if (modal) { e.preventDefault(); setModal(null); return; }
      }
      const tag = (e.target.tagName || "").toLowerCase();
      const isField = tag === "input" || tag === "select" || tag === "textarea";

      // shortcuts F2..F12 funcionam mesmo em campos
      const blockInFields = e.key === "Delete" && isField;
      if (blockInFields) return;

      switch (e.key) {
        case "F2":
          e.preventDefault();
          if (modal) setModal(null);
          focusScan();
          break;
        case "F3":
          e.preventDefault();
          setSearchInitial("");
          setModal("search");
          break;
        case "F4":
          e.preventDefault();
          if (selectedId) setModal("qty");
          break;
        case "F5":
          e.preventDefault();
          setModal("loyalty");
          break;
        case "F6":
          e.preventDefault();
          setModal("return");
          break;
        case "F7":
          e.preventDefault();
          setFiscalMode((m) => m === "nfe" ? "simples" : "nfe");
          break;
        case "F8":
          e.preventDefault();
          if (cart.length > 0) setModal("discount");
          break;
        case "F9":
          e.preventDefault();
          setModal("cpfnota");
          break;
        case "F10":
          e.preventDefault();
          if (cart.length > 0) setModal("cancel");
          break;
        case "F11":
          e.preventDefault();
          setModal("suspend");
          break;
        case "F12":
          e.preventDefault();
          if (cart.length > 0) setModal("payment");
          break;
        case "Delete":
          if (selectedId && !isField) {
            e.preventDefault();
            removeItem(selectedId);
          }
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [modal, selectedId, cart.length, focusScan]);

  /* ----------- render ----------- */
  const dateStr = now.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  const timeStr = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div className={`app ${selfService ? "self-service" : ""}`}>
      {/* ============== HEADER ============== */}
      <header className="header">
        <div className="brand">
          <div className="brand-mark">Ω</div>
          <div className="brand-name">OmniGestão Pro <span>PDV</span></div>
        </div>

        <div className="divider-v"/>

        <div className="pill pill-success">
          <span className="dot"></span> Caixa aberto
        </div>

        <button
          className="hdr-btn"
          onClick={() => setModal("cashops")}
          title="Sangria / Reforço de caixa"
        >
          <Icon name="vault" size={14}/> Caixa
        </button>

        <button
          className="hdr-btn"
          onClick={() => setModal("history")}
          title="Histórico do turno"
        >
          <Icon name="history" size={14}/> Turno
          <span className="hdr-badge">{turnSales.filter((s) => s.status === "finalizada").length}</span>
        </button>

        <button
          className="hdr-btn"
          onClick={() => setModal("cashclose")}
          title="Fechamento de caixa"
        >
          <Icon name="lock" size={14}/> Fechar caixa
        </button>

        {!selfService && <div className="meta-cell">
          <Icon name="user" size={14}/>
          <span className="label">Operador</span>
          <span className="value">Rafael</span>
        </div>}

        {!selfService && <div className="meta-cell">
          <Icon name="store" size={14}/>
          <span className="label">Loja</span>
          <span className="value">Loja Principal</span>
        </div>}

        <div className="header-meta">
          <div className="meta-cell">
            <Icon name="receipt" size={14}/>
            <span className="label">Cupom</span>
            <span className="value mono">#{String(cupomNum).padStart(6, "0")}</span>
          </div>

          <div className="divider-v"/>

          {!selfService && <div className="meta-cell">
            <Icon name="calendar" size={14}/>
            <span className="value mono">{dateStr}</span>
          </div>}

          <div className="meta-cell">
            <Icon name="clock" size={14}/>
            <span className="value mono">{timeStr}</span>
          </div>

          <button
            className={`pill ${online ? "pill-info" : "pill-danger"}`}
            onClick={() => setOnline((v) => !v)}
            style={{ cursor: "pointer", border: "1px solid var(--line-2)" }}
            title="Alternar online/offline (demo)"
          >
            <span className="dot"></span>
            {online ? "Online" : "Offline"}
          </button>

          <button
            className={`hdr-btn ${selfService ? "active" : ""}`}
            onClick={() => setSelfService((v) => !v)}
            title="Modo autoatendimento"
          >
            <Icon name="accessibility" size={14}/>
            {selfService ? "Autoatendimento" : ""}
          </button>

          <button className="icon-btn" title="Sair do PDV">
            <Icon name="logout" size={15}/>
          </button>
        </div>
      </header>

      {/* ============== MAIN ============== */}
      <main className="main">
        {/* ---------- LEFT ---------- */}
        <section className="panel left">
          {suspended.length > 0 && (
            <div className="suspended-strip">
              <div className="ss-lb"><Icon name="pause" size={11}/> Em espera</div>
              {suspended.map((s) => {
                const ttl = s.items.reduce((sum, i) => sum + i.qtd * i.preco, 0);
                const mins = Math.max(0, Math.floor((Date.now() - (s.suspendedAt || Date.now())) / 60000));
                return (
                  <button
                    key={s.id}
                    className="ss-badge"
                    onClick={() => resumeSale(s.id)}
                    title={`Retomar venda · ${s.items.length} itens`}
                  >
                    <span className="ss-num">#{s.id.slice(-4)}</span>
                    <span className="ss-val">{formatBRL(ttl)}</span>
                    <span className="ss-time">{mins === 0 ? "agora" : `${mins}m`}</span>
                    <span
                      className="ss-x"
                      onClick={(e) => { e.stopPropagation(); discardSuspended(s.id); }}
                      title="Descartar"
                    >×</span>
                  </button>
                );
              })}
              {suspended.length >= MAX_SUSPENDED && (
                <span className="ss-limit">Limite de {MAX_SUSPENDED} atingido</span>
              )}
            </div>
          )}
          <div className="scan-wrap">
            <div className="scan-input">
              <span className="scan-icon"><Icon name="barcode" size={20}/></span>
              <input
                ref={scanRef}
                value={scanValue}
                onChange={(e) => setScanValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); handleScan(scanValue); }
                }}
                placeholder="Bipe o código de barras ou digite o produto"
                autoComplete="off"
                spellCheck={false}
              />
              <div className="kbd-hint">
                <span className="kbd-key">F2</span>
              </div>
            </div>
            <button className="btn" onClick={() => { setSearchInitial(scanValue); setModal("search"); }}>
              <Icon name="search" size={14}/> Buscar <span className="kbd">F3</span>
            </button>
            <button
              className="btn btn-primary"
              disabled={cart.length === 0}
              onClick={() => cart.length > 0 && setModal("payment")}
              style={{ opacity: cart.length === 0 ? 0.5 : 1 }}
            >
              Finalizar <span className="kbd">F12</span>
            </button>
          </div>

          {cart.length === 0 ? (
            <div className="cart-empty">
              <div className="cart-empty-card">
                <div className="cart-empty-icon"><Icon name="cart" size={32}/></div>
                <h3>Comece bipando um produto</h3>
                <p>
                  Use o leitor de código de barras, digite o código, EAN ou o nome do produto.
                  Para múltiplas unidades use o prefixo <strong>3x</strong> ou <strong>3*</strong>.
                </p>
                <div className="examples">
                  <span className="example-chip">1001</span>
                  <span className="example-chip">3x arroz</span>
                  <span className="example-chip">2*1006</span>
                  <span className="example-chip">camiseta</span>
                  <span className="example-chip">7891234560066</span>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="cart-head">
                <div>#</div>
                <div>Código</div>
                <div>Produto</div>
                <div className="num-right">Qtd</div>
                <div className="num-right">Valor un.</div>
                <div className="num-right">Desc.</div>
                <div className="num-right">Total</div>
                <div></div>
              </div>
              <div ref={cartScrollRef} className="cart-scroll">
                {cart.map((it, idx) => {
                  const lineTotal = it.qtd * it.preco - (it.descontoItem || 0);
                  return (
                    <div
                      key={it.id}
                      className={`cart-row ${selectedId === it.id ? "selected" : ""} ${it.isReturn ? "is-return" : ""}`}
                      onClick={() => setSelectedId(it.id)}
                      onDoubleClick={() => { setSelectedId(it.id); setModal("qty"); }}
                    >
                      <div className="idx">{String(idx + 1).padStart(2, "0")}</div>
                      <div className="code">{it.codigo}</div>
                      <div className="name">
                        <span style={{ marginRight: 6 }}>{it.icone}</span>{it.nome}
                        {it.isReturn && <span className="return-badge">DEVOLUÇÃO · #{it.returnFrom}</span>}
                        <small>
                          {it.isReturn
                            ? `Motivo: ${it.reason || "—"}`
                            : it.categoria}
                        </small>
                      </div>
                      <div className="qty">{it.qtd}</div>
                      <div className="unit">{formatBRL(it.preco)}</div>
                      <div className={`disc ${(it.descontoItem || 0) === 0 ? "zero" : ""}`}>
                        {(it.descontoItem || 0) === 0 ? "—" : "−" + formatBRL(it.descontoItem)}
                      </div>
                      <div className="total" style={it.isReturn ? { color: "var(--warn)" } : null}>{formatBRL(lineTotal)}</div>
                      <div className="actions">
                        <button
                          className="row-x"
                          onClick={(e) => { e.stopPropagation(); removeItem(it.id); }}
                          title="Remover item"
                        >
                          <Icon name="trash" size={13}/>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>

        {/* ---------- RIGHT ---------- */}
        <section className="right">
          <div className="right-card total-display">
            <div className="total-label">Total da venda</div>
            <div className="total-value">
              <span className="currency">R$</span>
              <span>{formatNum(Math.floor(total), 0)}</span>
              <span className="cents">,{(total.toFixed(2).split(".")[1])}</span>
            </div>

            <div className="summary">
              <div className="summary-row">
                <span className="label">Subtotal · {totalItens} {totalItens === 1 ? "item" : "itens"}</span>
                <span className="value">{formatBRL(subtotal)}</span>
              </div>
              {descontoGeral > 0 && (
                <div className="summary-row disc">
                  <span className="label">Desconto {discount?.modo === "percent" ? `(${discount.valor}%)` : ""}</span>
                  <span className="value">−{formatBRL(descontoGeral)}</span>
                </div>
              )}
              {acrescimoGeral > 0 && (
                <div className="summary-row acres">
                  <span className="label">Acréscimo {discount?.modo === "percent" ? `(${discount.valor}%)` : ""}</span>
                  <span className="value">+{formatBRL(acrescimoGeral)}</span>
                </div>
              )}
              <div className="summary-row divider">
                <span className="label" style={{ fontWeight: 600, color: "var(--text-1)" }}>Total a pagar</span>
                <span className="value" style={{ fontWeight: 700, color: "var(--text-0)" }}>{formatBRL(total)}</span>
              </div>
            </div>

            <div className="indicators">
              <div className="ind">
                <Icon name="receipt" size={11}/>
                <span className="lb">Vendas no turno</span>
                <span className="vl">{indicators.vendas}</span>
              </div>
              <div className="ind">
                <Icon name="trend-up" size={11}/>
                <span className="lb">Ticket médio</span>
                <span className="vl">{formatBRL(indicators.ticket)}</span>
              </div>
              <div className="ind">
                <Icon name="barcode" size={11}/>
                <span className="lb">Itens bipados</span>
                <span className="vl">{indicators.bipados}</span>
              </div>
            </div>
          </div>

          <div className="right-card">
            <div className="card-title">
              <span>Último adicionado</span>
              {lastItem && <span className="muted" style={{ textTransform: "none", letterSpacing: 0, fontSize: 11, fontWeight: 500 }}>item #{cart.length}</span>}
            </div>
            {lastItem ? (
              <div className="last-product">
                <div className="thumb">{lastItem.icone}</div>
                <div className="info">
                  <div className="name">{lastItem.nome}</div>
                  <div className="meta">{lastItem.codigo} · {lastItem.categoria}</div>
                </div>
                <div className="price">
                  <div className="qty">{lastItem.qtd} × {formatBRL(lastItem.preco)}</div>
                  <div className="val">{formatBRL(lastItem.qtd * lastItem.preco - (lastItem.descontoItem || 0))}</div>
                </div>
              </div>
            ) : (
              <div className="muted" style={{ fontSize: 13 }}>Nenhum produto adicionado ainda.</div>
            )}
          </div>

          <div className="right-card">
            <div className="card-title">
              <span>Cliente {customer?.loyalty && <span className="loyalty-pill"><Icon name="star" size={10}/> Fidelidade</span>}</span>
              <button className="btn btn-xs btn-ghost" onClick={() => setModal("loyalty")}>
                <Icon name="user" size={11}/> {customer ? "Alterar" : "Identificar"} <span style={{ marginLeft: 4, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)" }}>F5</span>
              </button>
            </div>
            <div className="customer-row">
              <div className="customer-avatar" style={customer?.loyalty ? { background: TIER_COLORS[customer.loyalty.tier], color: "#06180f" } : null}>
                <Icon name="user" size={16}/>
              </div>
              <div className="customer-info">
                <div className="name">{customer?.nome || "Consumidor final"}</div>
                <div className="doc">
                  {customer?.doc || docNota || "Sem documento na nota"}
                  {!docNota && !customer?.doc && (
                    <button
                      className="btn btn-xs btn-ghost"
                      style={{ marginLeft: 6, padding: "0 6px", height: 20, fontSize: 10 }}
                      onClick={() => setModal("cpfnota")}
                    >
                      + CPF/CNPJ <span style={{ marginLeft: 4, color: "var(--text-3)" }}>F9</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
            {customer?.loyalty && (
              <div className="loyalty-row">
                <div className="lr-cell">
                  <span className="lb">Pontos</span>
                  <span className="vl mono">{customer.loyalty.pontos.toLocaleString("pt-BR")}</span>
                </div>
                <div className="lr-cell">
                  <span className="lb">+ Nesta venda</span>
                  <span className="vl mono" style={{ color: "var(--accent)" }}>+{Math.floor(total * (window.POINTS_PER_REAL || 1)).toLocaleString("pt-BR")}</span>
                </div>
                <div className="lr-cell">
                  <span className="lb">Tier</span>
                  <span className="vl" style={{ color: TIER_COLORS[customer.loyalty.tier] }}>{customer.loyalty.tier}</span>
                </div>
              </div>
            )}
          </div>

          <div className="right-card fiscal-card">
            <div className="card-title">
              <span>Documento fiscal</span>
              <span className="kbd-key">F7</span>
            </div>
            <div className="fiscal-toggle">
              <button
                className={`ft-opt ${fiscalMode === "nfe" ? "active" : ""}`}
                onClick={() => setFiscalMode("nfe")}
              >
                <Icon name="receipt" size={16}/>
                <div>
                  <div className="nm">Com NF-e</div>
                  <div className="ds">Cupom fiscal eletrônico</div>
                </div>
              </button>
              <button
                className={`ft-opt ${fiscalMode === "simples" ? "active" : ""}`}
                onClick={() => setFiscalMode("simples")}
              >
                <Icon name="doc" size={16}/>
                <div>
                  <div className="nm">Sem nota</div>
                  <div className="ds">Cupom simples não fiscal</div>
                </div>
              </button>
            </div>
          </div>

          <div className="right-card received-card">
            <label>Valor recebido em dinheiro</label>
            <input
              className="received-input"
              value={received}
              onChange={(e) => setReceived(e.target.value)}
              placeholder="0,00"
            />
            <div className={`change-row ${recebido > 0 && troco < 0 ? "warn" : ""}`}>
              <span className="label">{recebido > 0 && troco < 0 ? "Faltam" : "Troco"}</span>
              <span className="val">
                {recebido > 0 && troco < 0
                  ? formatBRL(Math.abs(troco))
                  : formatBRL(Math.max(0, troco))}
              </span>
            </div>
            {recebido > 0 && troco < 0 && (
              <div className="alert-under">
                <Icon name="alert" size={12}/> Valor recebido menor que o total da venda.
              </div>
            )}

            <button
              className="checkout-btn"
              disabled={cart.length === 0}
              onClick={() => cart.length > 0 && setModal("payment")}
            >
              <Icon name={FISCAL_LABELS[fiscalMode].icon} size={18} stroke={2.2}/>
              {FISCAL_LABELS[fiscalMode].finalize}
              <span className="kbd">F12</span>
            </button>
          </div>
        </section>
      </main>

      {/* ============== FOOTER atalhos ============== */}
      <footer className="footer">
        <button className="shortcut" onClick={() => { setModal(null); focusScan(); }}>
          <span className="kbd">F2</span> Buscar/Bipar
        </button>
        <button className="shortcut" onClick={() => { setSearchInitial(""); setModal("search"); }}>
          <span className="kbd">F3</span> Busca avançada
        </button>
        <button
          className="shortcut"
          onClick={() => selectedId && setModal("qty")}
          style={{ opacity: selectedId ? 1 : 0.4 }}
        >
          <span className="kbd">F4</span> Alterar qtd
        </button>
        <button className="shortcut" onClick={() => setModal("loyalty")}>
          <span className="kbd">F5</span> Cliente
        </button>
        <button className="shortcut" onClick={() => setModal("return")}>
          <span className="kbd">F6</span> Troca/Devolução
        </button>
        <button
          className="shortcut"
          onClick={() => setFiscalMode((m) => m === "nfe" ? "simples" : "nfe")}
          title={`Alternar para ${fiscalMode === "nfe" ? "cupom sem nota" : "NF-e"}`}
        >
          <span className="kbd">F7</span> {fiscalMode === "nfe" ? "NF-e" : "Sem nota"}
        </button>
        <div className="footer-sep"/>
        <button className="shortcut" onClick={() => cart.length > 0 && setModal("discount")} style={{ opacity: cart.length > 0 ? 1 : 0.4 }}>
          <span className="kbd">F8</span> Desconto/Acréscimo
        </button>
        <button className="shortcut" onClick={() => setModal("cpfnota")}>
          <span className="kbd">F9</span> CPF/CNPJ
        </button>
        <button
          className="shortcut danger"
          onClick={() => cart.length > 0 && setModal("cancel")}
          style={{ opacity: cart.length > 0 ? 1 : 0.4 }}
        >
          <span className="kbd">F10</span> Cancelar
        </button>
        <button className="shortcut" onClick={() => setModal("suspend")}>
          <span className="kbd">F11</span> Suspender {suspended.length > 0 && <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, padding: "2px 5px", borderRadius: 4, background: "var(--accent-soft)", color: "var(--accent)", marginLeft: 2 }}>{suspended.length}</span>}
        </button>
        <button className="shortcut primary" onClick={() => cart.length > 0 && setModal("payment")} style={{ opacity: cart.length > 0 ? 1 : 0.4 }}>
          <span className="kbd">F12</span> Finalizar
        </button>
        <div className="footer-sep"/>
        <button
          className="shortcut"
          onClick={() => selectedId && removeItem(selectedId)}
          style={{ opacity: selectedId ? 1 : 0.4 }}
        >
          <span className="kbd">Del</span> Remover
        </button>
        <button className="shortcut" onClick={() => setModal(null)}>
          <span className="kbd">Esc</span> Fechar
        </button>
        <div style={{ marginLeft: "auto", color: "var(--text-3)", fontSize: 11, padding: "0 8px", display: "flex", alignItems: "center", gap: 6 }}>
          <Icon name="keyboard" size={12}/> Atalhos sempre disponíveis
        </div>
      </footer>

      {/* ============== MODAIS ============== */}
      {modal === "search" && (
        <SearchModal
          initialQuery={searchInitial}
          onClose={() => setModal(null)}
          onPick={(p) => { addProduct(p, 1); setModal(null); }}
        />
      )}
      {modal === "qty" && selectedId && (() => {
        const it = cart.find((x) => x.id === selectedId);
        if (!it) return null;
        return (
          <QtyModal
            item={it}
            onClose={() => setModal(null)}
            onSave={(n) => { updateQty(it.id, n); setModal(null); }}
          />
        );
      })()}
      {modal === "customer" && (
        <CustomerModal
          customer={customer}
          onClose={() => setModal(null)}
          onSave={(c) => { setCustomer(c); setModal(null); }}
        />
      )}
      {modal === "discount" && (
        <DiscountModal
          subtotal={subtotal}
          current={discount}
          onClose={() => setModal(null)}
          onSave={(d) => { setDiscount(d); setModal(null); }}
        />
      )}
      {modal === "cpfnota" && (
        <CpfNotaModal
          current={docNota}
          onClose={() => setModal(null)}
          onSave={(d) => { setDocNota(d); setModal(null); }}
        />
      )}
      {modal === "cancel" && (
        <CancelModal
          itensCount={cart.length}
          onClose={() => setModal(null)}
          onConfirm={() => {
            setCart([]); setSelectedId(null); setReceived("");
            setCustomer(null); setDiscount(null); setDocNota("");
            setModal(null);
          }}
        />
      )}
      {modal === "suspend" && (
        <SuspendModal
          suspended={suspended}
          currentCount={cart.length}
          onClose={() => setModal(null)}
          onSuspend={() => { suspendSale(); setModal(null); }}
          onResume={resumeSale}
          onDiscard={discardSuspended}
        />
      )}
      {modal === "payment" && cart.length > 0 && (
        <PaymentModal
          total={total}
          customer={customer}
          onClose={() => setModal(null)}
          onComplete={completeSale}
        />
      )}
      {modal === "success" && lastSale && (
        <SuccessModalAuto sale={lastSale} onNew={newSale} />
      )}

      {modal === "return" && (
        <ReturnModal
          pastSales={turnSales}
          onClose={() => setModal(null)}
          onConfirm={({ lines, mode }) => {
            addReturnLines(lines);
            setModal(null);
            if (mode === "troca") {
              // após troca, foca scan para adicionar novos produtos
              setTimeout(() => focusScan(), 50);
            }
          }}
        />
      )}

      {modal === "loyalty" && (
        <LoyaltyModal
          customer={customer}
          currentTotal={total}
          onClose={() => setModal(null)}
          onSet={(c) => { setCustomer(c); setModal(null); }}
        />
      )}

      {modal === "cashops" && (
        <CashOpsModal
          ops={cashOps}
          openingBalance={window.OPENING_BALANCE || 0}
          onClose={() => setModal(null)}
          onAdd={(op) => setCashOps((arr) => [...arr, op])}
        />
      )}

      {modal === "cashclose" && (
        <CashCloseModal
          openingBalance={window.OPENING_BALANCE || 0}
          ops={cashOps}
          sales={turnSales}
          fiscalSummary={fiscalSummary}
          onClose={() => setModal(null)}
          onConfirm={() => {
            // limpa tudo (simula fechamento)
            setTurnSales([]);
            setCashOps([{ id: "M-NEW", type: "abertura", value: 0, just: "Caixa fechado", time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) }]);
            setCart([]); setSuspended([]); setItemsScanned(0);
            setModal(null);
            alert("Caixa fechado com sucesso. Relatório enviado.");
          }}
        />
      )}

      {modal === "history" && (
        <TurnHistoryModal
          sales={turnSales}
          onClose={() => setModal(null)}
          onCancel={(cupom) => cancelTurnSale(cupom)}
        />
      )}
    </div>
  );
};

/* Sucesso: também finaliza com Enter */
const SuccessModalAuto = ({ sale, onNew }) => {
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Enter") { e.preventDefault(); onNew(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onNew]);
  return <SuccessModal sale={sale} onNew={onNew}/>;
};

window.PDV = PDV;
