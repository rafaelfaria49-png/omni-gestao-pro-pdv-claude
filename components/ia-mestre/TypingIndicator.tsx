"use client"

import { motion } from "framer-motion"
import { Bot } from "lucide-react"

export function TypingIndicator() {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-primary shadow-glow">
        <Bot className="h-4 w-4 text-primary-foreground" />
      </div>
      <div className="rounded-2xl rounded-tl-sm border border-border/60 bg-bubble-ai px-4 py-3 shadow-elegant">
        <div className="flex items-center gap-1">
          <span className="typing-dot h-2 w-2 rounded-full bg-muted-foreground" style={{ animationDelay: "0s" }} />
          <span className="typing-dot h-2 w-2 rounded-full bg-muted-foreground" style={{ animationDelay: "0.2s" }} />
          <span className="typing-dot h-2 w-2 rounded-full bg-muted-foreground" style={{ animationDelay: "0.4s" }} />
        </div>
      </div>
    </motion.div>
  )
}

