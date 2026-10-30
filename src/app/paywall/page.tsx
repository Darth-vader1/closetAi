import { redirect } from "next/navigation";

export default async function PaywallPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string>>;
}) {
  const params = searchParams ? await searchParams : {};
  const qs = new URLSearchParams(params).toString();
  redirect(`/subscription${qs ? `?${qs}` : ""}`);
}
