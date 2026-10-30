"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Shield, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { AdminUserRow } from "@/lib/admin/queries";
import { grantVipSubscriptionAction, updateUserRoleAction } from "@/app/admin/actions";

interface AdminUsersClientProps {
  initialUsers: AdminUserRow[];
  initialQuery: string;
  initialStatus: string;
  totalCount?: number;
  currentPage?: number;
}

export function AdminUsersClient({
  initialUsers,
  initialQuery,
  initialStatus,
}: AdminUsersClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(initialQuery);
  const [status, setStatus] = useState(initialStatus);
  const [users, setUsers] = useState(initialUsers);
  const [isPending, startTransition] = useTransition();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    if (query.trim()) params.set("q", query.trim());
    else params.delete("q");

    if (status !== "all") params.set("status", status);
    else params.delete("status");

    params.set("page", "1");
    router.push(`/admin/users?${params.toString()}`);
  };

  const handleGrantVip = (userId: string) => {
    if (!confirm("Grant this user 30 days of active Pro subscription access?")) return;

    startTransition(async () => {
      const res = await grantVipSubscriptionAction(userId, 30);
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) =>
            u.id === userId
              ? { ...u, subscriptionStatus: "active", subscriptionPlan: "monthly", subscriptionProvider: "manual" }
              : u,
          ),
        );
      } else {
        alert(res.error || "Failed to grant VIP access.");
      }
    });
  };

  const handleToggleAdmin = (userId: string, currentRole: string) => {
    const nextRole = currentRole === "admin" ? "user" : "admin";
    if (!confirm(`Change this user's role to ${nextRole.toUpperCase()}?`)) return;

    startTransition(async () => {
      const res = await updateUserRoleAction(userId, nextRole);
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, role: nextRole } : u)),
        );
      } else {
        alert(res.error || "Failed to update role.");
      }
    });
  };

  return (
    <div className="space-y-4">
      {/* Search & Filters */}
      <Card className="p-4 bg-surface border-border">
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by display name or location..."
              className="w-full rounded-xl border border-border bg-background pl-9 pr-4 py-2 text-xs text-foreground placeholder:text-muted focus:border-accent focus:outline-hidden"
            />
          </div>

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full sm:w-auto rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-accent focus:outline-hidden"
          >
            <option value="all">All Subscriptions</option>
            <option value="active">Active Subscribers</option>
            <option value="free">Free / Incomplete</option>
          </select>

          <Button type="submit" size="sm" variant="primary" className="w-full sm:w-auto text-xs px-5">
            Filter
          </Button>
        </form>
      </Card>

      {/* Users Table */}
      <Card className="overflow-hidden border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-border bg-surface-muted/40 text-muted uppercase text-[10px] tracking-wider font-semibold">
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-4">Location</th>
                <th className="py-3 px-4">Wardrobe</th>
                <th className="py-3 px-4">Membership</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {users.map((u) => {
                const isSubscribed = u.subscriptionStatus === "active" || u.subscriptionStatus === "trialing";

                return (
                  <tr key={u.id} className="hover:bg-surface-muted/30 transition-colors">
                    {/* User Profile */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="size-8 rounded-full bg-accent-soft text-accent grid place-items-center font-serif text-sm font-semibold">
                          {(u.displayName || "U")[0]?.toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{u.displayName || "Unnamed Member"}</p>
                          <p className="text-[10px] text-muted font-mono truncate max-w-[140px]">{u.id.slice(0, 8)}…</p>
                        </div>
                      </div>
                    </td>

                    {/* Location */}
                    <td className="py-3.5 px-4 text-muted">
                      {u.location || "Not provided"}
                    </td>

                    {/* Wardrobe Items */}
                    <td className="py-3.5 px-4">
                      <span className="font-medium text-foreground">{u.garmentCount}</span> clothes · {u.outfitCount} outfits
                    </td>

                    {/* Subscription Status */}
                    <td className="py-3.5 px-4">
                      {isSubscribed ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 text-emerald-600 px-2.5 py-0.5 font-semibold text-[10px] uppercase">
                          <CheckCircle2 className="size-3" />
                          <span>Pro ({u.subscriptionProvider || "Active"})</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-surface-muted text-muted px-2.5 py-0.5 text-[10px] font-medium uppercase">
                          Free
                        </span>
                      )}
                    </td>

                    {/* Role */}
                    <td className="py-3.5 px-4">
                      {u.role === "admin" || u.role === "superadmin" ? (
                        <span className="inline-flex items-center gap-1 text-accent font-semibold text-[11px]">
                          <Shield className="size-3" />
                          <span>Admin</span>
                        </span>
                      ) : (
                        <span className="text-muted">User</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5 justify-end">
                        {!isSubscribed && (
                          <button
                            type="button"
                            onClick={() => handleGrantVip(u.id)}
                            disabled={isPending}
                            className="rounded-lg border border-border px-2.5 py-1 text-[11px] font-medium text-accent hover:bg-accent-soft transition-colors"
                          >
                            + Grant VIP
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleToggleAdmin(u.id, u.role)}
                          disabled={isPending}
                          className="rounded-lg border border-border px-2.5 py-1 text-[11px] font-medium text-muted hover:text-foreground hover:bg-surface-muted transition-colors"
                        >
                          {u.role === "admin" ? "Demote" : "Make Admin"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {users.length === 0 && (
          <div className="text-center py-12 text-muted text-xs">
            No users match your search query.
          </div>
        )}
      </Card>
    </div>
  );
}
