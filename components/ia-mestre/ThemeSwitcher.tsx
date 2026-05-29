"use client";

import { motion } from "framer-motion";
import { Sun, Gem, Snowflake, Moon, Zap, Hexagon, Star, Coffee } from "lucide-react";
import { useTheme } from "@/components/theme/ThemeProvider";
import { useEffect, useState } from "react";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";

type Theme =
  | "light"
  | "soft-ice"
  | "midnight"
  | "black-edition"
  | "quantum-violet"
  | "coffee-gold"
  | "ruby-black"
  | "neon-ice"
  | "violet-ice"
  | "coffee-cream";

const options: { value: Theme; label: string; icon: any; color: string }[] = [
  { value: "light", label: "Light", icon: Sun, color: "rgb(239, 68, 68)" },
  { value: "ruby-black", label: "Ruby Black", icon: Gem, color: "rgb(185, 28, 28)" },
  { value: "soft-ice", label: "Soft Ice", icon: Snowflake, color: "rgb(56, 189, 248)" },
  { value: "midnight", label: "Midnight", icon: Moon, color: "rgb(59, 130, 246)" },
  { value: "neon-ice", label: "Neon Ice", icon: Zap, color: "rgb(6, 182, 212)" },
  { value: "black-edition", label: "Black", icon: Hexagon, color: "rgb(34, 197, 94)" },
  { value: "violet-ice", label: "Violet Ice", icon: Star, color: "rgb(168, 85, 247)" },
  { value: "quantum-violet", label: "Quantum Violet", icon: Gem, color: "rgb(139, 92, 246)" },
  { value: "coffee-cream", label: "Coffee Cream", icon: Coffee, color: "rgb(222, 184, 135)" },
  { value: "coffee-gold", label: "Coffee Gold", icon: Coffee, color: "rgb(212, 175, 55)" },
];

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [hovered, setHovered] = useState<Theme | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="h-10 w-[340px] rounded-xl border border-border/80 bg-card/60 backdrop-blur-md" />;
  }

  return (
    <TooltipProvider delayDuration={100}>
      <div className="relative inline-flex items-center gap-1 rounded-xl border border-border/80 bg-card/60 p-1 backdrop-blur-md shadow-soft">
        {options.map((opt) => {
          const Icon = opt.icon;
          const active = theme === opt.value;
          const isHovered = hovered === opt.value;
          
          const iconColor = active || isHovered ? opt.color : "rgb(156, 163, 175)";
          
          return (
            <Tooltip key={opt.value}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setTheme(opt.value)}
                  onMouseEnter={() => setHovered(opt.value)}
                  onMouseLeave={() => setHovered(null)}
                  className="relative flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-200"
                  aria-label={opt.label}
                  type="button"
                >
                  {active && (
                    <motion.span
                      layoutId="active-theme-bg"
                      className="absolute inset-0 rounded-lg bg-muted/80 border border-border/60 shadow-sm"
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    />
                  )}
                  <Icon 
                    className="h-4 w-4 transition-all duration-300 relative z-10" 
                    style={{ 
                      color: iconColor,
                      transform: active ? "scale(1.1)" : "scale(1)",
                      filter: active ? `drop-shadow(0 0 4px ${opt.color}40)` : "none"
                    }}
                  />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="z-50 text-[11px] font-semibold bg-popover text-popover-foreground border border-border shadow-md px-2 py-1">
                {opt.label}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
