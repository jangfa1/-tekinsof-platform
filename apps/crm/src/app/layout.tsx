import type { Metadata } from "next";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Tekinsof CRM", template: "%s · Tekinsof CRM" },
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const theme = (await cookies()).get("theme")?.value;
  const themeClass = theme === "dark" || theme === "light" ? theme : undefined;
  return (
    <html lang="es-PE" className={themeClass}>
      <body className="min-h-dvh bg-background font-sans text-fg antialiased">{children}</body>
    </html>
  );
}
