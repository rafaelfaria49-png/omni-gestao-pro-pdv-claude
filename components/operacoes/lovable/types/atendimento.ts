// Atendimento rápido — registro leve, sem abrir uma OS completa.
// Ideal para dúvidas, orçamentos verbais e consultas que não viram serviço.
export interface AtendimentoRapido {
  id: string;
  storeId: string;
  clienteNome: string;
  telefone?: string;
  problema: string;
  acaoTomada: string;
  atendente: string;
  criadoEm: string;
  convertidoEmOSId?: string;
}
