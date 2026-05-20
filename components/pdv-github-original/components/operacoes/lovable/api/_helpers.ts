// Simulação de latência de rede para deixar a camada async realista.
export const delay = (ms = 120) => new Promise<void>((r) => setTimeout(r, ms));

export const uid = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

export const nowIso = () => new Date().toISOString();
