import type { Permission } from "@tekinsof/core/auth/permissions";
import { can } from "@tekinsof/core/auth/permissions";
import {
  BookOpen,
  Building2,
  FileText,
  KanbanSquare,
  LayoutTemplate,
  type LucideIcon,
  Settings,
  UserRound,
  Users,
} from "lucide-react";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { type ReactNode, Suspense } from "react";
import { requireActor, type SessionActor } from "@/lib/actor";
import { auth } from "@/lib/auth";

type NavItem = { label: string; href: string; permission: Permission; icon: LucideIcon };

const navItems: NavItem[] = [
  { label: "Leads", href: "/leads", permission: "leads.read", icon: Users },
  {
    label: "Oportunidades",
    href: "/oportunidades",
    permission: "opportunities.read",
    icon: KanbanSquare,
  },
  { label: "Cotizaciones", href: "/cotizaciones", permission: "quotes.read", icon: FileText },
  { label: "Empresas", href: "/empresas", permission: "accounts.read", icon: Building2 },
  { label: "Contactos", href: "/contactos", permission: "accounts.read", icon: UserRound },
  { label: "Catálogo", href: "/catalogo", permission: "catalog.read", icon: BookOpen },
  { label: "Landings", href: "/landings", permission: "landings.write", icon: LayoutTemplate },
  {
    label: "Usuarios",
    href: "/configuracion/usuarios",
    permission: "users.manage",
    icon: Settings,
  },
];

const roleLabels: Record<SessionActor["role"], string> = {
  gerencia: "Gerencia",
  ventas: "Ventas",
  marketing: "Marketing",
  administracion: "Administración",
};

const themes = [
  { value: "light", label: "Claro" },
  { value: "dark", label: "Oscuro" },
  { value: "system", label: "Sistema" },
] as const;

async function setTheme(theme: (typeof themes)[number]["value"]) {
  "use server";
  const store = await cookies();
  if (theme === "system") store.delete("theme");
  else store.set("theme", theme, { maxAge: 60 * 60 * 24 * 365, sameSite: "lax", path: "/" });
  revalidatePath("/", "layout");
}

async function signOut() {
  "use server";
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}

function NavLinks({ actor }: { actor: SessionActor }) {
  return (
    <ul className="space-y-1">
      {navItems
        .filter((item) => can(actor, item.permission))
        .map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="flex min-h-9 items-center gap-3 rounded-[var(--radius-control)] px-3 py-2 text-sm font-medium hover:bg-surface-accent"
            >
              <item.icon aria-hidden="true" className="size-4" />
              {item.label}
            </Link>
          </li>
        ))}
    </ul>
  );
}

function ContentSkeleton() {
  return (
    <div role="status" aria-label="Cargando" className="space-y-3">
      {Array.from({ length: 8 }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder rows never reorder
        <div key={i} className="h-11 animate-pulse rounded-[var(--radius-control)] bg-surface" />
      ))}
    </div>
  );
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const actor = await requireActor();
  return (
    <>
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-[var(--radius-control)] focus:bg-background focus:px-4 focus:py-2"
      >
        Saltar al contenido
      </a>
      <div className="lg:flex">
        <aside className="hidden w-62 shrink-0 border-r border-border bg-background p-4 lg:block lg:min-h-dvh">
          <p className="mb-6 px-3 font-display text-lg font-bold">Tekinsof CRM</p>
          <nav aria-label="Principal">
            <NavLinks actor={actor} />
          </nav>
        </aside>
        <div className="min-w-0 flex-1">
          <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-4 py-3 lg:px-8">
            <details className="lg:hidden">
              <summary className="min-h-9 cursor-pointer py-2 font-medium">Menú</summary>
              <nav aria-label="Principal (móvil)" className="mt-2">
                <NavLinks actor={actor} />
              </nav>
            </details>
            <div className="text-sm">
              <p className="font-medium">{actor.name}</p>
              <p className="text-fg-muted">{roleLabels[actor.role]}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <form aria-label="Tema" className="flex gap-1">
                {themes.map((theme) => (
                  <button
                    key={theme.value}
                    type="submit"
                    formAction={setTheme.bind(null, theme.value)}
                    className="min-h-9 rounded-[var(--radius-control)] border border-border px-3 text-sm hover:bg-surface"
                  >
                    {theme.label}
                  </button>
                ))}
              </form>
              <form action={signOut}>
                <button
                  type="submit"
                  className="min-h-9 rounded-[var(--radius-control)] border border-border px-3 text-sm hover:bg-surface"
                >
                  Salir
                </button>
              </form>
            </div>
          </header>
          <main id="contenido" className="px-4 py-6 lg:px-8">
            <Suspense fallback={<ContentSkeleton />}>{children}</Suspense>
          </main>
        </div>
      </div>
    </>
  );
}
