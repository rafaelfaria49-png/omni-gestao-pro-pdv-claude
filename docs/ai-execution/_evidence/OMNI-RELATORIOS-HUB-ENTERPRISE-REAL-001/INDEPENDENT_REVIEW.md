# Revisão independente da publicação compatível com a350

Revisor: subagente reports_independent_review, autorizado pelo usuário, somente leitura. Base ancorada51265894a8a019fbd5e679003de0b08dd95feba9.

A análise inicial do CAS global foi superada pela restrição explícita do usuário e pela constatação da PR350 já integrada. Essa proposta não está na cadeia de publicação. A revisão abaixo trata dos deltas reconstruídos, preservando a autenticação por sessão da main.

## Primeiros cinco deltas

Conferidos:8581258←5126589, b4420a9←8581258,07b42b2←b4420a9,44da3f8←07b42b2,c4e5dbd←44da3f8. Sem achados acionáveis remanescentes. Fontes dos leitores equivalentes à implementação já revisada; credenciais QA efêmeras e manifesto ignorado; nenhuma alteração dos arquivos de auth/schema/tipos/Electron/Vestuário.

PR5 verifica o hook real da main: off sem novas consultas, on por sid, A revogada sem afetar B/outra conta ou versão, e limites declarados do teste legado. Os limites herdados da350 estão explicitados em AUTH_LOGOUT.md, sem se assumir corrigidos.

## Interface, PDF e CI

A recomposição de UI, PDF e inspetor auxiliar foi conferida contra a versão revisada. Consultas/downloads abortados por escopo, erro recuperável para resposta divergente e data inválida, detalhes úteis de origem e ausência de payloads pessoais brutos preservados.

Runner CI: banco novo em loopback, URLs substituídas, credenciais aleatórias ignoradas, schema apenas nesse alvo, migration de deploy desabilitada, nenhum upload e cleanup restrito ao container que iniciou. O ajuste pedido para paths de next.config/public cache e dependências de auth foi aplicado.

O sexto head fechado será novamente conferido antes do push. Esta é revisão estática: o revisor não executa QA nem aprova merge/Production. Resultados de execução estão separados no REPORT.md e nos jobs remotos por SHA.
