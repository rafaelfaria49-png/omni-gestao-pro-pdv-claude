import { useState } from 'react';
import Link from 'next/link';
import {
  Plus, Store as StoreIcon, MapPin, User, CheckCircle2,
  MoreHorizontal, Pencil, PauseCircle, Trash2, ShieldCheck, ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface Store {
  id: string;
  name: string;
  cnpj: string;
  manager: string;
  status: 'Ativa' | 'Pausada';
  city: string;
}

interface StoreListProps {
  stores: Store[];
  selectedId: string;
  onSelect: (id: string) => void;
  onDelete?: (id: string) => Promise<void>;
  onDeleteError?: (message: string) => void;
  canManage?: boolean;
  primaryStoreId?: string;
}

export function StoreList({
  stores,
  selectedId,
  onSelect,
  onDelete,
  onDeleteError,
  canManage = false,
  primaryStoreId: primaryStoreIdProp,
}: StoreListProps) {
  const [deleteTarget, setDeleteTarget] = useState<Store | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const primaryStoreId = primaryStoreIdProp ?? stores[0]?.id ?? '';

  async function confirmDelete() {
    if (!deleteTarget || !onDelete) return;
    if (deleteConfirmText.trim() !== deleteTarget.id) return;
    setDeleting(true);
    try {
      await onDelete(deleteTarget.id);
      setDeleteTarget(null);
      setDeleteConfirmText('');
    } catch (e) {
      onDeleteError?.(e instanceof Error ? e.message : 'Falha ao excluir unidade');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <section className="rounded-2xl border border-border bg-card shadow-card">
        <header className="flex items-center justify-between gap-3 border-b border-border px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-bold tracking-tight">Mapa de Lojas</h2>
            <p className="text-xs text-muted-foreground">Selecione uma filial para gerenciar</p>
          </div>
          {canManage ? (
            <Button size="sm" asChild className="shrink-0 rounded-xl font-semibold shadow-elegant transition-smooth hover:shadow-glow">
              <Link href="/dashboard/unidades">
                <Plus className="mr-1.5 h-4 w-4" />
                Gerir unidades
                <ExternalLink className="ml-1.5 h-3.5 w-3.5 opacity-70" />
              </Link>
            </Button>
          ) : null}
        </header>

        {stores.length === 0 ? (
          <div className="flex flex-col items-center gap-4 px-8 py-14 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <StoreIcon className="h-6 w-6 text-primary/70" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">Nenhuma filial cadastrada</p>
              <p className="max-w-[260px] text-xs text-muted-foreground">
                Crie e edite unidades na gestão da rede — dados persistidos via API.
              </p>
            </div>
            {canManage ? (
              <Button size="sm" variant="outline" asChild className="rounded-xl">
                <Link href="/dashboard/unidades">
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Abrir Gestão da Rede
                </Link>
              </Button>
            ) : null}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {stores.map((store) => {
              const active = store.id === selectedId;
              const isPrincipal = store.id === primaryStoreId;
              return (
                <li key={store.id} className="group/row relative">
                  <button
                    type="button"
                    onClick={() => onSelect(store.id)}
                    className={cn(
                      'group flex w-full items-center gap-4 px-6 py-4 pr-14 text-left transition-smooth',
                      active ? 'bg-panel' : 'hover:bg-panel/60',
                    )}
                  >
                    <div
                      className={cn(
                        'icon-tile h-11 w-11 shrink-0 ring-1 transition-smooth',
                        active
                          ? 'bg-info/15 text-info ring-info/30'
                          : 'bg-muted text-muted-foreground ring-border group-hover:bg-info/10 group-hover:text-info',
                      )}
                    >
                      <StoreIcon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-sm font-semibold text-foreground">{store.name}</h3>
                        <Badge
                          variant="secondary"
                          className="border border-success/20 bg-success/10 px-2 py-0 text-[10px] font-semibold text-success"
                        >
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                          {store.status}
                        </Badge>
                        {isPrincipal && (
                          <Badge
                            variant="outline"
                            className="gap-1 border-warning/40 bg-warning/10 px-2 py-0 text-[10px] font-semibold text-warning-foreground"
                          >
                            <ShieldCheck className="h-3 w-3" />
                            Principal
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="font-mono">{store.cnpj}</span>
                        <span className="inline-flex items-center gap-1">
                          <User className="h-3 w-3" />{store.manager}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" />{store.city}
                        </span>
                      </div>
                    </div>
                    <div className={cn(
                      'h-2 w-2 shrink-0 rounded-full transition-smooth',
                      active ? 'bg-info shadow-glow' : 'bg-transparent',
                    )} />
                  </button>

                  {canManage ? (
                  <div className="absolute right-4 top-1/2 -translate-y-1/2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="rounded-lg p-1.5 text-muted-foreground opacity-0 transition-smooth hover:bg-muted hover:text-foreground group-hover/row:opacity-100 data-[state=open]:opacity-100 data-[state=open]:bg-muted"
                          aria-label="Ações da loja"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52 rounded-xl border-border bg-popover shadow-card">
                        <DropdownMenuItem asChild className="rounded-lg text-sm font-medium cursor-pointer">
                          <Link href="/dashboard/unidades">
                            <Pencil className="mr-2 h-4 w-4 text-info" />
                            Editar em Gestão da Rede
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled className="rounded-lg text-sm font-medium opacity-60">
                          <PauseCircle className="mr-2 h-4 w-4 text-muted-foreground" />
                          Pausar filial
                          <span className="ml-auto text-[10px] text-muted-foreground">Em breve</span>
                        </DropdownMenuItem>
                        {!isPrincipal && onDelete ? (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="rounded-lg text-sm font-medium text-destructive focus:text-destructive"
                              onClick={() => setDeleteTarget(store)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Excluir
                            </DropdownMenuItem>
                          </>
                        ) : null}
                        {isPrincipal && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem disabled className="rounded-lg text-xs text-muted-foreground">
                              <ShieldCheck className="mr-2 h-4 w-4" />
                              Loja principal protegida
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setDeleteConfirmText('');
          }
        }}
      >
        <AlertDialogContent className="border-border bg-card text-foreground shadow-card sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir unidade?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 pt-1">
                <p className="text-sm text-muted-foreground">
                  Essa ação poderá remover acessos e vínculos operacionais da unidade.
                </p>
                {deleteTarget && (
                  <div className="rounded-xl border border-border bg-panel/60 px-4 py-3 space-y-1">
                    <p className="font-semibold text-foreground">{deleteTarget.name}</p>
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span className="font-mono">{deleteTarget.cnpj}</span>
                      {deleteTarget.city !== '—' && <span>{deleteTarget.city}</span>}
                    </div>
                  </div>
                )}
                {deleteTarget && (
                  <div className="space-y-2 pt-1">
                    <Label htmlFor="mc-delete-confirm" className="text-xs text-muted-foreground">
                      Digite <span className="font-mono font-semibold text-foreground">{deleteTarget.id}</span> para confirmar
                    </Label>
                    <Input
                      id="mc-delete-confirm"
                      value={deleteConfirmText}
                      onChange={(e) => setDeleteConfirmText(e.target.value)}
                      placeholder={deleteTarget.id}
                      disabled={deleting}
                      className="font-mono text-sm"
                      autoComplete="off"
                    />
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl" disabled={deleting}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting || deleteConfirmText.trim() !== (deleteTarget?.id ?? '')}
              onClick={(e) => { e.preventDefault(); void confirmDelete(); }}
            >
              {deleting ? 'Excluindo…' : 'Excluir unidade'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
