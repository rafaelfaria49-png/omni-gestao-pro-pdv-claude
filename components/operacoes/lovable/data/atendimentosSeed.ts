import type { AtendimentoRapido } from "@/types/atendimento";
import { DEFAULT_STORE_ID } from "./lojasSeed";

const iso = (h: number) => new Date(Date.now() + h * 3600 * 1000).toISOString();

export const ATENDIMENTOS_SEED: AtendimentoRapido[] = [
  {
    id: "at_001",
    storeId: DEFAULT_STORE_ID,
    clienteNome: "Renata Lopes",
    telefone: "(11) 98877-1122",
    problema: "Dúvida sobre preço de troca de tela iPhone 12.",
    acaoTomada: "Orçamento informado: R$ 690. Cliente vai pensar.",
    atendente: "Atendimento Balcão",
    criadoEm: iso(-3),
  },
  {
    id: "at_002",
    storeId: DEFAULT_STORE_ID,
    clienteNome: "Carlos Bento",
    telefone: "(11) 99711-2244",
    problema: "Aparelho não carrega, suspeita de cabo.",
    acaoTomada: "Testado com cabo da loja, voltou a carregar. Sem cobrança.",
    atendente: "Lucas Pereira",
    criadoEm: iso(-26),
  },
];
