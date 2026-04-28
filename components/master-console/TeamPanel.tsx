import { useState } from 'react';
import { Plus, Crown, Briefcase, UserCog, MoreHorizontal, Users, KeyRound, UserMinus, ChevronRight, Activity, Pencil } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { Store } from './StoreList';
import { EmployeeAccessSheet } from './EmployeeAccessSheet';
import { EmployeeFormSheet, type EmployeeFormMode } from './EmployeeFormSheet';
import { ActivityLog, type ActivityEntry } from './ActivityLog';

export interface Employee { id: string; name: string; role: 'Dono' | 'Gerente' | 'Operador' | 'Caixa'; initials: string; status?: 'Ativo' | 'Inativo'; }
interface TeamPanelProps { store: Store; employees: Employee[]; activity: ActivityEntry[]; }

const roleStyles: Record<Employee['role'], { className: string; icon: typeof Crown }> = {
  Dono: { className: 'bg-purple/10 text-purple border-purple/20', icon: Crown },
  Gerente: { className: 'bg-info/10 text-info border-info/20', icon: Briefcase },
  Operador: { className: 'bg-muted text-muted-foreground border-border', icon: UserCog },
  Caixa: { className: 'bg-success/10 text-success border-success/20', icon: UserCog },
};

export function TeamPanel({ store, employees, activity }: TeamPanelProps) {
  const [selectedEmp, setSelectedEmp] = useState<Employee | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<EmployeeFormMode>('create');
  const [formEmp, setFormEmp] = useState<Employee | null>(null);

  function openProfile(emp: Employee) { setSelectedEmp(emp); setSheetOpen(true); }
  function openCreate() { setFormMode('create'); setFormEmp(null); setFormOpen(true); }
  function openEdit(emp: Employee) { setFormMode('edit'); setFormEmp(emp); setFormOpen(true); }

  return (
    <>
      <aside className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card animate-fade-in">
        <header className="border-b border-border px-6 py-4">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Users className="h-3.5 w-3.5" /><span>Gestão da filial</span></div>
          <h2 className="mt-1 text-lg font-bold tracking-tight text-foreground">{store.name}</h2>
          <p className="text-xs text-muted-foreground">{store.cnpj}</p>
        </header>
        <Tabs defaultValue="team" className="flex flex-1 flex-col">
          <div className="px-6 pt-4">
            <TabsList className="grid w-full grid-cols-2 rounded-xl bg-panel p-1">
              <TabsTrigger value="team" className="rounded-lg text-xs font-semibold data-[state=active]:bg-card data-[state=active]:shadow-elegant"><Users className="mr-1.5 h-3.5 w-3.5" />Colaboradores</TabsTrigger>
              <TabsTrigger value="logs" className="rounded-lg text-xs font-semibold data-[state=active]:bg-card data-[state=active]:shadow-elegant"><Activity className="mr-1.5 h-3.5 w-3.5" />Logs de Atividade</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="team" className="flex-1 overflow-y-auto px-6 pb-6 pt-4 data-[state=inactive]:hidden">
            <Button size="sm" variant="outline" onClick={openCreate} className="mb-4 w-full rounded-xl border-dashed font-semibold transition-smooth hover:border-info hover:text-info"><Plus className="mr-1.5 h-4 w-4" />Adicionar Colaborador</Button>
            <ul className="space-y-2">
              {employees.map((emp) => {
                const r = roleStyles[emp.role] || roleStyles['Operador']; const Icon = r.icon; const inactive = emp.status === 'Inativo';
                return (
                  <li key={emp.id} className={cn('group relative flex items-center gap-3 rounded-xl border border-border bg-panel/50 p-3 transition-smooth hover:bg-panel hover:shadow-elegant', inactive && 'opacity-60')}>
                    <button onClick={() => openProfile(emp)} className="absolute inset-0 rounded-xl cursor-pointer" aria-label={`Abrir perfil de ${emp.name}`} />
                    <Avatar className="relative h-10 w-10 ring-2 ring-background"><AvatarFallback className="bg-gradient-to-br from-info/30 to-purple/30 text-xs font-bold text-foreground">{emp.initials}</AvatarFallback></Avatar>
                    <div className="relative min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">{emp.name}</p>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <Badge variant="outline" className={cn('gap-1 px-1.5 py-0 text-[10px] font-semibold', r.className)}><Icon className="h-2.5 w-2.5" />{emp.role}</Badge>
                        <span className={cn('inline-flex items-center gap-1 text-[10px] font-medium', inactive ? 'text-muted-foreground' : 'text-success')}><span className={cn('h-1.5 w-1.5 rounded-full', inactive ? 'bg-muted-foreground' : 'bg-success')} />{inactive ? 'Inativo' : 'Ativo'}</span>
                      </div>
                    </div>
                    <div className="relative z-10 flex items-center gap-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-muted text-muted-foreground"><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48 rounded-xl border-border bg-popover shadow-card">
                          <DropdownMenuItem onClick={() => openEdit(emp)} className="rounded-lg text-sm font-medium cursor-pointer"><Pencil className="mr-2 h-4 w-4 text-info" />Editar</DropdownMenuItem>
                          <DropdownMenuItem className="rounded-lg text-sm font-medium cursor-pointer"><KeyRound className="mr-2 h-4 w-4 text-info" />Resetar Senha</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="rounded-lg text-sm font-medium text-destructive focus:text-destructive cursor-pointer"><UserMinus className="mr-2 h-4 w-4" />Demitir / Inativar</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </li>
                );
              })}
            </ul>
          </TabsContent>
          <TabsContent value="logs" className="flex-1 overflow-y-auto px-6 pb-6 pt-4 data-[state=inactive]:hidden"><ActivityLog entries={activity} /></TabsContent>
        </Tabs>
      </aside>
      <EmployeeAccessSheet employee={selectedEmp} open={sheetOpen} onOpenChange={setSheetOpen} />
      <EmployeeFormSheet open={formOpen} onOpenChange={setFormOpen} mode={formMode} employee={formEmp} />
    </>
  );
}
