import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "You're offline",
};

export default function OfflineLayout({ children }: { children: React.ReactNode }) {
  return children;
}
