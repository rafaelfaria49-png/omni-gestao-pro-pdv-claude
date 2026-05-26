import { useForm } from "react-hook-form";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Form, FormField, FormItem, FormLabel, FormControl } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Legado — não montado no Master Console. Gestão real em Configurações → Utilizadores. */
export type EmployeeFormMode = "create" | "edit";

interface EmployeeFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: EmployeeFormMode;
}

export function EmployeeFormSheet({ open, onOpenChange, mode }: EmployeeFormSheetProps) {
  const form = useForm({
    defaultValues: { name: "", email: "", role: "VENDEDOR" },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[450px] overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle>{mode === "create" ? "Adicionar colaborador" : "Editar colaborador"}</SheetTitle>
          <SheetDescription>
            <Badge variant="secondary" className="mb-2 font-normal">
              Em breve neste painel
            </Badge>
            <span className="block text-sm text-muted-foreground">
              Utilize Configurações → Utilizadores para criar contas com persistência real.
            </span>
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form className="space-y-4 opacity-60 pointer-events-none" aria-disabled>
            <FormField name="name" render={({ field }) => (
              <FormItem><FormLabel>Nome completo</FormLabel><FormControl><Input placeholder="Ex: João Silva" {...field} disabled /></FormControl></FormItem>
            )} />
            <FormField name="email" render={({ field }) => (
              <FormItem><FormLabel>E-mail (login)</FormLabel><FormControl><Input type="email" placeholder="joao@empresa.com" {...field} disabled /></FormControl></FormItem>
            )} />
            <FormField name="role" render={({ field }) => (
              <FormItem>
                <FormLabel>Cargo</FormLabel>
                <Select disabled value={field.value}>
                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="VENDEDOR">Vendedor</SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            )} />
          </form>
        </Form>

        <div className="pt-6 flex gap-3">
          <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
