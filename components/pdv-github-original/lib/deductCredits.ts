import { prisma } from "@/lib/prisma"

export async function deductCredits({
  userId,
  action,
  cost,
}: {
  userId: string
  action: "text" | "image" | "voice" | "video" | "avatar"
  cost: number
}) {
  if (!Number.isFinite(cost) || cost <= 0) return true

  await prisma.$transaction(async (tx) => {
    const updated = await tx.user.updateMany({
      where: { id: userId, credits: { gte: cost } },
      data: { credits: { decrement: cost } },
    })
    if (updated.count !== 1) {
      const exists = await tx.user.findUnique({ where: { id: userId }, select: { id: true } })
      if (!exists) throw new Error("Usuário não encontrado")
      throw new Error("Créditos insuficientes")
    }

    await tx.usage.create({
      data: { userId, action, cost },
      select: { id: true },
    })
  })

  return true
}

