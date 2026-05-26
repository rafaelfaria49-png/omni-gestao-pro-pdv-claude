import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { ExternalLink } from "lucide-react";

/** Legado — não montado no Master Console. CRUD real em /dashboard/unidades. */
interface StoreFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
}

export function StoreFormSheet({ open, onOpenChange, mode }: StoreFormSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[450px] overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle>{mode === "create" ? "Nova unidade" : "Editar unidade"}</SheetTitle>
          <SheetDescription>
            <Badge variant="secondary" className="mb-2 font-normal">
              Use Gestão da Rede
            </Badge>
            <span className="block text-sm text-muted-foreground">
              Criação e edição de filiais persistem em Gestão da Rede, não neste formulário.
            </span>
          </SheetDescription>
        </SheetHeader>
        <Button className="w-full" asChild>
          <Link href="/dashboard/unidades" onClick={() => onOpenChange(false)}>
            Abrir Gestão da Rede
            <ExternalLink className="ml-2 h-4 w-4" />
          </Link>
        </Button>
        <Button type="button" variant="ghost" className="mt-3 w-full" onClick={() => onOpenChange(false)}>
          Fechar
        </Button>
      </SheetContent>
    </Sheet>
  );
}
