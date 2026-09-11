"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, signupAction, type AuthState } from "@/app/(auth)/actions";
import { useI18n } from "@/components/I18nProvider";

export function AuthForm({ mode, next }: { mode: "login" | "signup"; next?: string }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState<AuthState, FormData>(
    mode === "login" ? loginAction : signupAction,
    undefined,
  );
  return (
    <div className="mx-auto max-w-sm py-8">
      <div className="card p-6">
        <h1 className="text-xl font-bold">{mode === "login" ? t("auth.title") : t("auth.signupTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("auth.subtitle")}</p>
        <form action={action} className="mt-5 space-y-3">
          <input type="hidden" name="next" value={next ?? "/"} />
          {mode === "signup" && (
            <div>
              <label className="label" htmlFor="fullName">{t("auth.fullName")}</label>
              <input id="fullName" name="fullName" className="input" autoComplete="name" />
            </div>
          )}
          <div>
            <label className="label" htmlFor="email">{t("auth.email")}</label>
            <input id="email" name="email" type="email" required className="input" autoComplete="email" />
          </div>
          <div>
            <label className="label" htmlFor="password">{t("auth.password")}</label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={mode === "signup" ? 8 : 1}
              className="input"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </div>
          {state?.error && <p className="text-sm font-medium text-destructive">{t(state.error)}</p>}
          <button className="btn btn-primary w-full" disabled={pending}>
            {pending ? t("common.loading") : mode === "login" ? t("auth.signIn") : t("auth.signUp")}
          </button>
        </form>
        <p className="mt-4 text-center text-sm">
          <Link
            href={mode === "login" ? `/signup?next=${encodeURIComponent(next ?? "/")}` : `/login?next=${encodeURIComponent(next ?? "/")}`}
            className="text-primary hover:underline"
          >
            {mode === "login" ? t("auth.noAccount") : t("auth.haveAccount")}
          </Link>
        </p>
      </div>
    </div>
  );
}
