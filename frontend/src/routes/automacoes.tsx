import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Brain, Cpu, GitBranch, RotateCcw, Sparkles, Zap } from "lucide-react";
import { api, type Regra } from "@/lib/api";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/automacoes")({ component: Automacoes });

interface IAStats { precisao?: number; eventos_aprendidos?: number; modelos?: number; uptime?: string; status?: string; }

function Automacoes() {
  const [stats, setStats] = useState<IAStats>({});
  const [regras, setRegras] = useState<Regra[]>([]);

  useEffect(() => {
    api.get("/api/ai/stats").then((r) => setStats(r.data ?? {})).catch(() => {});
    api.get<Regra[]>("/api/ai/regras").then((r) => setRegras(r.data ?? [])).catch(() => {});
  }, []);

  const toggleRegra = (id: string) => {
    setRegras((rs) => rs.map((r) => r.id === id ? { ...r, ativa: !r.ativa } : r));
    api.post(`/api/ai/regras/${id}/toggle`).catch(() => {});
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-mono text-2xl font-semibold">Automações</h1>
        <p className="text-sm text-muted-foreground">IA local rodando no ESP32.</p>
      </div>

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
            <Stat icon={Sparkles} label="Precisão" value={stats.precisao != null ? `${(stats.precisao * 100).toFixed(0)}%` : "—"} />
            <Stat icon={Zap} label="Eventos" value={stats.eventos_aprendidos ?? "—"} />
            <Stat icon={Cpu} label="Modelos" value={stats.modelos ?? "—"} />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-primary" />
          <h2 className="font-mono text-sm font-semibold uppercase tracking-wider">Regras automáticas</h2>
        </div>
        <div className="divide-y divide-border">
          {regras.length === 0 && <div className="py-8 text-center text-sm text-muted-foreground">Nenhuma regra cadastrada.</div>}
          {regras.map((r) => (
            <div key={r.id} className="flex items-center justify-between py-3">
              <div>
                <div className="text-sm font-medium">{r.nome}</div>
                <div className="text-xs text-muted-foreground">{r.descricao}</div>
                {r.trigger && <div className="mt-1 inline-block rounded bg-secondary/60 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">{r.trigger}</div>}
              </div>
              <Switch checked={r.ativa} onCheckedChange={() => toggleRegra(r.id)} />
            </div>
          ))}
        </div>
      </div>
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
