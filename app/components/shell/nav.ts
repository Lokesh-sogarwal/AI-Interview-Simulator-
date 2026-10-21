import {
  ChartColumn,
  FileSearch,
  History,
  LayoutDashboard,
  Medal,
  MessageSquareText,
  Mic,
  Shield,
  Trophy,
  User,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { label: string; href: string; icon: LucideIcon; match?: string[] };
export type NavGroup = { label: string; items: NavItem[] };

export function navGroups(isAdmin: boolean): NavGroup[] {
  return [
    {
      label: "Practice",
      items: [
        { label: "Dashboard", href: "/", icon: LayoutDashboard, match: ["/dashboard"] },
        { label: "New interview", href: "/interview/setup", icon: Mic, match: ["/interview"] },
        { label: "Resume checker", href: "/resume", icon: FileSearch },
      ],
    },
    {
      label: "Review",
      items: [
        { label: "History", href: "/history", icon: History },
        { label: "Feedback", href: "/feedback", icon: MessageSquareText },
      ],
    },
    {
      label: "Compete",
      items: [
        { label: "Contests", href: "/contests", icon: Medal },
        { label: "Leaderboard", href: "/leaderboard", icon: Trophy },
        { label: "Ratings", href: "/ratings", icon: ChartColumn },
      ],
    },
    {
      label: "Account",
      items: [
        { label: "Profile", href: "/profile", icon: User },
        ...(isAdmin ? [{ label: "Admin", href: "/admin", icon: Shield }] : []),
      ],
    },
  ];
}

export function isNavActive(item: NavItem, pathname: string) {
  if (item.href === "/") return pathname === "/" || (item.match ?? []).some((m) => pathname.startsWith(m));
  return pathname.startsWith(item.href) || (item.match ?? []).some((m) => pathname === m || pathname.startsWith(`${m}/`));
}
