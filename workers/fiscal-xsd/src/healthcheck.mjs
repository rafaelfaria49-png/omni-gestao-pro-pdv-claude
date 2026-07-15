const response = await fetch("http://127.0.0.1:8080/health", {
  signal: AbortSignal.timeout(1_000),
})
if (!response.ok) process.exit(1)
const body = await response.json()
if (body.status !== "ok") process.exit(1)
