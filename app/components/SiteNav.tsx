"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function SiteNav() {
  const pathname = usePathname();
  if (pathname === "/login") return null;

  return (
    <nav className="site-nav">
      <Link href="/">T1 HO</Link>
      <Link href="/ho">HO</Link>
    </nav>
  );
}
