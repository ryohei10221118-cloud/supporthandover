import Link from "next/link";

export default function SiteNav() {
  return (
    <nav className="site-nav">
      <Link href="/">T1 HO</Link>
      <Link href="/ho">HO</Link>
    </nav>
  );
}
