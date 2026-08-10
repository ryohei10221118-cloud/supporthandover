"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemePicker from "./ThemePicker";
import { LANG_STORAGE_KEY, LANG_CHANGE_EVENT, ROLE_PREVIEW_EVENT } from "@/lib/theme";
import { getRolePreviewKey, setRolePreview } from "@/lib/rolePreview";
import type { ClientSession, Permissions } from "@/lib/permissions";

type Lang = "zh" | "en";

const STRINGS = {
  tagline: { zh: "案件追蹤看板", en: "Case Tracking Board" },
  navT1ho: { zh: "T1 HO", en: "T1 HO" },
  navHo: { zh: "HO", en: "HO" },
  navDashboard: { zh: "分析儀表板", en: "Dashboard" },
  previewAs: { zh: "預覽身份", en: "Preview as" },
  navLists: { zh: "選項管理", en: "Option lists" },
  logout: { zh: "登出", en: "Sign out" },
};

function t(lang: Lang, key: keyof typeof STRINGS): string {
  return STRINGS[key][lang];
}

// Same 49-circle dot-cluster brand mark as the login page, but with its own
// fixed red gradient (not tied to the picked --accent) — this is the fixed
// brand mark, deliberately independent of the accent picker.
function BrandMark() {
  return (
    <svg viewBox="0 0 47 47" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="sidebar-brand-gradient" x1="0.5" y1="1" x2="0.5" y2="0" gradientUnits="objectBoundingBox">
          <stop offset="0" stopColor="#8a1e2f" />
          <stop offset="1" stopColor="#ed203e" />
        </linearGradient>
      </defs>
      <g fill="url(#sidebar-brand-gradient)">
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(23.152 23.006)" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(23.152 15.027)" opacity="0.95" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(23.152 30.872)" opacity="0.55" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(31.074 22.949)" opacity="0.85" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(15.229 22.949)" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(17.55 17.347)" opacity="0.95" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(28.754 28.551)" opacity="0.75" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(28.754 17.347)" opacity="0.85" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(17.55 28.551)" opacity="0.3" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(23.152 7.513)" opacity="0.95" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(23.152)" opacity="0.95" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(23.152 38.499)" opacity="0.55" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(7.659 23.006)" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(38.644 23.006)" opacity="0.75" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(34.106 12.051)" opacity="0.85" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(12.196 33.961)" opacity="0.3" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(12.196 12.051)" opacity="0.95" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(34.106 33.961)" opacity="0.65" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(29.08 8.692)" opacity="0.95" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(17.223 37.319)" opacity="0.35" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(8.838 17.077)" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(37.465 28.935)" opacity="0.75" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(17.223 8.692)" opacity="0.95" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(29.08 37.319)" opacity="0.55" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(8.838 28.934)" opacity="0.2" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(37.465 17.077)" opacity="0.85" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(23.152 46.303)" opacity="0.55" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(46.303 23.152)" opacity="0.75" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(0 23.152)" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(6.781 6.781)" opacity="0.95" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(39.522 39.522)" opacity="0.55" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(39.522 6.781)" opacity="0.85" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(6.781 39.522)" opacity="0.3" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(3.102 11.576)" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(43.201 34.727)" opacity="0.65" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(34.727 3.102)" opacity="0.85" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(11.576 43.201)" opacity="0.35" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(11.576 3.102)" opacity="0.95" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(34.727 43.201)" opacity="0.55" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(43.201 11.576)" opacity="0.85" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(3.102 34.727)" opacity="0.2" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(0.789 17.16)" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(45.514 29.144)" opacity="0.65" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(29.144 0.789)" opacity="0.95" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(17.16 45.514)" opacity="0.5" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(17.16 0.789)" opacity="0.95" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(29.144 45.514)" opacity="0.55" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(45.514 17.16)" opacity="0.75" />
        <circle cx="1.849" cy="1.849" r="1.849" transform="translate(0.789 29.144)" opacity="0.2" />
      </g>
    </svg>
  );
}

export default function Sidebar({
  session,
  rolePermissions,
}: {
  session: ClientSession | null;
  rolePermissions: Record<string, Permissions>;
}) {
  const pathname = usePathname();
  const [lang, setLang] = useState<Lang>("zh");
  const me = session ? { ...session, role: session.roleKey } : null;
  const rolePerms = rolePermissions;
  const myPerms = session?.permissions ?? null;
  // Admins can preview the app as another role; anyone else sees their own.
  // Seeded from the module-scope value so switching pages mid-preview keeps
  // the previewed role instead of snapping back to Admin.
  const [previewRole, setPreviewRole] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LANG_STORAGE_KEY);
      if (saved === "en" || saved === "zh") setLang(saved);
    } catch {
      // ignore
    }
    setPreviewRole(getRolePreviewKey());
  }, []);

  function toggleLang() {
    const next: Lang = lang === "zh" ? "en" : "zh";
    setLang(next);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {
      // ignore
    }
    window.dispatchEvent(new CustomEvent(LANG_CHANGE_EVENT, { detail: next }));
  }

  function previewAs(role: string | null) {
    setPreviewRole(role);
    const detail = role && rolePerms[role] ? rolePerms[role] : null;
    setRolePreview(role, detail);
    window.dispatchEvent(new CustomEvent(ROLE_PREVIEW_EVENT, { detail }));
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  if (pathname === "/login") return null;

  const boardIcon = (
    <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 3h18v18H3z" />
      <path d="M3 9h18M9 21V9" />
    </svg>
  );
  const listsIcon = (
    <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );

  const dashboardIcon = (
    <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );

  // While previewing another role, the nav follows what that role would see.
  const effectivePerms = previewRole && rolePerms[previewRole] ? rolePerms[previewRole] : myPerms;
  const navItems = [
    { href: "/", label: t(lang, "navT1ho"), icon: boardIcon, show: true },
    { href: "/ho", label: t(lang, "navHo"), icon: boardIcon, show: true },
    {
      href: "/dashboard",
      label: t(lang, "navDashboard"),
      icon: dashboardIcon,
      show: !!effectivePerms?.["page.dashboard"],
    },
    { href: "/lists", label: t(lang, "navLists"), icon: listsIcon, show: !!effectivePerms?.["page.lists"] },
  ].filter((i) => i.show);

  return (
    <aside className="sidebar">
      <div className="brand">
        <BrandMark />
        <div className="brand-text">
          BTi CS Handover Board
          <small>{t(lang, "tagline")}</small>
        </div>
      </div>

      <nav className="side-nav">
        {navItems.map((item) => (
          <Link key={item.href} href={item.href} className={`nav-item${pathname === item.href ? " active" : ""}`}>
            {item.icon}
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      <div className="sidebar-foot">
        <div className="toggle-row">
          <button className="mini-btn" type="button" onClick={toggleLang}>
            {lang === "zh" ? "EN" : "中文"}
          </button>
          <ThemePicker lang={lang} />
        </div>

        {me && (
          <>
          {me.role === "admin" && Object.keys(rolePerms).length > 0 && (
            <div>
              <div className="role-switch-label">{t(lang, "previewAs")}</div>
              <div className="role-switch" style={{ marginTop: 5 }}>
                {Object.keys(rolePerms).map((key) => {
                  const active = (previewRole ?? me.role) === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      className={active ? "active" : undefined}
                      onClick={() => previewAs(key === me.role ? null : key)}
                    >
                      {key === "admin" ? "Admin" : key === "support" ? "Support" : key === "viewer" ? "Viewer" : key}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="user-pill">
            <div className="user-avatar">{me.name.slice(0, 1).toUpperCase()}</div>
            <div className="who">
              <div className="name">{me.email}</div>
              <div className="role">
                {previewRole && previewRole !== me.role ? `${previewRole} (預覽)` : me.roleLabel}
              </div>
            </div>
            <button type="button" className="sidebar-logout-btn" onClick={logout} aria-label={t(lang, "logout")} title={t(lang, "logout")}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>
          </>
        )}
      </div>
    </aside>
  );
}
