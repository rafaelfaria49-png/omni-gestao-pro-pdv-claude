import { useForm } from "react-hook-form";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Form, FormField, FormItem, FormLabel, FormControl } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Employee } from "./TeamPanel";

export type EmployeeFormMode = "create" | "edit";

interface EmployeeFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: EmployeeFormMode;
  employee?: Employee | null;
}

type EmployeeFormValues = {
  name: string;
  email: string;
  role: Employee["role"];
  store: string;
};

export function EmployeeFormSheet({ open, onOpenChange, mode, employee }: EmployeeFormSheetProps) {
  const form = useForm<EmployeeFormValues>({
    defaultValues: {
      name: employee?.name ?? "",
      email: "",
      role: employee?.role ?? "Vendedor",
      store: "",
    },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[450px] overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle>{mode === "create" ? "Adicionar Colaborador" : "Editar Colaborador"}</SheetTitle>
          <SheetDescription>Defina o cargo e as permissões do funcionário.</SheetDescription>
        </SheetHeader>
        
        <Form {...form}>
          <form className="space-y-4">
            <FormField name="name" render={({ field }) => (
              <FormItem><FormLabel>Nome Completo</FormLabel><FormControl><Input placeholder="Ex: João Silva" {...field} /></FormControl></FormItem>
            )} />
            <FormField name="email" render={({ field }) => (
              <FormItem><FormLabel>E-mail (Login)</FormLabel><FormControl><Input type="email" placeholder="joao@empresa.com" {...field} /></FormControl></FormItem>
            )} />
            <FormField name="role" render={({ field }) => (
              <FormItem>
                <FormLabel>Cargo</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Selecione o cargo" /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="Dono">Dono</SelectItem>
                    <SelectItem value="Gerente">Gerente</SelectItem>
                    <SelectItem value="Marketing">Marketing</SelectItem>
                    <SelectItem value="Operador">Operador</SelectItem>
                    <SelectItem value="Vendedor">Vendedor</SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            )} />
            
            <div className="pt-6 flex gap-3">
              <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" className="flex-1 bg-primary text-primary-foreground hover:opacity-90">Confirmar</Button>
            </div>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
