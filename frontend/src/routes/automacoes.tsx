import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { GitBranch, Pencil, Plus, Trash2 } from "lucide-react";
import { api, type Device, type Regra } from "@/lib/api";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/automacoes")({ component: Automacoes });

type Sensor = "temp" | "umidade" | "movimento" | "porta";
type Operador = ">" | ">=" | "<" | "<=";
type Acao = "ON" | "OFF" | "ABRIR" | "FECHAR" | "ARMAR" | "DESARMAR";

interface FormState {
  nome: string;
  sensor: Sensor;
  operador: Operador;
  valor: string;
  delay: string;
  deviceId: string;
  acao: Acao;
  ativa: boolean;
}

const EMPTY_FORM: FormState = {
  nome: "",
  sensor: "temp",
  operador: ">",
  valor: "30",
  delay: "",
  deviceId: "",
  acao: "ON",
  ativa: true,
};

function buildTrigger(f: FormState): string {
  if (f.sensor === "movimento") return f.delay ? `movimento ${f.delay}s` : "movimento";
  if (f.sensor === "porta")     return f.delay ? `porta aberta ${f.delay}s` : "porta aberta";
  const base = `${f.sensor} ${f.operador} ${f.valor}`;
  return f.delay ? `${base} ${f.delay}s` : base;
}

function buildDescricao(f: FormState, devices: Device[]): string {
  return `device:${f.deviceId}:${f.acao}`;
}

function parseTriggerDisplay(trigger: string): string {
  return trigger;
}

function parseDescricaoDisplay(descricao: string, devices: Device[]): string {
  const m = descricao.match(/^device:([^:]+):(ON|OFF)$/);
  if (!m) return descricao;
  const dev = devices.find((d) => d.id === m[1]);
  const nome = dev?.nome ?? m[1];
  return `${m[2] === "ON" ? "Ligar" : "Desligar"} ${nome}`;
}

function formFromRegra(r: Regra, devices: Device[]): FormState {
  const t = r.trigger.toLowerCase().trim();
  const delayMatch = t.match(/(\d+)\s*s\s*$/);
  const delay = delayMatch ? delayMatch[1] : "";

  let sensor: Sensor = "temp";
  let operador: Operador = ">";
  let valor = "30";

  if (t.includes("movimento")) { sensor = "movimento"; }
  else if (t.includes("porta")) { sensor = "porta"; }
  else if (t.includes("umidade")) {
    sensor = "umidade";
    const m = t.match(/umidade?\s*([><]=?)\s*(\d+)/);
    if (m) { operador = m[1] as Operador; valor = m[2]; }
  } else {
    const m = t.match(/temp(?:eratura)?\s*([><]=?)\s*(\d+)/);
    if (m) { operador = m[1] as Operador; valor = m[2]; }
  }

  const dm = r.descricao.match(/^device:([^:]+):(ON|OFF)$/);
  const deviceId = dm ? dm[1] : (devices[0]?.id ?? "");
  const acao: Acao = dm ? (dm[2] as Acao) : "ON";

  return { nome: r.nome, sensor, operador, valor, delay, deviceId, acao, ativa: r.ativa };
}

const SENSOR_LABELS: Record<Sensor, string> = {
  temp: "Temperatura (°C)",
  umidade: "Umidade (%)",
  movimento: "Movimento (PIR)",
  porta: "Porta aberta",
};

const OP_LABELS: Record<Operador, string> = {
  ">": "maior que (>)",
  ">=": "maior ou igual (≥)",
  "<": "menor que (<)",
  "<=": "menor ou igual (≤)",
};

function Automacoes() {
  const [regras, setRegras]   = useState<Regra[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [modal, setModal]     = useState<{ open: boolean; editing: Regra | null }>({ open: false, editing: null });
  const [form, setForm]       = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving]   = useState(false);

  const load = () => {
    api.get<Regra[]>("/api/ai/regras").then((r) => setRegras(r.data ?? [])).catch(() => {});
  };

  useEffect(() => {
    load();
    api.get<Device[]>("/api/devices").then((r) => setDevices(r.data ?? [])).catch(() => {});
  }, []);

  const set = (key: keyof FormState, val: string | boolean) =>
    setForm((f) => ({ ...f, [key]: val }));

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, deviceId: devices[0]?.id ?? "" });
    setModal({ open: true, editing: null });
  };

  const openEdit = (r: Regra) => {
    setForm(formFromRegra(r, devices));
    setModal({ open: true, editing: r });
  };

  const save = async () => {
    if (!form.nome || !form.deviceId) return;
    setSaving(true);
    const payload = {
      nome:     form.nome,
      descricao: buildDescricao(form, devices),
      trigger:  buildTrigger(form),
      ativa:    form.ativa,
    };
    try {
      if (modal.editing) {
        await api.put(`/api/ai/regras/${modal.editing.id}`, payload);
      } else {
        await api.post("/api/ai/regras", payload);
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

  const showValor = form.sensor === "temp" || form.sensor === "umidade";

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

        <div className="divide-y divide-border">
          {regras.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">Nenhuma regra cadastrada.</div>
          )}
          {regras.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{r.nome}</div>
                <div className="text-xs text-muted-foreground">{parseDescricaoDisplay(r.descricao, devices)}</div>
                {r.trigger && (
                  <div className="mt-1 inline-block rounded bg-secondary/60 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {parseTriggerDisplay(r.trigger)}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Switch checked={r.ativa} onCheckedChange={() => toggle(r.id)} />
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => openEdit(r)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => remove(r.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Dialog open={modal.open} onOpenChange={(o) => { if (!o) setModal({ open: false, editing: null }); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{modal.editing ? "Editar regra" : "Nova regra"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* Nome */}
            <div className="space-y-1.5">
              <Label>Nome da regra</Label>
              <Input placeholder="Ex: Ligar ar quando calor" value={form.nome} onChange={(e) => set("nome", e.target.value)} />
            </div>

            {/* SE */}
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
              <p className="text-[11px] font-bold uppercase tracking-widest text-primary">SE</p>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Sensor</Label>
                <Select value={form.sensor} onValueChange={(v) => set("sensor", v)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.entries(SENSOR_LABELS) as [Sensor, string][]).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {showValor && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Operador</Label>
                    <Select value={form.operador} onValueChange={(v) => set("operador", v)}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.entries(OP_LABELS) as [Operador, string][]).map(([v, l]) => (
                          <SelectItem key={v} value={v}>{l}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Valor</Label>
                    <Input className="h-9" type="number" value={form.valor} onChange={(e) => set("valor", e.target.value)} />
                  </div>
                </div>
              )}

              <div className="flex items-end gap-2">
                <div className="w-28 space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Delay (s)</Label>
                  <Input className="h-9" type="number" placeholder="0" value={form.delay} onChange={(e) => set("delay", e.target.value)} />
                </div>
                <p className="mb-2 text-xs text-muted-foreground">segundos antes de agir (opcional)</p>
              </div>
            </div>

            {/* ENTÃO */}
            <div className="rounded-lg border border-border bg-secondary/20 p-4 space-y-3">
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">ENTÃO</p>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Alvo</Label>
                  <Select value={form.deviceId} onValueChange={(v) => {
                    const defaultAcao: Record<string, Acao> = { porta: "ABRIR", alarme: "ARMAR" };
                    setForm((f) => ({ ...f, deviceId: v, acao: defaultAcao[v] ?? "ON" }));
                  }}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="porta">Porta</SelectItem>
                      <SelectItem value="alarme">Alarme</SelectItem>
                      {devices.map((d) => (
                        <SelectItem key={d.id} value={d.id}>{d.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Ação</Label>
                  <Select value={form.acao} onValueChange={(v) => set("acao", v)}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {form.deviceId === "porta" ? (
                        <>
                          <SelectItem value="ABRIR">Abrir</SelectItem>
                          <SelectItem value="FECHAR">Fechar</SelectItem>
                        </>
                      ) : form.deviceId === "alarme" ? (
                        <>
                          <SelectItem value="ARMAR">Armar</SelectItem>
                          <SelectItem value="DESARMAR">Desarmar</SelectItem>
                        </>
                      ) : (
                        <>
                          <SelectItem value="ON">Ligar</SelectItem>
                          <SelectItem value="OFF">Desligar</SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModal({ open: false, editing: null })}>Cancelar</Button>
            <Button onClick={save} disabled={saving || !form.nome || !form.deviceId}>
              {saving ? "Salvando..." : modal.editing ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
