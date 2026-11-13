import type { Metadata, Viewport } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { ConnectButton } from "@/components/ConnectButton";
import { Nav } from "@/components/Nav";
import { Logo } from "@/components/Logo";

const display = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-display" });
const sans = Geist({ subsets: ["latin"], variable: "--font-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Ferry: move your Bitcoin loan from Aave to Mezo",
  description: "Ferry moves a Bitcoin-backed loan from Aave to Mezo’s fixed-rate MUSD loan in one guided flow. Testnet.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body>
        <Providers>
          <header className="top">
            <div className="container">
              <Link href="/" className="brand" aria-label="Ferry home">
                <Logo />
                <span className="word">Ferry</span>
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
              <span>Ferry · Ethereum Sepolia → Mezo testnet · built for the Mezo Buildathon</span>
              <span className="mono">Not audited · testnet funds only</span>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
