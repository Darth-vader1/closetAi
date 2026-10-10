import * as React from "react";
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-[1.25rem] border border-border bg-surface p-6", className)} {...props} />;
}

type AlertTone = "info" | "success" | "warning" | "danger";

const alertStyles: Record<AlertTone, { box: string; Icon: typeof Info }> = {
  info: { box: "bg-surface-muted text-foreground", Icon: Info },
  success: { box: "bg-success-soft text-success", Icon: CheckCircle2 },
  warning: { box: "bg-warning-soft text-warning", Icon: TriangleAlert },
  danger: { box: "bg-danger-soft text-danger", Icon: AlertCircle },
};

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: AlertTone;
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const { box, Icon } = alertStyles[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex gap-3 rounded-xl p-4 text-sm", box, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="space-y-1">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div className="leading-relaxed">{children}</div> : null}
      </div>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-[1.25rem] border border-dashed border-border-strong bg-surface/60 px-6 py-12 text-center">
      <span className="mb-4 grid size-12 place-items-center rounded-full bg-accent-soft text-accent">
        <Icon className="size-5" />
      </span>
      <h2 className="text-xl">{title}</h2>
      {children ? <p className="mt-2 max-w-md text-muted">{children}</p> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
