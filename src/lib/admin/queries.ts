import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export interface AdminMetrics {
  totalUsers: number;
  activeSubscribers: number;
  mrrNGN: number;
  mrrUSD: number;
  totalGarments: number;
  totalOutfits: number;
  totalFlatlays: number;
  subscribersPaystack: number;
  subscribersStripe: number;
  newUsersThisWeek: number;
  totalRevenueNGN: number;
}

export interface AdminUserRow {
  id: string;
  email: string | null;
  displayName: string | null;
  location: string | null;
  timezone: string;
  role: string;
  subscriptionStatus: string;
  subscriptionPlan: string | null;
  subscriptionProvider: string | null;
  createdAt: string;
  garmentCount: number;
  outfitCount: number;
}

export interface AdminSubscriptionRow {
  id: string;
  userId: string;
  userEmail: string | null;
  userName: string | null;
  planId: string;
  provider: string;
  status: string;
  currentPeriodEnd: string | null;
  createdAt: string;
}

export interface AdminTransactionRow {
  id: string;
  userId: string;
  userEmail: string | null;
  userName: string | null;
  provider: string;
  reference: string;
  amount: number;
  currency: string;
  status: string;
  planId: string | null;
  createdAt: string;
}

async function getUserEmailMap(): Promise<Map<string, string>> {
  try {
    const adminClient = createAdminClient();
    const { data } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
    const map = new Map<string, string>();
    for (const u of data?.users ?? []) {
      if (u.email) {
        map.set(u.id, u.email);
      }
    }
    return map;
  } catch (err) {
    console.error("Failed to fetch admin users email map:", err);
    return new Map();
  }
}

export async function getAdminMetrics(): Promise<AdminMetrics> {
  const adminClient = createAdminClient();
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Run counting queries concurrently across tables
  const [
    usersRes,
    newUsersRes,
    garmentsRes,
    outfitsRes,
    flatlaysRes,
    subsRes,
    txsRes,
  ] = await Promise.all([
    adminClient.from("profiles").select("id", { count: "exact", head: true }),
    adminClient.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", oneWeekAgo),
    adminClient.from("wardrobe_items").select("id", { count: "exact", head: true }),
    adminClient.from("outfits").select("id", { count: "exact", head: true }),
    adminClient.from("flatlay_compositions").select("id", { count: "exact", head: true }),
    adminClient.from("user_subscriptions").select("provider, status, plan_id, current_period_end").in("status", ["active", "trialing"]),
    adminClient.from("payment_transactions").select("amount, currency, status").eq("status", "success"),
  ]);

  const totalUsers = usersRes.count ?? 0;
  const newUsersThisWeek = newUsersRes.count ?? 0;
  const totalGarments = garmentsRes.count ?? 0;
  const totalOutfits = outfitsRes.count ?? 0;
  const totalFlatlays = (flatlaysRes as { count?: number }).count ?? 0;

  // Calculate subscriptions and MRR from live user_subscriptions table
  let activeSubscribers = 0;
  let subscribersPaystack = 0;
  let subscribersStripe = 0;
  let mrrNGN = 0;
  let mrrUSD = 0;

  const subsList = (subsRes.data as Array<{ provider: string; status: string; plan_id: string }>) ?? [];

  if (subsList.length > 0) {
    activeSubscribers = subsList.length;
    for (const sub of subsList) {
      if (sub.provider === "stripe") {
        subscribersStripe++;
        mrrUSD += sub.plan_id === "annual" ? 4.16 : 4.99;
      } else {
        subscribersPaystack++;
        mrrNGN += sub.plan_id === "annual" ? 832 : 999;
      }
    }
  } else {
    // Fallback: Check profiles table if user_subscriptions has no records
    const { data: profileSubs } = await adminClient
      .from("profiles")
      .select("subscription_status, subscription_provider, subscription_plan")
      .in("subscription_status", ["active", "trialing"]);

    if (profileSubs && profileSubs.length > 0) {
      activeSubscribers = profileSubs.length;
      for (const p of profileSubs) {
        if (p.subscription_provider === "stripe") {
          subscribersStripe++;
          mrrUSD += p.subscription_plan === "annual" ? 4.16 : 4.99;
        } else {
          subscribersPaystack++;
          mrrNGN += p.subscription_plan === "annual" ? 832 : 999;
        }
      }
    }
  }

  // Calculate total gross revenue collected
  let totalRevenueNGN = 0;
  for (const tx of txsRes.data ?? []) {
    if (tx.currency === "NGN") {
      const amount = tx.amount > 10000 ? tx.amount / 100 : tx.amount;
      totalRevenueNGN += amount;
    }
  }

  return {
    totalUsers,
    activeSubscribers,
    mrrNGN,
    mrrUSD,
    totalGarments,
    totalOutfits,
    totalFlatlays,
    subscribersPaystack,
    subscribersStripe,
    newUsersThisWeek,
    totalRevenueNGN,
  };
}

export async function listAdminUsers(options: {
  query?: string;
  status?: string;
  page?: number;
  limit?: number;
}): Promise<{ users: AdminUserRow[]; totalCount: number }> {
  const adminClient = createAdminClient();
  const page = options.page || 1;
  const limit = options.limit || 25;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  // Hydrate emails from auth.admin
  const emailMap = await getUserEmailMap();

  let q = adminClient
    .from("profiles")
    .select(
      "id, display_name, location, timezone, role, subscription_status, subscription_plan, subscription_provider, created_at",
      { count: "exact" },
    );

  if (options.status && options.status !== "all") {
    if (options.status === "active") {
      q = q.in("subscription_status", ["active", "trialing"]);
    } else if (options.status === "free") {
      q = q.or("subscription_status.is.null,subscription_status.eq.incomplete,subscription_status.eq.canceled");
    }
  }

  if (options.query?.trim()) {
    const term = options.query.trim().toLowerCase();
    const matchingUserIdsFromEmail: string[] = [];
    for (const [userId, email] of emailMap.entries()) {
      if (email.toLowerCase().includes(term)) {
        matchingUserIdsFromEmail.push(userId);
      }
    }

    if (matchingUserIdsFromEmail.length > 0) {
      q = q.or(`display_name.ilike.%${term}%,location.ilike.%${term}%,id.in.(${matchingUserIdsFromEmail.slice(0, 50).join(",")})`);
    } else {
      q = q.or(`display_name.ilike.%${term}%,location.ilike.%${term}%`);
    }
  }

  q = q.order("created_at", { ascending: false }).range(from, to);

  const { data: profiles, count, error } = await q;
  if (error || !profiles) {
    return { users: [], totalCount: 0 };
  }

  const userIds = profiles.map((p) => p.id);

  // Fetch garment & outfit counts for these users in batch
  const [garmentsRes, outfitsRes] = await Promise.all([
    adminClient.from("wardrobe_items").select("user_id").in("user_id", userIds),
    adminClient.from("outfits").select("user_id").in("user_id", userIds),
  ]);

  const garmentCounts = new Map<string, number>();
  for (const row of garmentsRes.data ?? []) {
    garmentCounts.set(row.user_id, (garmentCounts.get(row.user_id) || 0) + 1);
  }

  const outfitCounts = new Map<string, number>();
  for (const row of outfitsRes.data ?? []) {
    outfitCounts.set(row.user_id, (outfitCounts.get(row.user_id) || 0) + 1);
  }

  const users: AdminUserRow[] = profiles.map((p) => ({
    id: p.id,
    email: emailMap.get(p.id) || null,
    displayName: p.display_name,
    location: p.location,
    timezone: p.timezone,
    role: (p as { role?: string }).role || "user",
    subscriptionStatus: (p as { subscription_status?: string }).subscription_status || "free",
    subscriptionPlan: (p as { subscription_plan?: string }).subscription_plan || null,
    subscriptionProvider: (p as { subscription_provider?: string }).subscription_provider || null,
    createdAt: p.created_at,
    garmentCount: garmentCounts.get(p.id) || 0,
    outfitCount: outfitCounts.get(p.id) || 0,
  }));

  return { users, totalCount: count ?? users.length };
}

export async function listAdminSubscribers(): Promise<AdminSubscriptionRow[]> {
  const adminClient = createAdminClient();
  const emailMap = await getUserEmailMap();

  const { data: subs, error } = await adminClient
    .from("user_subscriptions")
    .select("id, user_id, plan_id, provider, status, current_period_end, created_at")
    .order("created_at", { ascending: false });

  if (error || !subs) {
    return [];
  }

  const userIds = subs.map((s) => s.user_id);
  const { data: profiles } = await adminClient
    .from("profiles")
    .select("id, display_name")
    .in("id", userIds);

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));

  return subs.map((s) => ({
    id: s.id,
    userId: s.user_id,
    userEmail: emailMap.get(s.user_id) || null,
    userName: profileMap.get(s.user_id) || null,
    planId: s.plan_id || "monthly",
    provider: s.provider || "paystack",
    status: s.status || "active",
    currentPeriodEnd: s.current_period_end,
    createdAt: s.created_at,
  }));
}

export async function listAdminTransactions(limit = 25): Promise<AdminTransactionRow[]> {
  const adminClient = createAdminClient();
  const emailMap = await getUserEmailMap();

  const { data: txs, error } = await adminClient
    .from("payment_transactions")
    .select("id, user_id, provider, reference, amount, currency, status, plan_id, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !txs) {
    return [];
  }

  const userIds = txs.map((t) => t.user_id);
  const { data: profiles } = await adminClient
    .from("profiles")
    .select("id, display_name")
    .in("id", userIds);

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));

  return txs.map((t) => ({
    id: t.id,
    userId: t.user_id,
    userEmail: emailMap.get(t.user_id) || null,
    userName: profileMap.get(t.user_id) || null,
    provider: t.provider,
    reference: t.reference,
    amount: t.currency === "NGN" && t.amount > 10000 ? t.amount / 100 : t.amount,
    currency: t.currency,
    status: t.status,
    planId: t.plan_id,
    createdAt: t.created_at,
  }));
}
