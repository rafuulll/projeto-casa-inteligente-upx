import axios from "axios";
import { io, type Socket } from "socket.io-client";

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
