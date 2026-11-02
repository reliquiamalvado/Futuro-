import { Building2, Factory, Home, Users } from "lucide-react";
import type { ReactNode } from "react";
import type { AccountType } from "../lib/supabase";
import { cx } from "./ui";

export const PROFILE_OPTIONS: { id: AccountType; title: string; text: string; icon: ReactNode; next: string }[] = [
  { id: "casa", title: "Dono de casa", text: "Quero controlar o portão da minha casa.", icon: <Home className="size-6" />, next: "/configurar-casa" },
  { id: "morador", title: "Morador de condomínio", text: "Recebi um convite do condomínio ou da família.", icon: <Users className="size-6" />, next: "/convite" },
  { id: "sindico", title: "Síndico / Administradora", text: "Quero cadastrar e administrar um condomínio.", icon: <Building2 className="size-6" />, next: "/solicitar-cadastro" },
  { id: "empresa", title: "Empresa", text: "Quero controlar o acesso da minha empresa.", icon: <Factory className="size-6" />, next: "/solicitar-cadastro" },
];

export const PROFILE_LABEL: Record<AccountType, string> = {
  casa: "Dono de casa", morador: "Morador de condomínio", sindico: "Síndico / Administradora", empresa: "Empresa",
};

export const nextPathFor = (t: AccountType | null | undefined) =>
  PROFILE_OPTIONS.find((o) => o.id === t)?.next ?? "/";

export function ProfileChooser({ value, onChange, compact }: {
  value: AccountType | null; onChange: (t: AccountType) => void; compact?: boolean;
}) {
  return (
    <div className={cx("grid gap-3", !compact && "sm:grid-cols-2")} role="radiogroup" aria-label="Como você vai usar">
      {PROFILE_OPTIONS.map((o) => {
        const on = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.id)}
            className={cx(
              "flex items-start gap-3 rounded-2xl p-4 text-left ring-1 transition",
              on ? "bg-brand-500/10 ring-2 ring-brand-500"
                : "bg-white ring-slate-200 hover:ring-brand-400 dark:bg-ink-900 dark:ring-ink-700",
            )}
          >
            <span className={cx("grid size-11 shrink-0 place-items-center rounded-xl",
              on ? "bg-brand-500 text-white" : "bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400")}>
              {o.icon}
            </span>
            <span>
              <span className="block font-semibold">{o.title}</span>
              <span className="mt-0.5 block text-sm text-slate-500 dark:text-slate-400">{o.text}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
