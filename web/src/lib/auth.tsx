import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, type MemberRole, type MemberStatus, type Profile } from "./supabase";

export interface Membership {
  id: string;
  residence_id: string;
  role: MemberRole;
  status: MemberStatus;
  residence_name: string;
  org_id: string;
  org_name: string;
}

export interface AdminOrg {
  id: string;
  name: string;
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

  const loadUserData = useCallback(async (s: Session | null) => {
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
        .select("id, residence_id, role, status, residences(name, org_id, organizations(name))")
        .eq("user_id", uid),
      supabase.from("org_admins").select("org_id, organizations(id, name)").eq("user_id", uid),
    ]);
    setProfile((p.data as Profile) ?? null);

    type MRow = {
      id: string; residence_id: string; role: MemberRole; status: MemberStatus;
      residences: { name: string; org_id: string; organizations: { name: string } | null } | null;
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
      })),
    );

    type ARow = { org_id: string; organizations: { id: string; name: string } | null };
    let orgs = ((a.data ?? []) as unknown as ARow[])
      .filter((r) => r.organizations)
      .map((r) => ({ id: r.organizations!.id, name: r.organizations!.name }));

    // Super admin administra todas as organizações.
    if ((p.data as Profile | null)?.is_super_admin) {
      const all = await supabase.from("organizations").select("id, name").order("name");
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
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
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
    const isSuper = !!profile?.is_super_admin;
    const isAdmin = isSuper || adminOrgs.length > 0;
    const isTitular = memberships.some((m) => m.role === "titular" && m.status === "ativo");
    const roleLabel = isSuper ? "Super Admin" : isAdmin ? "Admin" : isTitular ? "Titular"
      : memberships.some((m) => m.status === "ativo") ? "Morador" : "Sem acesso";
    return {
      session, profile, memberships, adminOrgs, loading,
      isSuper, isAdmin, isTitular, roleLabel, refresh, signOut,
    };
  }, [session, profile, memberships, adminOrgs, loading, refresh, signOut]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth fora do AuthProvider");
  return v;
}
