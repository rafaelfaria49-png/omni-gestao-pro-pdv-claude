import { prisma } from "@/lib/prisma"

type ActionType = "text" | "image" | "voice" | "video" | "avatar"

const DAILY_LIMITS: Record<ActionType, number> = {
  text: 9999,
  image: 100,
  voice: 50,
  video: 10,
  avatar: 20,
}

export async function checkDailyLimit({
  userId,
  action,
}: {
  userId: string
  action: ActionType
}) {
  const start = new Date()
  start.setHours(0, 0, 0, 0)

  const usageToday = await prisma.usage.count({
    where: {
      userId,
      action,
      createdAt: { gte: start },
    },
  })

  const limit = DAILY_LIMITS[action]

  if (usageToday >= limit) {
    throw new Error(`Limite diário atingido para ${action}`)
  }

  return true
}

