type ActionType = "text" | "image" | "voice" | "video" | "avatar"

const COSTS: Record<ActionType, number> = {
  text: 0,
  image: 20,
  voice: 50,
  video: 800,
  avatar: 300,
}

export function getCost(type: ActionType) {
  return COSTS[type]
}

