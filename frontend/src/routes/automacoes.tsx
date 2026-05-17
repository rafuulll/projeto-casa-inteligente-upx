import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { GitBranch, Pencil, Plus, Trash2 } from "lucide-react";
import { api, type Regra } from "@/lib/api";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/automacoes")({ component: Automacoes });

const EMPTY: Omit<Regra, "id"> = { nome: "", descricao: "", trigger: "", ativa: true };

function Automacoes() {
  const [regras, setRegras] = useState<Regra[]>([]);
  const [modal, setModal]   = useState<{ open: boolean; editing: Regra | null }>({ open: false, editing: null });
  const [form, setForm]     = useState<Omit<Regra, "id">>(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = () => {
    api.get<Regra[]>("/api/ai/regras").then((r) => setRegras(r.data ?? [])).catch(() => {});
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setForm(EMPTY);
    setModal({ open: true, editing: null });
  };

  const openEdit = (r: Regra) => {
    setForm({ nome: r.nome, descricao: r.descricao, trigger: r.trigger, ativa: r.ativa });
    setModal({ open: true, editing: r });
  };

  const save = async () => {
    if (!form.nome || !form.descricao || !form.trigger) return;
    setSaving(true);
    try {
      if (modal.editing) {
        await api.put(`/api/ai/regras/${modal.editing.id}`, form);
      } else {
        await api.post("/api/ai/regras", form);
      }
      load();
      setModal({ open: false, editing: null });
    } catch {}
    setSaving(false);
  };

  const toggle = async (id: string) => {
    await api.post(`/api/ai/regras/${id}/toggle`).catch(() => {});
    setRegras((rs) => rs.map((r) => r.id === id ? { ...r, ativa: !r.ativa } : r));
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir esta regra?")) return;
    await api.delete(`/api/ai/regras/${id}`).catch(() => {});
    setRegras((rs) => rs.filter((r) => r.id !== id));
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-mono text-2xl font-semibold">Automações</h1>
        <p className="text-sm text-muted-foreground">Regras automáticas baseadas em temperatura, umidade e movimento.</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-primary" />
            <h2 className="font-mono text-sm font-semibold uppercase tracking-wider">Regras automáticas</h2>
          </div>
          <Button size="sm" className="gap-1.5" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Nova regra
          </Button>
        </div>

        <div className="mb-4 rounded-lg border border-border bg-secondary/30 px-4 py-3 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">Como criar uma regra:</span> preencha a condição no campo <span className="font-mono">trigger</span> (ex: <span className="font-mono">temp &gt; 30</span>, <span className="font-mono">umidade &gt; 80</span>, <span className="font-mono">movimento</span>) e descreva o dispositivo e ação na descrição (ex: <span className="font-mono">Liga o ar condicionado</span>).
        </div>

        <div className="divide-y divide-border">
          {regras.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">Nenhuma regra cadastrada.</div>
          )}
          {regras.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{r.nome}</div>
                <div className="text-xs text-muted-foreground">{r.descricao}</div>
                {r.trigger && (
                  <div className="mt-1 inline-block rounded bg-secondary/60 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {r.trigger}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Switch checked={r.ativa} onCheckedChange={() => toggle(r.id)} />
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={() => openEdit(r)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => remove(r.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Dialog open={modal.open} onOpenChange={(o) => setModal({ open: o, editing: null })}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{modal.editing ? "Editar regra" : "Nova regra"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input placeholder="Ex: Ligar ar quando calor"
                value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Descrição / Ação</Label>
              <Input placeholder="Ex: Liga o ar condicionado"
                value={form.descricao} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Condição (trigger)</Label>
              <Input placeholder="Ex: temp > 30  |  umidade > 80  |  movimento"
                value={form.trigger} onChange={(e) => setForm((f) => ({ ...f, trigger: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModal({ open: false, editing: null })}>Cancelar</Button>
            <Button onClick={save} disabled={saving || !form.nome || !form.descricao || !form.trigger}>
              {saving ? "Salvando..." : modal.editing ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
