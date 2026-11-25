// Reusa o bootstrap/preflight/NextAuth/limpeza de credenciais canônicos da P02.
process.env.VESTUARIO_E2E_PHASE = "p03"
process.env.VESTUARIO_P03_QA_SEED_LEGACY = "1"
await import("./run-vestuario-p02-e2e.mjs")
