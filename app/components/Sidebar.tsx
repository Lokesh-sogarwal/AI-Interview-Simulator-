"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import SignOutButton from "../dashboard/SignOutButton";

interface User {
  id: string;
  isAdmin?: boolean;
}

export default function Sidebar() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch('/api/user');
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
        }
      } catch (err) {
        console.error('Error fetching user:', err);
      }
    };

    fetchUser();
  }, []);

  const navItems = [
    { name: "Home", href: "/", icon: "🏠" },
    { name: "Resume Checker", href: "/?action=check-resume", icon: "📄" },
    { name: "Interview", href: "/interview/setup", icon: "🎙️" },
    { name: "Contests", href: "/contests", icon: "🏅" },
    { name: "Leaderboard", href: "/leaderboard", icon: "🏆" },
    ...(user?.isAdmin ? [{ name: "Admin", href: "/admin", icon: "⚙️" }] : []),
  ];

  const isActive = (href: string) => {
    if (href === "/" && pathname === "/") return true;
    if (href !== "/" && pathname.startsWith(href.split("?")[0])) return true;
    return false;
  };

  return (
    <>
      {/* Mobile Hamburger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed top-4 left-4 z-50 md:hidden inline-flex h-11 w-11 items-center justify-center rounded-lg bg-foreground text-background transition-all hover:opacity-90 active:scale-95"
        aria-label="Toggle sidebar"
      >
        <div className="flex flex-col gap-1.5">
          <span className={`h-0.5 w-6 bg-current transition-all duration-300 ${isOpen ? "rotate-45 translate-y-2" : ""}`} />
          <span className={`h-0.5 w-6 bg-current transition-all duration-300 ${isOpen ? "opacity-0" : ""}`} />
          <span className={`h-0.5 w-6 bg-current transition-all duration-300 ${isOpen ? "-rotate-45 -translate-y-2" : ""}`} />
        </div>
      </button>

      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 h-dvh w-64 bg-background border-r border-foreground/10 z-40 transition-transform duration-300 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0 md:sticky md:top-0 flex flex-col`}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 border-b border-foreground/10 px-6 py-6">
          <div className="flex size-9 items-center justify-center rounded-xl bg-foreground text-background">
            <span className="text-sm font-semibold">AI</span>
          </div>
          <div className="leading-tight">
            <div className="text-base font-semibold tracking-tight">Interview</div>
            <div className="text-xs text-foreground/70">Simulator</div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-6 space-y-2">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setIsOpen(false)}
              className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all ${
                isActive(item.href)
                  ? "bg-foreground/10 text-foreground"
                  : "text-foreground/70 hover:text-foreground hover:bg-foreground/5"
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              <span>{item.name}</span>
            </Link>
          ))}
        </nav>

        {/* Sign Out Button */}
        <div className="border-t border-foreground/10 px-3 py-6">
          <SignOutButton />
        </div>
      </aside>

      {/* Main content wrapper for desktop */}
      <div className="hidden md:block" />
    </>
  );
}
