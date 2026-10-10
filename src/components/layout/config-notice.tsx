import { Logo } from "@/components/layout/logo";
import { Alert } from "@/components/ui/card";

/** Shown instead of a crash when a required integration has not been configured yet. */
export function ConfigNotice({ integration, variables }: { integration: string; variables: string[] }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-6 px-4 py-12">
      <Logo />
      <Alert tone="warning" title={`${integration} isn't connected yet`}>
        <p>This part of ClosetAI needs configuration before it can run. Add these variables to <code>.env.local</code> and restart the dev server:</p>
        <ul className="mt-2 list-disc pl-5 font-mono text-xs">
          {variables.map((v) => (
            <li key={v}>{v}</li>
          ))}
        </ul>
        <p className="mt-2">The README walks through where to find each value.</p>
      </Alert>
    </div>
  );
}
