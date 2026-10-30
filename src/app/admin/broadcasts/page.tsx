import { AdminBroadcastClient } from "@/components/admin/admin-broadcast-client";

export const metadata = {
  title: "Broadcast Announcements · ClosetAI Admin",
};

export default async function AdminBroadcastsPage() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h1 className="font-serif text-2xl font-medium tracking-tight text-foreground">
          Feature Announcements & Broadcasts
        </h1>
        <p className="text-xs text-muted mt-1">
          Draft and send email updates to all registered users or targeted segments.
        </p>
      </div>

      <AdminBroadcastClient />
    </div>
  );
}
