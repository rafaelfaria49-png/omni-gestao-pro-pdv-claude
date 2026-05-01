import { getCost } from "./credits"
import { prisma } from "@/lib/prisma"

export async function validateCredits({
  userId,
  action,
}: {
  userId: string
  action: "text" | "image" | "voice" | "video" | "avatar"
}) {
  const cost = getCost(action)

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { credits: true },
  })
  if (!user) {
    throw new Error("Usuário não encontrado")
  }

  if (user.credits < cost) {
    throw new Error("Créditos insuficientes")
  }

  return { cost, currentCredits: user.credits }
}

