"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, Shield, CheckCircle2, X, ChevronLeft, ChevronRight, Loader2, RotateCcw } from "lucide-react";
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
  pageSize?: number;
}

export function AdminUsersClient({
  initialUsers,
  initialQuery,
  initialStatus,
  totalCount = 0,
  currentPage = 1,
  pageSize = 30,
}: AdminUsersClientProps) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [status, setStatus] = useState(initialStatus);
  const [users, setUsers] = useState(initialUsers);
  const [isPending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up debounce timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const hasActiveFilters = Boolean(query.trim() || (status && status !== "all"));

  const navigateWithFilters = (newQuery: string, newStatus: string, newPage = 1) => {
    startTransition(() => {
      const params = new URLSearchParams();
      if (newQuery.trim()) params.set("q", newQuery.trim());
      if (newStatus && newStatus !== "all") params.set("status", newStatus);
      if (newPage > 1) params.set("page", String(newPage));

      const queryStr = params.toString();
      router.push(queryStr ? `/admin/users?${queryStr}` : "/admin/users");
    });
  };

  // Instant filter-as-you-type with debounced server push
  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      navigateWithFilters(val, status, 1);
    }, 280);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    navigateWithFilters(query, status, 1);
  };

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextStatus = e.target.value;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setStatus(nextStatus);
    navigateWithFilters(query, nextStatus, 1);
  };

  const handleClearQuery = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setQuery("");
    navigateWithFilters("", status, 1);
  };

  const handleResetFilters = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setQuery("");
    setStatus("all");
    navigateWithFilters("", "all", 1);
  };

  const handleGrantVip = (userId: string) => {
    if (!confirm("Grant this user 30 days of active Pro subscription access?")) return;

    startTransition(async () => {
      const res = await grantVipSubscriptionAction(userId, 30);
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) =>
            u.id === userId
              ? {
                  ...u,
                  subscriptionStatus: "active",
                  subscriptionPlan: "monthly",
                  subscriptionProvider: "manual",
                }
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

  // Instant client-side filtering while typing ahead before server response returns
  const normalizedQuery = query.trim().toLowerCase();
  const isTypingAhead = query !== initialQuery && normalizedQuery.length > 0;

  const displayedUsers = isTypingAhead
    ? users.filter((u) => {
        return (
          (u.displayName && u.displayName.toLowerCase().includes(normalizedQuery)) ||
          (u.email && u.email.toLowerCase().includes(normalizedQuery)) ||
          (u.location && u.location.toLowerCase().includes(normalizedQuery)) ||
          (u.role && u.role.toLowerCase().includes(normalizedQuery)) ||
          (u.subscriptionStatus && u.subscriptionStatus.toLowerCase().includes(normalizedQuery)) ||
          (u.subscriptionProvider && u.subscriptionProvider.toLowerCase().includes(normalizedQuery))
        );
      })
    : users;

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const hasPrev = currentPage > 1;
  const hasNext = currentPage < totalPages;

  return (
    <div className="space-y-4">
      {/* Search & Filters */}
      <Card className="p-4 bg-surface border-border">
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={handleQueryChange}
              placeholder="Filter as you type by name, email, location, or closet item (e.g. gbem, top)..."
              className="w-full rounded-xl border border-border bg-background pl-9 pr-8 py-2 text-xs text-foreground placeholder:text-muted focus:border-accent focus:outline-hidden"
            />
            {query.trim().length > 0 && (
              <button
                type="button"
                onClick={handleClearQuery}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-foreground p-0.5"
                title="Clear query"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          <select
            value={status}
            onChange={handleStatusChange}
            className="w-full sm:w-auto rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-accent focus:outline-hidden"
          >
            <option value="all">All Members</option>
            <option value="active">Active Subscribers</option>
            <option value="free">Free / Incomplete</option>
            <option value="admin">Administrators</option>
          </select>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              type="submit"
              size="sm"
              variant="primary"
              disabled={isPending}
              className="flex-1 sm:flex-none text-xs px-5 flex items-center justify-center gap-1.5"
            >
              {isPending ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>Searching...</span>
                </>
              ) : (
                <span>Filter</span>
              )}
            </Button>

            {hasActiveFilters && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleResetFilters}
                disabled={isPending}
                className="text-xs px-3 border-border hover:bg-surface-muted"
                title="Reset all filters"
              >
                <RotateCcw className="size-3.5" />
                <span className="sr-only sm:not-sr-only sm:ml-1 text-[11px]">Reset</span>
              </Button>
            )}
          </div>
        </form>
      </Card>

      {/* Users Table */}
      <Card className="overflow-hidden border-border bg-surface">
        <div className={`overflow-x-auto transition-opacity duration-200 ${isPending ? "opacity-60 pointer-events-none" : "opacity-100"}`}>
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
              {displayedUsers.map((u) => {
                const isSubscribed = u.subscriptionStatus === "active" || u.subscriptionStatus === "trialing";

                return (
                  <tr key={u.id} className="hover:bg-surface-muted/30 transition-colors">
                    {/* User Profile */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="size-8 rounded-full bg-accent-soft text-accent grid place-items-center font-serif text-sm font-semibold shrink-0">
                          {(u.displayName || u.email || "U")[0]?.toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-foreground truncate max-w-[200px]">
                            {u.displayName || "Unnamed Member"}
                          </p>
                          <p className="text-[11px] text-muted truncate max-w-[220px]" title={u.email || u.id}>
                            {u.email ? u.email : `${u.id.slice(0, 8)}…`}
                          </p>
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

        {displayedUsers.length === 0 && (
          <div className="text-center py-12 px-4 space-y-3">
            <p className="text-muted text-xs">
              {hasActiveFilters
                ? `No members found matching "${query ? query : status}".`
                : "No registered members found."}
            </p>
            {hasActiveFilters && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleResetFilters}
                className="text-xs px-3 border-border hover:bg-surface-muted"
              >
                Clear filters &amp; view all members
              </Button>
            )}
          </div>
        )}

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="border-t border-border px-4 py-3 flex items-center justify-between text-xs text-muted">
            <span>
              Page {currentPage} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!hasPrev || isPending}
                onClick={() => navigateWithFilters(query, status, currentPage - 1)}
                className="h-8 px-2.5 text-xs flex items-center gap-1 border-border"
              >
                <ChevronLeft className="size-3.5" />
                <span>Previous</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!hasNext || isPending}
                onClick={() => navigateWithFilters(query, status, currentPage + 1)}
                className="h-8 px-2.5 text-xs flex items-center gap-1 border-border"
              >
                <span>Next</span>
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
