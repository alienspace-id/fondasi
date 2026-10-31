import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "Fondasi";

export const metadata: Metadata = {
  title: { default: appName, template: `%s · ${appName}` },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>
        <nav className="topbar no-print">
          <Link href="/" className="brand">
            {appName}
          </Link>
          <Link href="/akun">Akun</Link>
        </nav>
        {children}
      </body>
    </html>
  );
}
