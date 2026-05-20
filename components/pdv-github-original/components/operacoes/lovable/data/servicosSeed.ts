import type { CatalogoServico } from "@/types/servico";
import { DEFAULT_STORE_ID } from "./lojasSeed";

const TERMO_TELA = `Garantia de 90 dias para troca de tela.

Esta garantia NÃO cobre:
• Quedas, impactos ou pressão sobre a tela.
• Contato com líquidos ou umidade excessiva.
• Mau uso, instalação de películas inadequadas ou tentativa de reparo por terceiros.
• Danos físicos visíveis após a entrega do equipamento.

A garantia é válida apenas mediante apresentação da OS e do termo assinado.`;

const TERMO_BATERIA = `Garantia de 90 dias para troca de bateria.

Esta garantia NÃO cobre:
• Uso de carregadores não originais ou de baixa qualidade.
• Sobrecarga, curto-circuito ou exposição a calor excessivo.
• Inchaço causado por uso inadequado.
• Contato com líquidos ou danos físicos.`;

const TERMO_CONECTOR = `Garantia de 90 dias para troca de conector de carga.

Esta garantia NÃO cobre:
• Uso de cabos não originais ou danificados.
• Sujeira, oxidação ou objetos no conector após a entrega.
• Quedas ou danos físicos.`;

const TERMO_FORMATACAO = `Garantia de 30 dias para serviço de formatação.

Esta garantia cobre apenas falhas relacionadas ao serviço executado.
NÃO cobre:
• Reinfecção por vírus após uso normal.
• Instalação de programas não autorizados pela loja.
• Perda de dados não comunicada previamente.`;

const TERMO_PLACA = `Garantia de 90 dias para reparo de placa.

Esta garantia NÃO cobre:
• Novos defeitos em componentes não reparados.
• Quedas, líquidos ou mau uso após a entrega.
• Tentativas de reparo por terceiros.`;

export const SERVICOS_SEED: CatalogoServico[] = [
  { id: "sv_tela", storeId: DEFAULT_STORE_ID, nome: "Troca de tela", categoria: "Hardware", custoInterno: 320, valorVenda: 690, prazoGarantiaDias: 90, termoGarantia: TERMO_TELA, ativo: true },
  { id: "sv_bateria", storeId: DEFAULT_STORE_ID, nome: "Troca de bateria", categoria: "Hardware", custoInterno: 110, valorVenda: 220, prazoGarantiaDias: 90, termoGarantia: TERMO_BATERIA, ativo: true },
  { id: "sv_conector", storeId: DEFAULT_STORE_ID, nome: "Troca de conector de carga", categoria: "Hardware", custoInterno: 60, valorVenda: 180, prazoGarantiaDias: 90, termoGarantia: TERMO_CONECTOR, ativo: true },
  { id: "sv_formatacao", storeId: DEFAULT_STORE_ID, nome: "Formatação e instalação", categoria: "Software", custoInterno: 30, valorVenda: 120, prazoGarantiaDias: 30, termoGarantia: TERMO_FORMATACAO, ativo: true },
  { id: "sv_placa", storeId: DEFAULT_STORE_ID, nome: "Reparo de placa", categoria: "Hardware", custoInterno: 200, valorVenda: 480, prazoGarantiaDias: 90, termoGarantia: TERMO_PLACA, ativo: true },
];
