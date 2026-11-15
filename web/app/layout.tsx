import "./globals.css";
import type { ReactNode } from "react";
import Link from "next/link";

export const metadata = {
  title: "RuleCash",
  description: "Money that enforces its own rules.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <Link href="/" className="brand">RuleCash</Link>
          <nav>
            <Link href="/">Dashboard</Link>
            <Link href="/pay">Pay</Link>
            <Link href="/merchant">Merchant</Link>
            <Link href="/issuer">Issuer</Link>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
