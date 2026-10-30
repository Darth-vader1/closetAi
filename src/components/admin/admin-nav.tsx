"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  CreditCard,
  Send,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

const ADMIN_LINKS = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users & Closets", icon: Users },
  { href: "/admin/subscriptions", label: "Subscriptions & MRR", icon: CreditCard },
  { href: "/admin/broadcasts", label: "Announcements", icon: Send },
  { href: "/admin/system", label: "System Health", icon: Activity },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex space-x-1 sm:space-x-4 overflow-x-auto py-2 no-scrollbar" aria-label="Admin">
      {ADMIN_LINKS.map(({ href, label, icon: Icon }) => {
        const isActive = href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-xl whitespace-nowrap transition-colors",
              isActive
                ? "bg-accent-soft text-accent font-semibold"
                : "text-muted hover:bg-surface-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
