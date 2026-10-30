import "server-only";
import { createClient } from "@/lib/supabase/server";

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
}

export async function getAdminMetrics(): Promise<AdminMetrics> {
  const supabase = await createClient();

  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Run counting queries concurrently
  const [
    usersRes,
    newUsersRes,
    garmentsRes,
    outfitsRes,
    flatlaysRes,
    subsRes,
    profilesSubRes,
  ] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", oneWeekAgo),
    supabase.from("wardrobe_items").select("id", { count: "exact", head: true }),
    supabase.from("outfits").select("id", { count: "exact", head: true }),
    supabase.from("flatlay_compositions").select("id", { count: "exact", head: true }),
    supabase.from("subscriptions").select("provider, status, amount, currency, plan_code").in("status", ["active", "trialing"]),
    supabase.from("profiles").select("subscription_status, subscription_provider, subscription_plan").in("subscription_status", ["active", "trialing"]),
  ]);

  const totalUsers = usersRes.count ?? 0;
  const newUsersThisWeek = newUsersRes.count ?? 0;
  const totalGarments = garmentsRes.count ?? 0;
  const totalOutfits = outfitsRes.count ?? 0;
  const totalFlatlays = (flatlaysRes as { count?: number }).count ?? 0;

  // Calculate subscriptions and MRR
  let activeSubscribers = 0;
  let subscribersPaystack = 0;
  let subscribersStripe = 0;
  let mrrNGN = 0;
  let mrrUSD = 0;

  const subsList = (subsRes as { data?: Array<{ provider: string; status: string; amount: number; currency: string; plan_code: string }> }).data ?? [];

  if (subsList.length > 0) {
    activeSubscribers = subsList.length;
    for (const sub of subsList) {
      if (sub.provider === "paystack" || sub.currency === "NGN") {
        subscribersPaystack++;
        // Monthly NGN 999
        mrrNGN += sub.plan_code === "annual" ? 832 : 999;
      } else {
        subscribersStripe++;
        // Monthly USD 4.99
        mrrUSD += sub.plan_code === "annual" ? 4.16 : 4.99;
      }
    }
  } else {
    // Fallback: Check profiles table if subscriptions table not yet populated
    const profileSubs = (profilesSubRes as { data?: Array<{ subscription_status: string; subscription_provider?: string; subscription_plan?: string }> }).data ?? [];
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
  };
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

export async function listAdminUsers(options: {
  query?: string;
  status?: string;
  page?: number;
  limit?: number;
}): Promise<{ users: AdminUserRow[]; totalCount: number }> {
  const supabase = await createClient();
  const page = options.page || 1;
  const limit = options.limit || 25;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let q = supabase
    .from("profiles")
    .select("id, display_name, location, timezone, role, subscription_status, subscription_plan, subscription_provider, created_at", { count: "exact" });

  if (options.status && options.status !== "all") {
    if (options.status === "active") {
      q = q.in("subscription_status", ["active", "trialing"]);
    } else if (options.status === "free") {
      q = q.or("subscription_status.is.null,subscription_status.eq.incomplete,subscription_status.eq.canceled");
    }
  }

  if (options.query?.trim()) {
    const term = `%${options.query.trim()}%`;
    q = q.or(`display_name.ilike.${term},location.ilike.${term}`);
  }

  q = q.order("created_at", { ascending: false }).range(from, to);

  const { data: profiles, count, error } = await q;
  if (error || !profiles) {
    return { users: [], totalCount: 0 };
  }

  const userIds = profiles.map((p) => p.id);

  // Fetch garment & outfit counts for these users in batch
  const [garmentsRes, outfitsRes] = await Promise.all([
    supabase.from("wardrobe_items").select("user_id").in("user_id", userIds),
    supabase.from("outfits").select("user_id").in("user_id", userIds),
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
    email: null, // hydrated by admin viewer or email search
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
