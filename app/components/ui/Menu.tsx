"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { cn } from "./cn";

type MenuItem =
  | { type?: "link"; label: ReactNode; href: string; icon?: ReactNode }
  | { type: "button"; label: ReactNode; onSelect: () => void; icon?: ReactNode; tone?: "default" | "danger" };

type MenuProps = {
  /** Accessible name for the trigger button. */
  label: string;
  trigger: ReactNode;
  items: MenuItem[];
  align?: "start" | "end";
  placement?: "bottom" | "top";
  header?: ReactNode;
  className?: string;
  triggerClassName?: string;
};

/** Dropdown menu (WAI-ARIA menu button): Enter/Space/ArrowDown opens, arrows move, Escape closes and restores focus. */
export function Menu({ label, trigger, items, align = "end", placement = "bottom", header, className, triggerClassName }: MenuProps) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLElement | null>>([]);

  useEffect(() => {
    if (!open) return;
    itemRefs.current[0]?.focus();
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function close(restoreFocus = true) {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }

  function onMenuKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const els = itemRefs.current.filter(Boolean) as HTMLElement[];
    const index = els.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = (index + (e.key === "ArrowDown" ? 1 : -1) + els.length) % els.length;
      els[next]?.focus();
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      els[e.key === "Home" ? 0 : els.length - 1]?.focus();
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  const itemClass = "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm text-text hover:bg-background focus:bg-background focus:outline-none";

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          className={cn(
            "absolute z-50 min-w-56 rounded-control border border-border bg-surface p-1.5 shadow-overlay",
            align === "end" ? "right-0" : "left-0",
            placement === "top" ? "bottom-full mb-2" : "top-full mt-2",
          )}
        >
          {header ? <div className="border-b border-border px-3 pb-2 pt-1.5">{header}</div> : null}
          <div className={header ? "pt-1.5" : undefined}>
            {items.map((item, i) =>
              item.type === "button" ? (
                <button
                  key={i}
                  ref={(el) => {
                    itemRefs.current[i] = el;
                  }}
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  onClick={() => {
                    close(false);
                    item.onSelect();
                  }}
                  className={cn(itemClass, item.tone === "danger" && "text-error")}
                >
                  {item.icon}
                  {item.label}
                </button>
              ) : (
                <Link
                  key={i}
                  ref={(el) => {
                    itemRefs.current[i] = el;
                  }}
                  href={item.href}
                  role="menuitem"
                  tabIndex={-1}
                  onClick={() => close(false)}
                  className={itemClass}
                >
                  {item.icon}
                  {item.label}
                </Link>
              ),
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
