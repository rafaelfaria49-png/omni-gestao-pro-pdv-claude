/**
 * Alias físico da rota em `app/api/whatsapp/webhook`.
 * Na Vercel, `rewrites()` em next.config às vezes não expõem `/api/webhooks/whatsapp` (404 no edge),
 * enquanto `/api/whatsapp/webhook` responde normalmente. Este arquivo garante que a URL histórica
 * da Meta (`/api/webhooks/whatsapp`) sempre tenha um Route Handler real.
 */
export { GET, OPTIONS, POST, dynamic, revalidate, runtime } from "@/app/api/whatsapp/webhook/route"
