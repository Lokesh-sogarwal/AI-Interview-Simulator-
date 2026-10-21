"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { LogOut, Menu as MenuIcon, User, X } from "lucide-react";

import { IconButton, Menu, cn } from "@/app/components/ui";
import { BrandMark } from "./BrandMark";
import { isNavActive, navGroups } from "./nav";
import { signOut } from "./signOut";

export type ShellUser = { name: string; email: string; isAdmin: boolean };

function initials(user: ShellUser) {
  const source = user.name.trim() || user.email;
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "U") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function NavList({ isAdmin, pathname, onNavigate }: { isAdmin: boolean; pathname: string; onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="grid gap-5">
      {navGroups(isAdmin).map((group) => (
        <div key={group.label}>
          <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">{group.label}</p>
          <ul className="grid gap-0.5">
            {group.items.map((item) => {
              const active = isNavActive(item, pathname);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group flex items-center gap-3 rounded-control px-3 py-2 text-sm font-medium transition-colors",
                      active ? "bg-primary text-on-primary" : "text-text/85 hover:bg-primary/[0.06] hover:text-text",
                    )}
                  >
                    <Icon className={cn("size-[18px] shrink-0", active ? "text-on-primary" : "text-muted group-hover:text-text")} aria-hidden />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function UserMenu({ user, placement = "top" }: { user: ShellUser; placement?: "top" | "bottom" }) {
  const [error, setError] = useState("");
  return (
    <div className="grid gap-2">
      <Menu
        label="Account menu"
        placement={placement}
        align="start"
        className="w-full"
        triggerClassName="flex w-full items-center gap-3 rounded-control p-2 text-left hover:bg-primary/[0.06]"
        trigger={
          <>
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-sm font-semibold text-primary" aria-hidden>
              {initials(user)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-text">{user.name || "Your account"}</span>
              <span className="block truncate text-xs text-muted">{user.email}</span>
            </span>
          </>
        }
        items={[
          { label: "Profile", href: "/profile", icon: <User className="size-4 text-muted" aria-hidden /> },
          {
            type: "button",
            label: "Sign out",
            tone: "danger",
            icon: <LogOut className="size-4" aria-hidden />,
            onSelect: () => {
              setError("");
              signOut().catch((e: Error) => setError(e.message));
            },
          },
        ]}
      />
      {error ? (
        <p role="alert" className="px-2 text-xs text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function MobileDrawer({ open, onClose, user, pathname }: { open: boolean; onClose: () => void; user: ShellUser; pathname: string }) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>("a, button")?.focus();
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key !== "Tab" || !panel) return;
      // Keep keyboard focus inside the open drawer.
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>("a[href], button:not([disabled])"));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      previous?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 bg-primary/40" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        className="absolute inset-y-0 left-0 flex w-[min(20rem,85vw)] flex-col border-r border-border bg-surface shadow-overlay"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <BrandMark />
          <IconButton label="Close navigation" onClick={onClose}>
            <X className="size-5" aria-hidden />
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <NavList isAdmin={user.isAdmin} pathname={pathname} onNavigate={onClose} />
        </div>
        <div className="border-t border-border p-3">
          <UserMenu user={user} />
        </div>
      </div>
    </div>
  );
}

/** Routes that render as a distraction-free workspace without the sidebar. */
const FOCUS_ROUTES = ["/interview"];

export default function AppShell({ user, children }: { user: ShellUser; children: ReactNode }) {
  const pathname = usePathname() || "/";
  const [drawerOpen, setDrawerOpen] = useState(false);
  const focusMode = FOCUS_ROUTES.includes(pathname);

  if (focusMode) {
    return (
      <>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <main id="main" className="min-h-dvh">
          {children}
        </main>
      </>
    );
  }

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <a href="#main" className="skip-link">
        Skip to content
      </a>

      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-border bg-surface lg:flex">
        <div className="px-5 py-5">
          <BrandMark />
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-4">
          <NavList isAdmin={user.isAdmin} pathname={pathname} />
        </div>
        <div className="border-t border-border p-3">
          <UserMenu user={user} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-border bg-surface/95 px-4 py-2.5 backdrop-blur lg:hidden">
          <IconButton label="Open navigation" onClick={() => setDrawerOpen(true)} aria-expanded={drawerOpen}>
            <MenuIcon className="size-5" aria-hidden />
          </IconButton>
          <BrandMark compact />
          <span className="grid size-9 place-items-center rounded-full bg-accent text-sm font-semibold text-primary" aria-hidden>
            {initials(user)}
          </span>
        </header>
        <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} user={user} pathname={pathname} />
        <main id="main" className="min-w-0 flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
