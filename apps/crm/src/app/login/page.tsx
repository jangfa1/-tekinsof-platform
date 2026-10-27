import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Entrar" };

type SearchParams = Promise<{ error?: string; next?: string }>;

// Only same-site paths are accepted as the post-login destination.
function safeNext(next: string | undefined): string {
  return next?.startsWith("/") && !next.startsWith("//") ? next : "/leads";
}

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const { error, next } = await searchParams;
  const env = getEnv();
  const microsoftConfigured = Boolean(
    env.ENTRA_CLIENT_ID && env.ENTRA_CLIENT_SECRET && env.ENTRA_TENANT_ID,
  );
  const callbackURL = safeNext(next);

  async function signInWithMicrosoft() {
    "use server";
    const result = await auth.api.signInSocial({
      body: { provider: "microsoft", callbackURL },
      headers: await headers(),
    });
    if (!result.url) redirect("/login?error=microsoft");
    redirect(result.url);
  }

  async function signInWithPassword(formData: FormData) {
    "use server";
    let signedIn = false;
    try {
      await auth.api.signInEmail({
        body: {
          email: String(formData.get("email") ?? ""),
          password: String(formData.get("password") ?? ""),
        },
        headers: await headers(),
      });
      signedIn = true;
    } catch {
      signedIn = false;
    }
    redirect(signedIn ? callbackURL : "/login?error=credenciales");
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm rounded-[var(--radius-card)] border border-border bg-background p-8">
        <h1 className="font-display text-2xl font-bold tracking-tight">Tekinsof CRM</h1>
        <p className="mt-2 text-sm text-fg-muted">Ingresa con tu cuenta de Microsoft 365.</p>

        {error ? (
          <p role="alert" className="mt-4 text-sm text-destructive">
            Tu cuenta no tiene acceso al CRM. Pide una invitación a Gerencia.
          </p>
        ) : null}

        <form action={signInWithMicrosoft} className="mt-6">
          <button
            type="submit"
            disabled={!microsoftConfigured && !env.AUTH_TEST_MODE}
            className="min-h-9 w-full rounded-[var(--radius-control)] bg-primary px-4 py-2 font-medium text-primary-fg disabled:opacity-60"
          >
            Entrar con Microsoft
          </button>
          {!microsoftConfigured && !env.AUTH_TEST_MODE ? (
            <p className="mt-2 text-sm text-fg-muted">Microsoft no configurado</p>
          ) : null}
        </form>

        {env.AUTH_TEST_MODE ? (
          <form action={signInWithPassword} className="mt-6 space-y-4 border-t border-border pt-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium">
                Correo
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                className="mt-1 min-h-9 w-full rounded-[var(--radius-control)] border border-border bg-background px-3"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium">
                Contraseña
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="mt-1 min-h-9 w-full rounded-[var(--radius-control)] border border-border bg-background px-3"
              />
            </div>
            <button
              type="submit"
              className="min-h-9 w-full rounded-[var(--radius-control)] border border-border px-4 py-2 font-medium"
            >
              Entrar
            </button>
          </form>
        ) : null}
      </div>
    </main>
  );
}
