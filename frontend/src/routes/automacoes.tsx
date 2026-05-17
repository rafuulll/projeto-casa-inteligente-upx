import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Brain, Cpu, GitBranch, Pencil, Plus, RotateCcw, Sparkles, Trash2, Zap } from "lucide-react";
import { api, type Regra } from "@/lib/api";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/automacoes")({ component: Automacoes });

interface IAStats { precisao?: number; eventos_aprendidos?: number; modelos?: number; uptime?: string; status?: string; }

const EMPTY: Omit<Regra, "id"> = { nome: "", descricao: "", trigger: "", ativa: true };

function Automacoes() {
  const [stats, setStats]   = useState<IAStats>({});
  const [regras, setRegras] = useState<Regra[]>([]);
  const [modal, setModal]   = useState<{ open: boolean; editing: Regra | null }>({ open: false, editing: null });
  const [form, setForm]     = useState<Omit<Regra, "id">>(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = () => {
    api.get("/api/ai/stats").then((r) => setStats(r.data ?? {})).catch(() => {});
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
        <p className="text-sm text-muted-foreground">IA local rodando no ESP32.</p>
      </div>

      {/* IA Status card */}
      <div className="relative overflow-hidden rounded-xl border border-border bg-card p-6">
        <div className="absolute inset-0 grid-bg opacity-30" />
        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary glow-primary">
              <Brain className="h-7 w-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-mono text-lg font-semibold">Edge AI · ESP32</h2>
                <span className="flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-success">
                  <span className="h-1.5 w-1.5 rounded-full bg-current pulse-dot" /> {stats.status ?? "aprendendo"}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">Modelo embarcado aprendendo padrões em tempo real.</p>
              <Button variant="ghost" size="sm" className="mt-2 h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => api.post("/api/ia/reset").catch(() => {})}>
                <RotateCcw className="h-3 w-3" /> Reiniciar aprendizado
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-6">
            <Stat icon={Sparkles} label="Precisão"  value={stats.precisao != null ? `${(stats.precisao * 100).toFixed(0)}%` : "—"} />
            <Stat icon={Zap}      label="Eventos"   value={stats.eventos_aprendidos ?? "—"} />
            <Stat icon={Cpu}      label="Modelos"   value={stats.modelos ?? "—"} />
          </div>
        </div>
      </div>

      {/* Regras */}
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

      {/* Modal editar / criar */}
      <Dialog open={modal.open} onOpenChange={(o) => setModal({ open: o, editing: null })}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{modal.editing ? "Editar regra" : "Nova regra"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input placeholder="Ex: Ligar luz às 18h"
                value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Input placeholder="Ex: Liga a luz da sala automaticamente"
                value={form.descricao} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Condição (trigger)</Label>
              <Input placeholder="Ex: hora = 18:00 ou temp > 30°C"
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

function Stat({ icon: Icon, label, value }: { icon: typeof Brain; label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="mt-1 font-mono text-2xl font-semibold text-primary">{value}</div>
    </div>
  );
}
