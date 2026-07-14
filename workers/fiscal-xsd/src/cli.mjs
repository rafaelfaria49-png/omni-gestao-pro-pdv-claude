import { createFiscalXsdValidator, POLICY } from "./validator.mjs"

const chunks = []
for await (const chunk of process.stdin) chunks.push(chunk)

try {
  const request = JSON.parse(Buffer.concat(chunks).toString("utf8"))
  const validator = createFiscalXsdValidator()
  const result = await validator.validate(request.xmlPayload, {
    maxPayloadBytes: request.maxPayloadBytes ?? POLICY.maxPayloadBytes,
    timeoutMs: request.timeoutMs ?? POLICY.timeoutMs,
  })
  process.stdout.write(`${JSON.stringify(result)}\n`)
  process.exitCode = result.valid ? 0 : 2
} catch {
  process.stdout.write(
    `${JSON.stringify({
      valid: false,
      outcome: "FALHA_PERMANENTE",
      issues: [{ code: "cli_request_invalid", message: "Envelope CLI inválido." }],
      engine: null,
      durationMs: 0,
    })}\n`,
  )
  process.exitCode = 1
}
