import { Logo } from "@/components/layout/logo";
import { Card } from "@/components/ui/card";

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center px-4 py-8 sm:py-14">
      <Logo />
      <main id="main" className="mt-8 w-full max-w-md">
        <Card className="p-6 sm:p-8">
          <h1 className="text-3xl">{title}</h1>
          {subtitle ? <p className="mt-2 text-muted">{subtitle}</p> : null}
          <div className="mt-6">{children}</div>
        </Card>
      </main>
    </div>
  );
}
