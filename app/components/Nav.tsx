"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Home" },
  { href: "/migrate", label: "Move my loan" },
  { href: "/status", label: "My migrations" },
  { href: "/docs", label: "How it works" },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav>
      {items.map((i) => (
        <Link key={i.href} href={i.href} className={(i.href === "/" ? path === "/" : path.startsWith(i.href)) ? "active" : ""}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
