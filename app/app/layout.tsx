import type { Metadata, Viewport } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "./providers";
import { ConnectButton } from "@/components/ConnectButton";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "Ferry — move your BTC loan from Aave to Mezo",
  description: "Ferry moves a Bitcoin-backed loan from Aave to Mezo's fixed-rate MUSD loan in one flow. Testnet.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <header className="top">
            <div className="container">
              <Link href="/" className="brand">
                <span className="logo">⛴</span> Ferry
              </Link>
              <Nav />
              <span className="badge-testnet">Testnet</span>
              <ConnectButton />
            </div>
          </header>
          <main>
            <div className="container">{children}</div>
          </main>
          <footer>
            <div className="container">
              Ferry is a testnet prototype (Ethereum Sepolia + Mezo testnet) built for the Mezo Buildathon. Not audited. Never use mainnet funds.
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
