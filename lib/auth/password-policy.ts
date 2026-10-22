import { z } from "zod"

// bcrypt limita a 72 bytes. Validação em bytes evita truncamento silencioso.
export const newPasswordSchema = z.string().min(12).max(72)
  .refine((v) => new TextEncoder().encode(v).length <= 72, "Senha excede 72 bytes.")
  .refine((v) => /[a-z]/.test(v) && /[A-Z]/.test(v) && /[0-9]/.test(v), "Use letras maiúsculas, minúsculas e números.")

export function generateTemporaryPassword(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return "aA7!" + Array.from(bytes, (v) => v.toString(16).padStart(2, "0")).join("")
}
