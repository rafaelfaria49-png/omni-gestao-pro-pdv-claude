import { useForm } from "react-hook-form";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Form, FormField, FormItem, FormLabel, FormControl } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface StoreFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  store?: any;
}

export function StoreFormSheet({ open, onOpenChange, mode, store }: StoreFormSheetProps) {
  const form = useForm({
    defaultValues: store || { name: "", cnpj: "", manager: "", city: "" }
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[450px] overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle>{mode === "create" ? "Nova Unidade" : "Editar Unidade"}</SheetTitle>
          <SheetDescription>Cadastre ou altere os dados da filial na sua rede.</SheetDescription>
        </SheetHeader>
        
        <Form {...form}>
          <form className="space-y-4">
            <FormField name="name" render={({ field }) => (
              <FormItem><FormLabel>Nome da Loja</FormLabel><FormControl><Input placeholder="Ex: Matriz Centro" {...field} /></FormControl></FormItem>
            )} />
            <FormField name="cnpj" render={({ field }) => (
              <FormItem><FormLabel>CNPJ</FormLabel><FormControl><Input placeholder="00.000.000/0000-00" {...field} /></FormControl></FormItem>
            )} />
            <FormField name="manager" render={({ field }) => (
              <FormItem><FormLabel>Gerente Responsável</FormLabel><FormControl><Input placeholder="Nome do gerente" {...field} /></FormControl></FormItem>
            )} />
            <FormField name="city" render={({ field }) => (
              <FormItem><FormLabel>Cidade / Estado</FormLabel><FormControl><Input placeholder="Ex: São Paulo - SP" {...field} /></FormControl></FormItem>
            )} />
            
            <div className="pt-6 flex gap-3">
              <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" className="flex-1 bg-primary text-primary-foreground hover:opacity-90">Salvar Alterações</Button>
            </div>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
