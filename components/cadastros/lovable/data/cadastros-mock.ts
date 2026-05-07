export const clientes = [
  { id: "C001", nome: "João Silva", tipo: "PF", telefone: "(11) 98123-4521", documento: "123.456.789-00", cidade: "São Paulo/SP", totalGasto: 4280, ultimaCompra: "2026-04-22", tags: ["VIP", "Recorrente"], status: "Ativo" },
  { id: "C002", nome: "Maria Souza", tipo: "PF", telefone: "(11) 99777-3344", documento: "987.654.321-00", cidade: "Guarulhos/SP", totalGasto: 1950, ultimaCompra: "2026-04-30", tags: ["Novo"], status: "Ativo" },
  { id: "C003", nome: "Gustavo Lima", tipo: "PF", telefone: "(21) 98112-5566", documento: "456.789.123-00", cidade: "Rio de Janeiro/RJ", totalGasto: 720, ultimaCompra: "2026-03-12", tags: ["Garantia"], status: "Ativo" },
  { id: "C004", nome: "Rafael Assistência", tipo: "PJ", telefone: "(11) 4002-8922", documento: "12.345.678/0001-99", cidade: "Campinas/SP", totalGasto: 18420, ultimaCompra: "2026-05-02", tags: ["Parceiro", "B2B"], status: "Ativo" },
  { id: "C005", nome: "Construtora Vértice LTDA", tipo: "PJ", telefone: "(31) 3344-2200", documento: "98.765.432/0001-10", cidade: "Belo Horizonte/MG", totalGasto: 32100, ultimaCompra: "2026-04-18", tags: ["Corporativo"], status: "Ativo" },
  { id: "C006", nome: "Camila Ferreira", tipo: "PF", telefone: "(11) 95577-1122", documento: "321.654.987-00", cidade: "Osasco/SP", totalGasto: 290, ultimaCompra: "2026-02-04", tags: [], status: "Inativo" },
  { id: "C007", nome: "Eduardo Tech Store", tipo: "PJ", telefone: "(47) 3033-7788", documento: "55.444.333/0001-22", cidade: "Joinville/SC", totalGasto: 9870, ultimaCompra: "2026-04-29", tags: ["Atacado"], status: "Ativo" },
  { id: "C008", nome: "Patrícia Mendes", tipo: "PF", telefone: "(85) 98899-0011", documento: "741.852.963-00", cidade: "Fortaleza/CE", totalGasto: 540, ultimaCompra: "2026-05-01", tags: ["Novo"], status: "Ativo" },
];

export const produtos = [
  { id: "P001", nome: "Tela iPhone 11 Original", sku: "TEL-IPH11-OR", barras: "7891234500011", categoria: "Telas", marca: "Apple", fornecedor: "iParts BR", estoque: 12, custo: 320, preco: 690, margem: 53.6, garantia: 90, status: "Ativo" },
  { id: "P002", nome: "Bateria Samsung Galaxy A54", sku: "BAT-SAMA54", barras: "7891234500028", categoria: "Baterias", marca: "Samsung", fornecedor: "Mobile Parts", estoque: 5, custo: 85, preco: 189, margem: 55.0, garantia: 90, status: "Ativo" },
  { id: "P003", nome: "Conector de Carga Moto G8 Play", sku: "CON-MOTOG8P", barras: "7891234500035", categoria: "Conectores", marca: "Motorola", fornecedor: "Mobile Parts", estoque: 22, custo: 18, preco: 49, margem: 63.2, garantia: 60, status: "Ativo" },
  { id: "P004", nome: "Película 3D Samsung Galaxy A54", sku: "PEL-SAMA54-3D", barras: "7891234500042", categoria: "Películas", marca: "Samsung", fornecedor: "Acessórios Hub", estoque: 80, custo: 4, preco: 29, margem: 86.2, garantia: 7, status: "Ativo" },
  { id: "P005", nome: "Carregador Turbo 25W USB-C", sku: "CAR-TUR25W", barras: "7891234500059", categoria: "Carregadores", marca: "Samsung", fornecedor: "Acessórios Hub", estoque: 3, custo: 22, preco: 79, margem: 72.1, garantia: 180, status: "Ativo" },
  { id: "P006", nome: "Tela iPhone 12", sku: "TEL-IPH12", barras: "7891234500066", categoria: "Telas", marca: "Apple", fornecedor: "iParts BR", estoque: 0, custo: 480, preco: 990, margem: 51.5, garantia: 90, status: "Ativo" },
  { id: "P007", nome: "Capinha Anti-Impacto iPhone 13", sku: "CAP-IPH13", barras: "7891234500073", categoria: "Capinhas", marca: "Apple", fornecedor: "Acessórios Hub", estoque: 45, custo: 8, preco: 39, margem: 79.5, garantia: 30, status: "Ativo" },
  { id: "P008", nome: "Cabo USB-C Trançado 1m", sku: "CAB-USBC-1M", barras: "7891234500080", categoria: "Cabos", marca: "Genérica", fornecedor: "Acessórios Hub", estoque: 60, custo: 6, preco: 25, margem: 76.0, garantia: 90, status: "Ativo" },
  { id: "P009", nome: "Tela Xiaomi Redmi Note 11", sku: "TEL-XR-N11", barras: "", categoria: "Telas", marca: "Xiaomi", fornecedor: "—", estoque: 4, custo: 150, preco: 0, margem: 0, garantia: 90, status: "Incompleto" },
  { id: "P010", nome: "Bateria iPhone XR", sku: "BAT-IPHXR", barras: "7891234500103", categoria: "Baterias", marca: "Apple", fornecedor: "iParts BR", estoque: 9, custo: 95, preco: 219, margem: 56.6, garantia: 90, status: "Ativo" },
];

export const servicos = [
  { id: "S001", nome: "Troca de Tela", categoria: "Reparo de Tela", tempo: "45 min", custo: 60, preco: 280, margem: 78.6, garantia: 90, termo: "Garantia cobre defeitos de fabricação da peça.", status: "Ativo" },
  { id: "S002", nome: "Troca de Bateria", categoria: "Energia", tempo: "30 min", custo: 35, preco: 159, margem: 78.0, garantia: 90, termo: "Garantia exclui danos por líquido.", status: "Ativo" },
  { id: "S003", nome: "Reparo de Placa", categoria: "Microsoldagem", tempo: "3 h", custo: 120, preco: 490, margem: 75.5, garantia: 60, termo: "Garantia limitada ao componente reparado.", status: "Ativo" },
  { id: "S004", nome: "Formatação", categoria: "Software", tempo: "1 h", custo: 0, preco: 89, margem: 100, garantia: 7, termo: "Sem garantia para vírus reincidentes.", status: "Ativo" },
  { id: "S005", nome: "Limpeza Interna", categoria: "Manutenção", tempo: "40 min", custo: 5, preco: 79, margem: 93.7, garantia: 30, termo: "Garantia cobre serviço executado.", status: "Ativo" },
  { id: "S006", nome: "Troca de Conector de Carga", categoria: "Reparo Físico", tempo: "1 h", custo: 25, preco: 149, margem: 83.2, garantia: 90, termo: "Garantia cobre peça e mão de obra.", status: "Ativo" },
  { id: "S007", nome: "Recuperação de Dados", categoria: "Software", tempo: "2 h", custo: 0, preco: 199, margem: 100, garantia: 0, termo: "Sem garantia de recuperação total.", status: "Ativo" },
  { id: "S008", nome: "Desbloqueio iCloud", categoria: "Software", tempo: "—", custo: 80, preco: 0, margem: 0, garantia: 0, termo: "Definir termo.", status: "Incompleto" },
];

export const fornecedores = [
  { id: "F001", nome: "iParts BR", cnpj: "11.222.333/0001-44", telefone: "(11) 3322-4400", whatsapp: "(11) 99877-5500", email: "vendas@iparts.com.br", categoria: "Telas / Baterias", prazo: "5 dias", pagamento: "30/60", ultima: "2026-04-28", status: "Ativo" },
  { id: "F002", nome: "Mobile Parts", cnpj: "22.333.444/0001-55", telefone: "(11) 3344-7700", whatsapp: "(11) 98800-1122", email: "comercial@mobileparts.com", categoria: "Peças Android", prazo: "3 dias", pagamento: "À vista", ultima: "2026-05-01", status: "Ativo" },
  { id: "F003", nome: "Acessórios Hub", cnpj: "33.444.555/0001-66", telefone: "(47) 3022-1144", whatsapp: "(47) 99100-2233", email: "atendimento@acessorioshub.com", categoria: "Acessórios", prazo: "7 dias", pagamento: "15/30/45", ultima: "2026-04-22", status: "Ativo" },
  { id: "F004", nome: "TecnoDistribuidora", cnpj: "44.555.666/0001-77", telefone: "(31) 3055-9988", whatsapp: "(31) 98800-7766", email: "vendas@tecnodist.com", categoria: "Carregadores / Cabos", prazo: "10 dias", pagamento: "30 dias", ultima: "2026-03-30", status: "Ativo" },
  { id: "F005", nome: "iSupply Imports", cnpj: "55.666.777/0001-88", telefone: "(11) 4002-1199", whatsapp: "(11) 91234-5566", email: "import@isupply.com", categoria: "Originais Apple", prazo: "15 dias", pagamento: "50/50", ultima: "2026-04-10", status: "Ativo" },
  { id: "F006", nome: "Pronta Peça", cnpj: "66.777.888/0001-99", telefone: "(85) 3111-2233", whatsapp: "—", email: "—", categoria: "Genéricos", prazo: "—", pagamento: "—", ultima: "2025-11-04", status: "Inativo" },
];

export const tecnicos = [
  { id: "T001", nome: "Lucas Almeida", cargo: "Técnico Sênior", especialidade: "Microsoldagem / Placa", status: "Ativo", abertas: 4, concluidas: 128, tempo: "2h 10min", comissao: 12, permissao: "Técnico" },
  { id: "T002", nome: "Bruno Costa", cargo: "Técnico Pleno", especialidade: "Telas / Baterias", status: "Ativo", abertas: 6, concluidas: 96, tempo: "55min", comissao: 10, permissao: "Técnico" },
  { id: "T003", nome: "Aline Martins", cargo: "Atendente", especialidade: "Atendimento / OS", status: "Ativo", abertas: 0, concluidas: 0, tempo: "—", comissao: 5, permissao: "Atendente" },
  { id: "T004", nome: "Diego Ramos", cargo: "Caixa / PDV", especialidade: "Vendas balcão", status: "Ativo", abertas: 0, concluidas: 0, tempo: "—", comissao: 3, permissao: "Caixa" },
  { id: "T005", nome: "Renata Lopes", cargo: "Gerente", especialidade: "Operação / Equipe", status: "Ativo", abertas: 0, concluidas: 0, tempo: "—", comissao: 0, permissao: "Gerente" },
];

export const equipamentos = [
  { id: "E001", marca: "Apple", modelo: "iPhone 11", tipo: "Smartphone", ano: 2019, pecas: ["Tela", "Bateria", "Conector de carga", "Câmera traseira"], defeitos: ["Tela quebrada", "Bateria viciada", "Não carrega"], checklist: ["Testar touch", "Testar Face ID", "Testar carga"], tempo: "1h", obs: "Procura alta — manter estoque." },
  { id: "E002", marca: "Apple", modelo: "iPhone 12", tipo: "Smartphone", ano: 2020, pecas: ["Tela OLED", "Bateria", "Tampa traseira"], defeitos: ["Tela trincada", "Tampa de vidro quebrada"], checklist: ["Face ID", "5G", "MagSafe"], tempo: "1h 15min", obs: "Tela cara — checar estoque iSupply." },
  { id: "E003", marca: "Samsung", modelo: "Galaxy A54", tipo: "Smartphone", ano: 2023, pecas: ["Tela Super AMOLED", "Bateria", "Conector USB-C"], defeitos: ["Tela quebrada", "Não carrega", "Câmera com mancha"], checklist: ["Digital", "Câmeras", "USB-C"], tempo: "50min", obs: "Modelo popular." },
  { id: "E004", marca: "Motorola", modelo: "Moto G8 Play", tipo: "Smartphone", ano: 2019, pecas: ["Tela IPS", "Bateria", "Conector micro-USB"], defeitos: ["Não carrega", "Tela escura"], checklist: ["Touch", "Carga", "Áudio"], tempo: "45min", obs: "—" },
  { id: "E005", marca: "Xiaomi", modelo: "Redmi Note 11", tipo: "Smartphone", ano: 2022, pecas: ["Tela AMOLED", "Bateria", "Conector USB-C"], defeitos: ["Tela quebrada", "Bateria viciada"], checklist: ["Touch", "Sensor digital", "Câmeras"], tempo: "55min", obs: "—" },
  { id: "E006", marca: "Acer", modelo: "Aspire 5 A515", tipo: "Notebook", ano: 2022, pecas: ["SSD", "Memória RAM", "Bateria", "Teclado"], defeitos: ["Lentidão", "Não liga", "Tela apagada"], checklist: ["POST", "SSD", "Bateria"], tempo: "1h 30min", obs: "Verificar BIOS." },
  { id: "E007", marca: "Dell", modelo: "Inspiron 15 3000", tipo: "Notebook", ano: 2021, pecas: ["SSD", "RAM", "Tela LCD", "Bateria"], defeitos: ["Não liga", "Tela quebrada"], checklist: ["POST", "Tela", "Carga"], tempo: "1h 30min", obs: "—" },
  { id: "E008", marca: "Sony", modelo: "PlayStation 5", tipo: "Console", ano: 2020, pecas: ["Leitor Blu-ray", "Cooler", "HDMI", "SSD"], defeitos: ["HDMI quebrado", "Superaquecimento", "Não lê disco"], checklist: ["HDMI", "Temperatura", "Disco"], tempo: "2h", obs: "Cuidar com pasta térmica." },
];

export const categorias = {
  produtos: ["Telas", "Baterias", "Conectores", "Capinhas", "Carregadores", "Películas", "Cabos"],
  servicos: ["Reparo de Tela", "Energia", "Microsoldagem", "Software", "Manutenção", "Reparo Físico"],
  marcas: ["Apple", "Samsung", "Motorola", "Xiaomi", "Acer", "Dell", "Sony", "Microsoft"],
  linhas: ["iPhone", "Galaxy A", "Galaxy S", "Moto G", "Redmi Note", "Aspire", "PlayStation"],
  tags: ["VIP", "Recorrente", "Garantia", "B2B", "Atacado", "Novo", "Parceiro", "Corporativo"],
};

export const auditoria = [
  { id: 1, usuario: "Renata Lopes", data: "2026-05-06 09:42", acao: "Criou", entidade: "Cliente • Patrícia Mendes", antes: "—", depois: "Cadastro completo", ip: "192.168.0.21" },
  { id: 2, usuario: "Bruno Costa", data: "2026-05-06 08:15", acao: "Editou", entidade: "Produto • Tela iPhone 11", antes: "Preço R$ 650", depois: "Preço R$ 690", ip: "192.168.0.34" },
  { id: 3, usuario: "Lucas Almeida", data: "2026-05-05 18:02", acao: "Alterou preço", entidade: "Serviço • Reparo de Placa", antes: "R$ 450", depois: "R$ 490", ip: "192.168.0.11" },
  { id: 4, usuario: "Renata Lopes", data: "2026-05-05 15:30", acao: "Desativou", entidade: "Serviço • Desbloqueio iCloud", antes: "Ativo", depois: "Inativo", ip: "192.168.0.21" },
  { id: 5, usuario: "Aline Martins", data: "2026-05-05 11:08", acao: "Atualizou", entidade: "Fornecedor • iParts BR", antes: "Prazo 7d", depois: "Prazo 5d", ip: "192.168.0.42" },
  { id: 6, usuario: "Renata Lopes", data: "2026-05-04 17:22", acao: "Removeu", entidade: "Técnico • João Antigo", antes: "Ativo", depois: "Removido", ip: "192.168.0.21" },
  { id: 7, usuario: "Sistema", data: "2026-05-04 09:00", acao: "Importação", entidade: "Produtos • 124 itens", antes: "—", depois: "118 ok / 6 erros", ip: "—" },
  { id: 8, usuario: "Diego Ramos", data: "2026-05-03 19:55", acao: "Criou", entidade: "Cliente • Eduardo Tech Store", antes: "—", depois: "Cadastro completo", ip: "192.168.0.55" },
];

export const kpis = [
  { label: "Clientes cadastrados", value: 1284, delta: "+42", icon: "Users" },
  { label: "Produtos ativos", value: 612, delta: "+18", icon: "Package" },
  { label: "Serviços cadastrados", value: 38, delta: "+3", icon: "Wrench" },
  { label: "Fornecedores ativos", value: 24, delta: "+1", icon: "Truck" },
  { label: "Técnicos cadastrados", value: 9, delta: "+0", icon: "HardHat" },
  { label: "Equipamentos / modelos", value: 142, delta: "+8", icon: "Smartphone" },
  { label: "Cadastros incompletos", value: 17, delta: "-4", icon: "AlertTriangle" },
  { label: "Atualizados este mês", value: 326, delta: "+126", icon: "RefreshCw" },
];

export const saude = [
  { label: "Clientes com telefone", value: 96 },
  { label: "Produtos com SKU", value: 92 },
  { label: "Produtos com preço", value: 88 },
  { label: "Serviços com garantia", value: 78 },
  { label: "Fornecedores com CNPJ", value: 100 },
  { label: "Equipamentos com peças compatíveis", value: 71 },
];
