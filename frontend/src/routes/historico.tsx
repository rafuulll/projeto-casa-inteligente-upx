import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Footprints } from "lucide-react";
import { api, type HistoricoPonto, type MovimentoEvento } from "@/lib/api";

export const Route = createFileRoute("/historico")({ component: Historico });

const periodos = ["1h", "6h", "24h", "7d"] as const;

function Historico() {
  const [periodo, setPeriodo] = useState<(typeof periodos)[number]>("24h");
  const [data, setData] = useState<HistoricoPonto[]>([]);
  const [eventos, setEventos] = useState<MovimentoEvento[]>([]);

  useEffect(() => {
    api.get(`/api/telemetria/historico`, { params: { periodo } })
      .then((r) => setData((r.data ?? []) as HistoricoPonto[]))
      .catch(() => {});
    api.get(`/api/movimento`)
      .then((r) => setEventos((r.data ?? []) as MovimentoEvento[]))
      .catch(() => {});
  }, [periodo]);

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-mono text-2xl font-semibold">Histórico</h1>
          <p className="text-sm text-muted-foreground">Telemetria de temperatura e umidade.</p>
        </div>
        <div className="flex gap-1 rounded-lg border border-border bg-card p-1">
          {periodos.map((p) => (
            <button key={p} onClick={() => setPeriodo(p)} className={`rounded-md px-3 py-1 text-xs font-mono uppercase ${periodo === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-warning" /> Temperatura (°C)</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-accent" /> Umidade (%)</span>
        </div>
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
              <CartesianGrid stroke="oklch(0.3 0.02 260 / 50%)" strokeDasharray="3 3" />
              <XAxis dataKey="timestamp" stroke="oklch(0.65 0.02 255)" tick={{ fontSize: 11 }} tickFormatter={(v) => new Date(v).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} />
              <YAxis stroke="oklch(0.65 0.02 255)" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "oklch(0.21 0.02 260)", border: "1px solid oklch(0.3 0.02 260)", borderRadius: 8, fontSize: 12 }} labelFormatter={(v) => new Date(v).toLocaleString()} />
              <Line type="monotone" dataKey="temperatura" stroke="oklch(0.82 0.17 80)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="umidade" stroke="oklch(0.7 0.18 230)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <Footprints className="h-4 w-4 text-primary" />
          <h2 className="font-mono text-sm font-semibold uppercase tracking-wider">Eventos de movimento</h2>
        </div>
        <div className="divide-y divide-border">
          {eventos.length === 0 && <div className="py-8 text-center text-sm text-muted-foreground">Sem eventos no período.</div>}
          {eventos.map((e) => (
            <div key={e.id} className="flex items-center justify-between py-2.5 text-sm">
              <div className="flex items-center gap-3">
                <span className="h-1.5 w-1.5 rounded-full bg-destructive pulse-dot" />
                <span>{e.local}</span>
              </div>
              <span className="font-mono text-xs text-muted-foreground">{new Date(e.timestamp).toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
