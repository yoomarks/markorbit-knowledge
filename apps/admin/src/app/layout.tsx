import type { Metadata } from "next";
import { AdminI18nProvider } from "@/lib/i18n";
import "./globals.css";

export const metadata: Metadata = {
  title: "MarkOrbit Knowledge",
  description: "Acquisition and knowledge-staging control plane",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <AdminI18nProvider>{children}</AdminI18nProvider>
      </body>
    </html>
  );
}
