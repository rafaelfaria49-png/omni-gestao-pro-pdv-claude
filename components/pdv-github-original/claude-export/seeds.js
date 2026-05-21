/* Dados simulados de turno e clientes fidelidade — OmniGestão Pro */

window.OPENED_AT = new Date(new Date().setHours(8, 0, 0, 0));

window.SEED_TURN_SALES = [
  {
    cupom: "001034",
    timestamp: "10:12",
    itemCount: 4,
    subtotal: 87.40,
    discount: 0,
    surcharge: 0,
    total: 87.40,
    paid: 100.00,
    change: 12.60,
    payments: [{ method: { id: "dinheiro", nome: "Dinheiro", icon: "cash" }, amount: 100 }],
    customer: null,
    status: "finalizada",
    items: [
      { id: 1001, codigo: "1001", nome: "Arroz Branco 5kg", icone: "🍚", qtd: 1, preco: 28.90 },
      { id: 1002, codigo: "1002", nome: "Feijão Carioca 1kg", icone: "🫘", qtd: 2, preco: 9.49 },
      { id: 1006, codigo: "1006", nome: "Leite Integral 1L", icone: "🥛", qtd: 4, preco: 5.29 },
    ],
  },
  {
    cupom: "001035",
    timestamp: "10:34",
    itemCount: 2,
    subtotal: 64.80,
    discount: 0,
    surcharge: 0,
    total: 64.80,
    paid: 64.80,
    change: 0,
    payments: [{ method: { id: "pix", nome: "PIX", icon: "pix" }, amount: 64.80 }],
    customer: { nome: "Mariana Lopes", doc: "452.118.230-05" },
    status: "finalizada",
    items: [
      { id: 1004, codigo: "1004", nome: "Camiseta Básica Algodão", icone: "👕", qtd: 1, preco: 39.90 },
      { id: 1007, codigo: "1007", nome: "Café Torrado 500g", icone: "☕", qtd: 1, preco: 18.80 },
    ],
  },
  {
    cupom: "001036",
    timestamp: "11:02",
    itemCount: 1,
    subtotal: 119.90,
    discount: 0,
    surcharge: 0,
    total: 119.90,
    paid: 119.90,
    change: 0,
    payments: [{ method: { id: "credito", nome: "Cartão crédito", icon: "card" }, amount: 119.90 }],
    customer: null,
    status: "finalizada",
    items: [
      { id: 1014, codigo: "1014", nome: "Calça Jeans Slim", icone: "👖", qtd: 1, preco: 119.90 },
    ],
  },
  {
    cupom: "001037",
    timestamp: "11:18",
    itemCount: 3,
    subtotal: 31.20,
    discount: 0,
    surcharge: 0,
    total: 31.20,
    paid: 31.20,
    change: 0,
    payments: [{ method: { id: "debito", nome: "Cartão débito", icon: "card" }, amount: 31.20 }],
    customer: null,
    status: "finalizada",
    items: [
      { id: 1003, codigo: "1003", nome: "Detergente Neutro 500ml", icone: "🧴", qtd: 2, preco: 3.79 },
      { id: 1008, codigo: "1008", nome: "Refrigerante Cola 2L", icone: "🥤", qtd: 1, preco: 8.99 },
      { id: 1011, codigo: "1011", nome: "Açúcar Refinado 1kg", icone: "🧂", qtd: 3, preco: 4.59 },
    ],
  },
  {
    cupom: "001038",
    timestamp: "11:41",
    itemCount: 1,
    subtotal: 24.90,
    discount: 0,
    surcharge: 0,
    total: 24.90,
    paid: 24.90,
    change: 0,
    payments: [{ method: { id: "pix", nome: "PIX", icon: "pix" }, amount: 24.90 }],
    customer: { nome: "Carlos Andrade", doc: "318.572.910-22" },
    status: "finalizada",
    items: [
      { id: 1010, codigo: "1010", nome: "Cabo USB-C 1m", icone: "🔌", qtd: 1, preco: 24.90 },
    ],
  },
  {
    cupom: "001039",
    timestamp: "12:05",
    itemCount: 6,
    subtotal: 142.34,
    discount: 7.12,
    surcharge: 0,
    total: 135.22,
    paid: 135.22,
    change: 0,
    payments: [{ method: { id: "credito", nome: "Cartão crédito", icon: "card" }, amount: 135.22 }],
    customer: { nome: "Patrícia Souza", doc: "207.339.541-08" },
    status: "finalizada",
    items: [
      { id: 1001, codigo: "1001", nome: "Arroz Branco 5kg", icone: "🍚", qtd: 2, preco: 28.90 },
      { id: 1007, codigo: "1007", nome: "Café Torrado 500g", icone: "☕", qtd: 1, preco: 18.80 },
      { id: 1013, codigo: "1013", nome: "Sabão em Pó 1kg", icone: "🧼", qtd: 1, preco: 14.90 },
      { id: 1012, codigo: "1012", nome: "Água Mineral 500ml", icone: "💧", qtd: 2, preco: 2.50 },
    ],
  },
  {
    cupom: "001040",
    timestamp: "12:33",
    itemCount: 2,
    subtotal: 46.50,
    discount: 0,
    surcharge: 0,
    total: 46.50,
    paid: 50.00,
    change: 3.50,
    payments: [{ method: { id: "dinheiro", nome: "Dinheiro", icon: "cash" }, amount: 50 }],
    customer: null,
    status: "cancelada",
    items: [
      { id: 1005, codigo: "1005", nome: "Martelo Unha 27mm", icone: "🔨", qtd: 1, preco: 34.50 },
      { id: 1015, codigo: "1015", nome: "Parafuso 4x40mm (cx 100)", icone: "🔩", qtd: 1, preco: 22.00 },
    ],
  },
  {
    cupom: "001041",
    timestamp: "12:58",
    itemCount: 5,
    subtotal: 98.30,
    discount: 0,
    surcharge: 0,
    total: 98.30,
    paid: 98.30,
    change: 0,
    payments: [
      { method: { id: "dinheiro", nome: "Dinheiro", icon: "cash" }, amount: 50 },
      { method: { id: "pix", nome: "PIX", icon: "pix" }, amount: 48.30 },
    ],
    customer: null,
    status: "finalizada",
    items: [
      { id: 1002, codigo: "1002", nome: "Feijão Carioca 1kg", icone: "🫘", qtd: 3, preco: 9.49 },
      { id: 1006, codigo: "1006", nome: "Leite Integral 1L", icone: "🥛", qtd: 2, preco: 5.29 },
    ],
  },
];

window.SEED_CASH_OPS = [
  { id: "M001", type: "abertura", value: 200.00, just: "Saldo inicial do turno",       time: "08:00" },
  { id: "M002", type: "reforco",  value: 100.00, just: "Reforço de moedas para troco", time: "10:32" },
  { id: "M003", type: "sangria",  value: 250.00, just: "Recolhimento parcial — cofre", time: "11:55" },
];

window.OPENING_BALANCE = 200.00;

window.LOYALTY_CUSTOMERS = [
  {
    cpf: "452.118.230-05",
    nome: "Mariana Lopes",
    tel: "(11) 98231-5544",
    pontos: 1240,
    tier: "Ouro",
    desde: "2023",
    historico: [
      { cupom: "000987", data: "07/05", total: 84.50 },
      { cupom: "001012", data: "10/05", total: 132.20 },
      { cupom: "001035", data: "Hoje",  total: 64.80 },
    ],
  },
  {
    cpf: "318.572.910-22",
    nome: "Carlos Andrade",
    tel: "(11) 99711-4022",
    pontos: 540,
    tier: "Prata",
    desde: "2024",
    historico: [
      { cupom: "000891", data: "02/05", total: 47.00 },
      { cupom: "001038", data: "Hoje",  total: 24.90 },
    ],
  },
  {
    cpf: "207.339.541-08",
    nome: "Patrícia Souza",
    tel: "(11) 97401-9933",
    pontos: 3180,
    tier: "Diamante",
    desde: "2022",
    historico: [
      { cupom: "000762", data: "25/04", total: 220.10 },
      { cupom: "000883", data: "01/05", total: 188.40 },
      { cupom: "000940", data: "06/05", total: 312.90 },
      { cupom: "001039", data: "Hoje",  total: 135.22 },
    ],
  },
  {
    cpf: "115.882.470-31",
    nome: "Diego Martins",
    tel: "(11) 98801-1170",
    pontos: 92,
    tier: "Bronze",
    desde: "2025",
    historico: [
      { cupom: "001008", data: "08/05", total: 19.00 },
    ],
  },
];

/* 1 ponto por R$ 1,00 */
window.POINTS_PER_REAL = 1;

window.TIER_COLORS = {
  Bronze:   "oklch(0.70 0.13 50)",
  Prata:    "oklch(0.78 0.02 240)",
  Ouro:     "oklch(0.82 0.16 85)",
  Diamante: "oklch(0.80 0.14 200)",
};
