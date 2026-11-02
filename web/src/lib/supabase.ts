import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

if (!url || !key) {
  throw new Error("Configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no arquivo .env");
}

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export const DEVICE_API_URL = `${url}/functions/v1/device-api`;

// ---------- Tipos das tabelas ----------
export type OrgKind = "residencial" | "condominio" | "empresa";
export type GroupLabel = "Bloco" | "Rua" | "Quadra" | "Torre";
export type AccountType = "casa" | "morador" | "sindico" | "empresa";
export type MemberRole = "titular" | "morador";
export type MemberStatus = "pendente" | "ativo" | "bloqueado";
export type GateState = "aberto" | "fechado" | "movendo" | "desconhecido";
export type GateMode = "pulso" | "abrir_fechar";
export type GateAction = "abrir" | "fechar" | "pulso";
export type CommandStatus = "pendente" | "enviado" | "sucesso" | "falha" | "expirado";

export interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  is_super_admin: boolean;
  account_type: AccountType | null;
  created_at: string;
}

export interface Organization {
  id: string;
  name: string;
  kind: OrgKind;
  document: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  timezone: string;
  group_label: GroupLabel;
  active: boolean;
  created_at: string;
}

export interface Residence {
  id: string;
  org_id: string;
  name: string;
  block: string | null;
  address: string | null;
  complement: string | null;
  created_at: string;
}

export interface ResidenceMember {
  id: string;
  residence_id: string;
  user_id: string;
  role: MemberRole;
  status: MemberStatus;
  allowed_gates: string[] | null;
  created_at: string;
  approved_at: string | null;
}

export interface DeviceDriver {
  id: string;
  name: string;
  manufacturer: string;
  transport: string;
  description: string | null;
  capabilities: { channels?: number; pulse?: boolean; open_close?: boolean; state_sensor?: boolean };
}

export interface Device {
  id: string;
  org_id: string;
  name: string;
  driver_id: string;
  manufacturer: string | null;
  model: string | null;
  serial: string | null;
  last_seen_at: string | null;
  firmware: string | null;
  ip: string | null;
  rssi: number | null;
  active: boolean;
  created_at: string;
}

export interface Gate {
  id: string;
  org_id: string;
  device_id: string | null;
  name: string;
  channel: number;
  mode: GateMode;
  pulse_ms: number;
  state: GateState;
  state_updated_at: string | null;
  active: boolean;
}

export interface MyGate {
  gate_id: string;
  gate_name: string;
  mode: GateMode;
  state: GateState;
  state_updated_at: string | null;
  device_id: string | null;
  device_name: string | null;
  online: boolean;
  last_seen_at: string | null;
  org_id: string;
  org_name: string;
  residence_id: string | null;
  residence_name: string | null;
  can_operate: boolean;
}

export interface Invite {
  id: string;
  residence_id: string;
  code: string;
  role: MemberRole;
  requires_approval: boolean;
  max_uses: number;
  uses: number;
  expires_at: string;
  revoked: boolean;
  created_at: string;
}

export interface TempKey {
  id: string;
  residence_id: string;
  label: string;
  token: string;
  gate_ids: string[];
  valid_from: string;
  valid_until: string;
  daily_start: string | null;
  daily_end: string | null;
  weekdays: number[] | null;
  max_uses: number | null;
  uses: number;
  revoked_at: string | null;
  created_at: string;
}

export interface Command {
  id: string;
  org_id: string;
  gate_id: string;
  residence_id: string | null;
  action: GateAction;
  status: CommandStatus;
  source: "app" | "chave_temporaria";
  requested_by: string | null;
  temp_key_id: string | null;
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface AuditLog {
  id: number;
  org_id: string | null;
  actor_id: string | null;
  action: string;
  entity: string | null;
  entity_id: string | null;
  severity: "info" | "alerta" | "critico";
  details: Record<string, unknown>;
  created_at: string;
}

export const ONLINE_MS = 45_000;
export const isOnline = (lastSeen: string | null) =>
  !!lastSeen && Date.now() - new Date(lastSeen).getTime() < ONLINE_MS;
