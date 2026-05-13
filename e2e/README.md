# E2E — Playwright (Fase 1)

Smoke tests contra a app Next.js em execução (porta **3000** por defeito).

## Variáveis de ambiente

| Variável | Obrigatório | Descrição |
|----------|-------------|-----------|
| `PLAYWRIGHT_E2E_EMAIL` | Não | Por defeito `admin@rafacell.com.br` |
| `PLAYWRIGHT_E2E_PASSWORD` ou `ADMIN_DEFAULT_PASSWORD` | **Sim** (setup) | Credencial NextAuth do utilizador de teste |
| `PLAYWRIGHT_BASE_URL` | Não | Por defeito `http://127.0.0.1:3000` |
| `SKIP_WEBSERVER=1` | Não | Não arranca `npm run dev` (usa servidor já a correr) |
| `PLAYWRIGHT_PDV_SKU` | Não | Se definido, o teste do PDV tenta adicionar produto por código/nome |

No Windows PowerShell, com `.env` na raiz do projeto:

```powershell
Get-Content .env | ForEach-Object { if ($_ -match '^([^#=]+)=(.*)$') { [Environment]::SetEnvironmentVariable($matches[1], $matches[2].Trim('"'), 'Process') } }
npm run test:e2e
```

Ou exporte manualmente `ADMIN_DEFAULT_PASSWORD` antes de `npm run test:e2e`.

## Comandos

```bash
npm run test:e2e          # arranca dev se necessário (reuseExistingServer)
SKIP_WEBSERVER=1 npm run test:e2e
npm run test:e2e:ui
npx playwright install chromium   # primeira vez / após upgrade
```

## Estrutura

- `auth.setup.ts` — login e `e2e/.auth/storage.json`
- `specs/*.spec.ts` — cenários smoke
