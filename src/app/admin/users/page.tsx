import { listAdminUsers } from "@/lib/admin/queries";
import { AdminUsersClient } from "@/components/admin/admin-users-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "User Directory · ClosetAI Admin",
};

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const query = params.q || "";
  const status = params.status || "all";
  const page = Math.max(1, parseInt(params.page || "1", 10));
  const limit = 30;

  const { users, totalCount } = await listAdminUsers({
    query,
    status,
    page,
    limit,
  });

  const rangeStart = users.length > 0 ? (page - 1) * limit + 1 : 0;
  const rangeEnd = Math.min(page * limit, totalCount);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-medium tracking-tight text-foreground">
          User Directory & Closets
        </h1>
        <p className="text-xs text-muted mt-1">
          Showing {rangeStart}–{rangeEnd} of {totalCount} registered members.
        </p>
      </div>

      <AdminUsersClient
        key={`${query}-${status}-${page}`}
        initialUsers={users}
        initialQuery={query}
        initialStatus={status}
        totalCount={totalCount}
        currentPage={page}
        pageSize={limit}
      />
    </div>
  );
}
