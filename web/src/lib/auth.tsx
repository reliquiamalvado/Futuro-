import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, type GroupLabel, type MemberRole, type MemberStatus, type OrgKind, type Profile } from "./supabase";

export interface Membership {
  id: string;
  residence_id: string;
  role: MemberRole;
  status: MemberStatus;
  residence_name: string;
  org_id: string;
  org_name: string;
  org_kind: OrgKind;
}

export interface AdminOrg {
  id: string;
  name: string;
  kind: OrgKind;
  group_label: GroupLabel;
}

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  memberships: Membership[];
  adminOrgs: AdminOrg[];
  loading: boolean;
  isSuper: boolean;
  isAdmin: boolean;     // admin de alguma organização (ou super admin)
  isTitular: boolean;   // titular ativo de alguma residência
  roleLabel: string;
  /** Só tem casa(s) comuns: o app mostra o menu simplificado. */
  homeOnly: boolean;
  /** Residência principal do usuário numa casa comum. */
  homeResidenceId: string | null;
  /** Conta com 2FA e sessão ainda sem o código: precisa verificar. */
  needsMfa: boolean;
  /** É super admin, mas os poderes só valem com 2FA na sessão. */
  superNeedsMfa: boolean;
  refresh: () => Promise<void>;
  signOut: (scope?: "local" | "others" | "global") => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [adminOrgs, setAdminOrgs] = useState<AdminOrg[]>([]);
  const [loading, setLoading] = useState(true);
  const [aal, setAal] = useState<{ current: string | null; next: string | null }>({ current: null, next: null });

  const loadUserData = useCallback(async (s: Session | null) => {
    if (s) {
      try {
        const { data: lvl } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        setAal({ current: lvl?.currentLevel ?? null, next: lvl?.nextLevel ?? null });
      } catch {
        setAal({ current: "aal1", next: null });
      }
    } else {
      setAal({ current: null, next: null });
    }
    if (!s) {
      setProfile(null);
      setMemberships([]);
      setAdminOrgs([]);
      return;
    }
    const uid = s.user.id;
    const [p, m, a] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
      supabase
        .from("residence_members")
        .select("id, residence_id, role, status, residences(name, org_id, organizations(name, kind))")
        .eq("user_id", uid),
      supabase.from("org_admins").select("org_id, organizations(id, name, kind, group_label)").eq("user_id", uid),
    ]);
    let prof = (p.data as Profile) ?? null;
    // Cadastro pelo Google não leva o perfil escolhido: aplica o que ficou guardado.
    if (prof && !prof.account_type) {
      let saved: string | null = null;
      try { saved = localStorage.getItem("dc.perfil"); } catch { /* sem storage */ }
      if (saved && ["casa", "morador", "sindico", "empresa"].includes(saved)) {
        const upd = await supabase.from("profiles").update({ account_type: saved }).eq("id", uid).select().maybeSingle();
        if (upd.data) prof = upd.data as Profile;
      }
    }
    if (prof?.account_type) { try { localStorage.removeItem("dc.perfil"); } catch { /* sem storage */ } }
    setProfile(prof);

    type MRow = {
      id: string; residence_id: string; role: MemberRole; status: MemberStatus;
      residences: { name: string; org_id: string; organizations: { name: string; kind: OrgKind } | null } | null;
    };
    setMemberships(
      ((m.data ?? []) as unknown as MRow[]).map((r) => ({
        id: r.id,
        residence_id: r.residence_id,
        role: r.role,
        status: r.status,
        residence_name: r.residences?.name ?? "—",
        org_id: r.residences?.org_id ?? "",
        org_name: r.residences?.organizations?.name ?? "—",
        org_kind: r.residences?.organizations?.kind ?? "condominio",
      })),
    );

    type ARow = { org_id: string; organizations: AdminOrg | null };
    let orgs = ((a.data ?? []) as unknown as ARow[])
      .filter((r) => r.organizations)
      .map((r) => r.organizations!);

    // Super admin administra todas as organizações.
    if (prof?.is_super_admin) {
      const all = await supabase.from("organizations").select("id, name, kind, group_label").order("name");
      orgs = (all.data ?? []) as AdminOrg[];
    }
    setAdminOrgs(orgs.sort((x, y) => x.name.localeCompare(y.name)));
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await loadUserData(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED" || event === "MFA_CHALLENGE_VERIFIED") {
        // Evita chamar o Supabase dentro do callback (recomendação da biblioteca).
        setTimeout(() => loadUserData(s), 0);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [loadUserData]);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    await loadUserData(data.session);
  }, [loadUserData]);

  const signOut = useCallback(async (scope: "local" | "others" | "global" = "local") => {
    await supabase.auth.signOut({ scope });
  }, []);

  const value = useMemo<AuthState>(() => {
    const strong = aal.current === "aal2";
    const isSuper = !!profile?.is_super_admin && strong;
    const superNeedsMfa = !!profile?.is_super_admin && !strong;
    const needsMfa = aal.next === "aal2" && aal.current !== "aal2";
    const isAdmin = isSuper || adminOrgs.length > 0;
    const isTitular = memberships.some((m) => m.role === "titular" && m.status === "ativo");
    const roleLabel = isSuper ? "Super Admin" : isAdmin ? "Admin" : isTitular ? "Titular"
      : memberships.some((m) => m.status === "ativo") ? "Morador" : "Sem acesso";
    const activeHomes = memberships.filter((m) => m.status === "ativo" && m.org_kind === "residencial");
    const homeOnly = !isSuper
      && (adminOrgs.length > 0 || memberships.length > 0)
      && adminOrgs.every((o) => o.kind === "residencial")
      && memberships.every((m) => m.org_kind === "residencial");
    const homeResidenceId = homeOnly && activeHomes.length === 1 ? activeHomes[0].residence_id : null;
    return {
      session, profile, memberships, adminOrgs, loading,
      isSuper, isAdmin, isTitular, roleLabel: homeOnly ? (isTitular ? "Titular da casa" : roleLabel) : roleLabel,
      homeOnly, homeResidenceId, needsMfa, superNeedsMfa, refresh, signOut,
    };
  }, [session, profile, memberships, adminOrgs, loading, aal, refresh, signOut]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth fora do AuthProvider");
  return v;
}
