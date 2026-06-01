"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import SignOutButton from "../dashboard/SignOutButton";

interface User {
  id: string;
  name?: string;
  email?: string;
  isAdmin?: boolean;
}

export default function Header() {
  const [user, setUser] = useState<User | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch("/api/user");
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
        }
      } catch (err) {
        console.error("Error fetching user:", err);
      }
    };

    fetchUser();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const getInitial = (name?: string) => {
    if (!name) return "U";
    return name.charAt(0).toUpperCase();
  };

  const dropdownItems = [
    { label: "Profile", href: "/profile", icon: "👤" },
    { label: "History", href: "/history", icon: "📊" },
    { label: "Feedback", href: "/feedback", icon: "💬" },
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-foreground/10 bg-background">
      <div className="flex items-center justify-end px-6 py-4">
        {/* User Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-2 rounded-full border border-foreground/15 bg-foreground/5 px-3 py-2 transition-all hover:border-foreground/30 hover:bg-foreground/10"
            aria-label="User menu"
            aria-expanded={isOpen}
          >
            {/* Avatar Circle with Initial or Photo */}
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-sm font-semibold text-white">
              {getInitial(user?.name)}
            </div>

            {/* User Name */}
            <span className="text-sm font-medium text-foreground">
              {user?.name || "User"}
            </span>

            {/* Chevron Icon */}
            <span
              className={`text-xs text-foreground/70 transition-transform ${
                isOpen ? "rotate-180" : ""
              }`}
            >
              ▼
            </span>
          </button>

          {/* Dropdown Menu */}
          {isOpen && (
            <div className="absolute right-0 mt-2 w-48 rounded-lg border border-foreground/10 bg-background shadow-lg">
              {/* User Info Header */}
              <div className="border-b border-foreground/10 px-4 py-3">
                <div className="text-sm font-medium text-foreground">
                  {user?.name || "User"}
                </div>
                <div className="text-xs text-foreground/60">{user?.email}</div>
              </div>

              {/* Menu Items */}
              <nav className="space-y-0 py-2">
                {dropdownItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsOpen(false)}
                    className="flex items-center gap-3 px-4 py-2 text-sm text-foreground/80 transition-all hover:bg-foreground/5 hover:text-foreground"
                  >
                    <span className="text-base">{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                ))}
              </nav>

              {/* Divider */}
              <div className="border-t border-foreground/10" />

              {/* Sign Out Button */}
              <div className="px-4 py-2">
                <SignOutButton />
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
