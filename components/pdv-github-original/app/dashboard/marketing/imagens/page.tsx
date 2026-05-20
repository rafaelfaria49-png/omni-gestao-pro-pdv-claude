import { ImageIcon } from "lucide-react"

export default function MarketingImagensPlaceholderPage() {
  return (
    <div className="grid min-h-[calc(100vh-10rem)] place-items-center p-6">
      <div className="w-full max-w-lg rounded-3xl border border-border bg-card p-8 text-center shadow-card">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
          <ImageIcon className="h-7 w-7" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Em Breve</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Em Breve: Esta ferramenta está sendo preparada pela nossa equipe.
        </p>
      </div>
    </div>
  )
}

