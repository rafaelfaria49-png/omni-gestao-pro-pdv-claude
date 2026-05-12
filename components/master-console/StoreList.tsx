import { useState } from 'react';
import { Plus, Store as StoreIcon, MapPin, User, CheckCircle2, MoreHorizontal, Pencil, PauseCircle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { StoreFormSheet } from './StoreFormSheet';

export interface Store { id: string; name: string; cnpj: string; manager: string; status: 'Ativa' | 'Pausada'; city: string; }
interface StoreListProps {
  stores: Store[];
  selectedId: string;
  onSelect: (id: string) => void;
  onDelete?: (id: string) => Promise<void>;
}

export function StoreList({ stores, selectedId, onSelect, onDelete }: StoreListProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [formStore, setFormStore] = useState<Store | null>(null);

  function openCreate() {
    setFormMode('create');
    setFormStore(null);
    setFormOpen(true);
  }

  function openEdit(store: Store) {
    setFormMode('edit');
    setFormStore(store);
    setFormOpen(true);
  }

  return (
    <>
      <section className="rounded-2xl border border-border bg-card shadow-card">
        <header className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-lg font-bold tracking-tight">Mapa de Lojas</h2>
            <p className="text-xs text-muted-foreground">Selecione uma filial para gerenciar</p>
          </div>
          <Button size="sm" onClick={openCreate} className="rounded-xl font-semibold shadow-elegant transition-smooth hover:shadow-glow">
            <Plus className="mr-1.5 h-4 w-4" />
            Adicionar Nova Filial
          </Button>
        </header>
        <ul className="divide-y divide-border">
          {stores.map((store) => {
            const active = store.id === selectedId;
            return (
              <li key={store.id} className="group/row relative">
                <button
                  onClick={() => onSelect(store.id)}
                  className={cn('group flex w-full items-center gap-4 px-6 py-4 pr-14 text-left transition-smooth', active ? 'bg-panel' : 'hover:bg-panel/60')}
                >
                  <div className={cn('icon-tile h-11 w-11 shrink-0 ring-1 transition-smooth', active ? 'bg-info/15 text-info ring-info/30' : 'bg-muted text-muted-foreground ring-border group-hover:bg-info/10 group-hover:text-info')}>
                    <StoreIcon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-sm font-semibold text-foreground">{store.name}</h3>
                      <Badge variant="secondary" className="border border-success/20 bg-success/10 px-2 py-0 text-[10px] font-semibold text-success">
                        <CheckCircle2 className="mr-1 h-3 w-3" />
                        {store.status}
                      </Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="font-mono">{store.cnpj}</span>
                      <span className="inline-flex items-center gap-1"><User className="h-3 w-3" />{store.manager}</span>
                      <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{store.city}</span>
                    </div>
                  </div>
                  <div className={cn('h-2 w-2 shrink-0 rounded-full transition-smooth', active ? 'bg-info shadow-glow' : 'bg-transparent')} />
                </button>
                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <button className="rounded-lg p-1.5 text-muted-foreground opacity-0 transition-smooth hover:bg-muted hover:text-foreground group-hover/row:opacity-100 data-[state=open]:opacity-100 data-[state=open]:bg-muted" aria-label="Ações da loja">
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48 rounded-xl border-border bg-popover shadow-card">
                      <DropdownMenuItem onClick={() => openEdit(store)} className="rounded-lg text-sm font-medium"><Pencil className="mr-2 h-4 w-4 text-info" />Editar Dados</DropdownMenuItem>
                      <DropdownMenuItem className="rounded-lg text-sm font-medium"><PauseCircle className="mr-2 h-4 w-4 text-warning" />Pausar Filial</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="rounded-lg text-sm font-medium text-destructive focus:text-destructive"
                        onClick={() => onDelete?.(store.id)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
      <StoreFormSheet open={formOpen} onOpenChange={setFormOpen} mode={formMode} store={formStore} />
    </>
  );
}
