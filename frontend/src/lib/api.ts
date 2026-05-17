import axios from "axios";
import { io, type Socket } from "socket.io-client";
import type { QueryClient } from "@tanstack/react-query";

export const API_BASE = "http://localhost:3001";

export const api = axios.create({
  baseURL: API_BASE,
  timeout: 8000,
});

let socket: Socket | null = null;
export function getSocket(): Socket {
  if (!socket) {
    socket = io(API_BASE, { transports: ["websocket", "polling"], autoConnect: true });
  }
  return socket;
}

// SSE global — subscriber pattern, funciona fora do ciclo React/SSR
type TeleListener = (data: Telemetria) => void;
const _teleListeners = new Set<TeleListener>();

export function subscribeTelemetria(fn: TeleListener): () => void {
  _teleListeners.add(fn);
  return () => _teleListeners.delete(fn);
}

if (typeof window !== "undefined") {
  const es = new EventSource(`${API_BASE}/api/events`);
  es.onmessage = (e) => {
    try {
      const data: Telemetria = JSON.parse(e.data);
      _teleListeners.forEach((fn) => fn(data));
    } catch {}
  };
  es.onerror = () => {};
}

export interface Device {
  id: string;
  nome: string;
  comodo: string;
  tipo: string;
  estado: boolean;
}

export interface Telemetria {
  temperatura: number;
  umidade: number;
  movimento: boolean;
  ia_status?: "online" | "offline" | "aprendendo";
  porta?: "aberta" | "fechada";
  alarme?: "armado" | "desarmado";
  timestamp?: string;
}

export interface HistoricoPonto {
  timestamp: string;
  temperatura: number;
  umidade: number;
}

export interface MovimentoEvento {
  id: string;
  timestamp: string;
  local: string;
}

export interface AcaoHistorico {
  id: string;
  timestamp: string;
  descricao: string;
  tipo: string;
}

export interface Regra {
  id: string;
  nome: string;
  descricao: string;
  ativa: boolean;
  trigger?: string;
}

export interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}
