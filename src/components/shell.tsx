"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  SquaresFour,
  Stack,
  Receipt,
  Users,
  Package,
  Tag,
  ShieldCheck,
  ClockCounterClockwise,
  GearSix,
  SignOut,
  Infinity,
  CreditCard,
  CaretDown,
  List,
  X,
  ArrowUpRight,
  BookOpen,
} from "@phosphor-icons/react";
import type { Actor } from "@/lib/types";
const ActorContext = createContext<Actor | null>(null);
export function useActor() {
  return useContext(ActorContext)!;
}
const links = [
  { href: "/", name: "Overview", icon: SquaresFour },
  { href: "/subscriptions", name: "Subscriptions", icon: Stack },
  { href: "/invoices", name: "Invoices", icon: Receipt },
  { href: "/payments", name: "Payments", icon: CreditCard },
  { href: "/customers", name: "Customers", icon: Users },
];
const config = [
  { href: "/products", name: "Products", icon: Package },
  { href: "/plans", name: "Plans", icon: Tag },
];
const studio = [
  { href: "/integrity", name: "BillGuard", icon: ShieldCheck },
  { href: "/simulator", name: "Time Machine", icon: ClockCounterClockwise },
];
export const titles: Record<string, string> = {
  "/": "Overview",
  "/subscriptions": "Subscriptions",
  "/invoices": "Invoices",
  "/payments": "Payments",
  "/customers": "Customers",
  "/products": "Products",
  "/plans": "Plans",
  "/integrity": "BillGuard",
  "/simulator": "Time Machine",
  "/settings": "Settings",
  "/profile": "My profile",
  "/how-it-works": "How it works",
};
export function Shell({
  actor,
  demo,
  children,
}: {
  actor: Actor;
  demo: boolean;
  children: ReactNode;
}) {
  const path = usePathname();
  const router = useRouter();
  const [mobile, setMobile] = useState(false);
  const internal = actor.role !== "CUSTOMER";
  const group = (items: typeof links) =>
    items.map((item) => (
      <Link
        href={item.href}
        key={item.href}
        onClick={() => setMobile(false)}
        className={`nav-link ${path === item.href ? "selected" : ""}`}
      >
        <item.icon size={20} weight={path === item.href ? "fill" : "regular"} />
        <span>{item.name}</span>
        {item.href === "/integrity" ? (
          <span className="nav-new">NEW</span>
        ) : null}
      </Link>
    ));
  async function logout() {
    await fetch("/api/auth/sign-out", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    router.replace("/login");
    router.refresh();
  }
  return (
    <ActorContext.Provider value={actor}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <div className="app-layout">
        {mobile ? (
          <button
            className="sidebar-scrim"
            aria-label="Close navigation"
            onClick={() => setMobile(false)}
          />
        ) : null}
        <aside className={`sidebar ${mobile ? "sidebar-open" : ""}`}>
          <Link href="/" className="brand">
            <span className="brand-mark">
              <Infinity weight="bold" size={30} />
            </span>
            <span>
              brightloop<span className="brand-period">.</span>
            </span>
          </Link>
          <div className="workspace-switch">
            <span className="workspace-logo">B</span>
            <div>
              <strong>Brightloop Software</strong>
              <small>{internal ? "Team workspace" : "Customer portal"}</small>
            </div>
            <CaretDown size={13} aria-hidden />
          </div>
          <nav aria-label="Main navigation">
            <p className="nav-label">WORKSPACE</p>
            {group(
              internal
                ? links
                : links.filter((l) =>
                    ["/", "/subscriptions", "/invoices"].includes(l.href),
                  ),
            )}
            {internal ? (
              <>
                <p className="nav-label">CATALOG</p>
                {group(config)}
                <p className="nav-label">BILLING INTEGRITY</p>
                {group(studio)}
              </>
            ) : null}
          </nav>
          <div className="sidebar-bottom">
            {group([
              { href: "/how-it-works", name: "How it works", icon: BookOpen },
            ])}
            {demo ? (
              <div className="demo-note">
                <span className="live-dot" />
                <span>
                  Local demo workspace
                  <small>All data stays on your machine</small>
                </span>
              </div>
            ) : null}
            {group([
              {
                href: internal ? "/settings" : "/profile",
                name: internal ? "Settings" : "My profile",
                icon: GearSix,
              },
            ])}
            <div className="user-block">
              <span className="avatar">
                {actor.name
                  .split(" ")
                  .map((s) => s[0])
                  .slice(0, 2)
                  .join("")}
              </span>
              <div>
                <strong>{actor.name}</strong>
                <small>
                  {actor.role === "ADMIN"
                    ? "Administrator"
                    : actor.role === "STAFF"
                      ? "Internal team"
                      : "Customer"}
                </small>
              </div>
              <button
                onClick={logout}
                className="icon-button"
                aria-label="Sign out"
              >
                <SignOut size={19} />
              </button>
            </div>
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <div className="breadcrumb">
              <button
                className="icon-button mobile-menu"
                aria-label={mobile ? "Close navigation" : "Open navigation"}
                onClick={() => setMobile(!mobile)}
              >
                {mobile ? <X size={22} /> : <List size={22} />}
              </button>
              <span>{internal ? "Workspace" : "My portal"}</span>
              <span className="breadcrumb-slash">/</span>
              <strong>{titles[path] ?? "Workspace"}</strong>
            </div>
            <div className="topbar-right">
              <span className="local-label">
                <span className="live-dot" />
                PostgreSQL connected
              </span>
              <span className="topbar-divider" />
              <Link
                href={internal ? "/settings?tab=outbox" : "/profile"}
                className="topbar-help"
              >
                {internal ? "Local outbox" : "My account"}
                <ArrowUpRight size={15} />
              </Link>
              <span className="avatar small-avatar">{actor.name[0]}</span>
            </div>
          </header>
          <main id="main-content">{children}</main>
          <footer className="app-footer">
            <span>Brightloop · Every cycle, accounted for.</span>
            <span>INR · Asia/Kolkata</span>
          </footer>
        </div>
      </div>
    </ActorContext.Provider>
  );
}
