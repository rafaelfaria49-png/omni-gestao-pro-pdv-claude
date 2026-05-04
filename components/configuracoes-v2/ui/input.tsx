import * as React from 'react'

import { cn } from '@/components/configuracoes-v2/lib/utils'

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(function Input(
  { className, type, ...props },
  ref
) {
  return (
    <input
      ref={ref}
      type={type}
      data-slot="input"
      className={cn(
        'file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground h-11 w-full min-w-0 rounded-lg border border-[hsl(var(--border))] bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        'dark:border-white/10 dark:bg-black/60 dark:backdrop-blur-md',
        'focus:border-[hsl(var(--border))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.3)]',
        'focus-visible:border-[hsl(var(--border))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary)/0.3)]',
        'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
        className,
      )}
      {...props}
    />
  )
})

export { Input }
