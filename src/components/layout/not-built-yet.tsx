import { Hammer } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/card";

/** Honest stand-in for a section scheduled for a later build phase. No fake data, no dead controls. */
export function NotBuiltYet({
  title,
  description,
  phase,
  children,
}: {
  title: string;
  description: string;
  phase: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <EmptyState icon={Hammer} title={`Coming in ${phase}`}>
        {children}
      </EmptyState>
    </>
  );
}
