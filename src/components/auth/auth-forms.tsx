"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useForm, type FieldValues, type Path } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import {
  requestPasswordResetAction,
  signInAction,
  signUpAction,
  updatePasswordAction,
} from "@/app/(auth)/actions";
import type { AuthActionResult } from "@/lib/auth/types";
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signUpSchema,
  type ForgotPasswordInput,
  type LoginInput,
  type ResetPasswordInput,
  type SignUpInput,
} from "@/lib/validation/auth";
import { Alert } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

/**
 * Shared submit wiring: runs the Server Action in a transition, maps server field errors back
 * onto the form, and exposes a top-level error or success message.
 */
function useAuthSubmit<T extends FieldValues>(
  run: (values: T) => Promise<AuthActionResult | void>,
  setFieldError: (name: Path<T>, message: string) => void,
) {
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const submit = (values: T) => {
    setFormError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        const result = await run(values);
        // Successful sign-in/up redirects on the server and never returns here.
        if (!result) return;
        if (result.ok) {
          setSuccess(result.message);
          return;
        }
        setFormError(result.error);
        for (const [name, message] of Object.entries(result.fieldErrors ?? {})) {
          setFieldError(name as Path<T>, message);
        }
      } catch {
        setFormError("We couldn't reach the server. Check your connection and try again.");
      }
    });
  };

  return { pending, formError, success, submit };
}

function FormMessages({ error, success }: { error: string | null; success: string | null }) {
  return (
    <>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {success ? <Alert tone="success">{success}</Alert> : null}
    </>
  );
}

function OtpFallbackPanel({
  email,
  type,
  next,
}: {
  email: string;
  type: "signup" | "recovery";
  next: string;
}) {
  const [secondsLeft, setSecondsLeft] = useState(60);
  const [manualOpen, setManualOpen] = useState(type === "recovery");
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = window.setInterval(() => {
      setSecondsLeft((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [secondsLeft]);

  const showPanel = secondsLeft === 0 || manualOpen;

  async function handleVerifyCode() {
    setOtpError(null);
    const cleaned = code.replace(/\D/g, "").slice(0, 10);
    if (cleaned.length < 6 || cleaned.length > 10) {
      setOtpError("Please enter the verification code from your email.");
      return;
    }

    setVerifying(true);
    try {
      const res = await fetch("/auth/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          token: cleaned,
          type,
          next,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        redirectTo?: string;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setOtpError(data.error || "Invalid or expired verification code.");
        return;
      }
      window.location.assign(data.redirectTo || next);
    } catch {
      setOtpError("Could not verify code. Check your connection and try again.");
    } finally {
      setVerifying(false);
    }
  }

  if (!showPanel) {
    return (
      <div className="rounded-xl border border-border bg-surface-muted/60 px-4 py-3 text-xs text-muted flex items-center justify-between gap-2">
        <span>Waiting for link click ({secondsLeft}s)…</span>
        <button
          type="button"
          onClick={() => setManualOpen(true)}
          className="font-medium text-accent underline underline-offset-4 cursor-pointer"
        >
          Have the verification code? Enter it now
        </button>
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label="Verification code"
      className="rounded-xl border border-border-strong bg-surface-muted/50 p-4 space-y-3"
    >
      <div>
        <p className="text-sm font-medium text-foreground">
          Didn&apos;t get the link? Enter the verification code instead
        </p>
        <p className="text-xs text-muted mt-0.5">
          Open the email sent to <span className="font-medium text-foreground">{email || "your inbox"}</span> (check Spam/Promotions too) and enter the 6–8 digit code below.
        </p>
      </div>
      {otpError ? <Alert tone="danger">{otpError}</Alert> : null}
      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          id={`otp-code-${type}`}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={10}
          placeholder="12345678"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 10))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleVerifyCode();
            }
          }}
          className="font-mono tracking-[0.25em] text-center text-base"
        />
        <Button
          type="button"
          onClick={() => void handleVerifyCode()}
          loading={verifying}
          className="shrink-0"
        >
          Verify code
        </Button>
      </div>
    </div>
  );
}

type AuthSchemaInput<S extends z.ZodType> = z.input<S> & FieldValues;

export function SignUpForm() {
  const form = useForm<AuthSchemaInput<typeof signUpSchema>, unknown, SignUpInput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { displayName: "", email: "", password: "", confirmPassword: "" },
  });
  const [submittedEmail, setSubmittedEmail] = useState("");
  const { errors } = form.formState;
  const { pending, formError, success, submit } = useAuthSubmit<SignUpInput>(
    (values) => {
      setSubmittedEmail(values.email);
      return signUpAction(values);
    },
    (name, message) => form.setError(name, { message }),
  );

  return (
    <form method="post" onSubmit={form.handleSubmit(submit)} className="space-y-5" noValidate>
      <FormMessages error={formError} success={success} />
      {success ? (
        <OtpFallbackPanel
          email={submittedEmail || form.getValues("email")}
          type="signup"
          next="/onboarding"
        />
      ) : null}
      <Field id="displayName" label="What should we call you?" error={errors.displayName?.message}>
        <Input id="displayName" autoComplete="given-name" aria-invalid={!!errors.displayName} {...form.register("displayName")} />
      </Field>
      <Field id="email" label="Email" error={errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" inputMode="email" aria-invalid={!!errors.email} {...form.register("email")} />
      </Field>
      <Field id="password" label="Password" hint="At least 8 characters." error={errors.password?.message}>
        <Input id="password" type="password" autoComplete="new-password" aria-invalid={!!errors.password} {...form.register("password")} />
      </Field>
      <Field id="confirmPassword" label="Confirm password" error={errors.confirmPassword?.message}>
        <Input id="confirmPassword" type="password" autoComplete="new-password" aria-invalid={!!errors.confirmPassword} {...form.register("confirmPassword")} />
      </Field>
      <Button type="submit" className="w-full" loading={pending}>
        Create account
      </Button>
      <p className="text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-accent underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </form>
  );
}

const REMEMBERED_EMAIL_KEY = "closetai_remembered_email";

export function LoginForm({ next, notice }: { next?: string; notice?: string | null }) {
  const form = useForm<AuthSchemaInput<typeof loginSchema>, unknown, LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "", rememberMe: true },
  });

  useEffect(() => {
    try {
      const savedEmail = window.localStorage.getItem(REMEMBERED_EMAIL_KEY);
      if (savedEmail && !form.getValues("email")) {
        form.setValue("email", savedEmail);
      }
    } catch {
      // Ignore storage errors
    }
  }, [form]);
  const { errors } = form.formState;
  const { pending, formError, success, submit } = useAuthSubmit<LoginInput>(
    (values) => {
      try {
        if (values.rememberMe) {
          window.localStorage.setItem(REMEMBERED_EMAIL_KEY, values.email);
        } else {
          window.localStorage.removeItem(REMEMBERED_EMAIL_KEY);
        }
      } catch {
        // Ignore storage errors in private browsing mode
      }
      return signInAction(values, next);
    },
    (name, message) => form.setError(name, { message }),
  );

  return (
    <form method="post" onSubmit={form.handleSubmit(submit)} className="space-y-5" noValidate>
      {notice ? <Alert tone="warning">{notice}</Alert> : null}
      <FormMessages error={formError} success={success} />
      <Field id="email" label="Email" error={errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" inputMode="email" aria-invalid={!!errors.email} {...form.register("email")} />
      </Field>
      <Field id="password" label="Password" error={errors.password?.message}>
        <Input id="password" type="password" autoComplete="current-password" aria-invalid={!!errors.password} {...form.register("password")} />
      </Field>
      <div className="flex items-center justify-between gap-2 text-sm">
        <label htmlFor="rememberMe" className="inline-flex items-center gap-2 cursor-pointer select-none text-foreground">
          <input
            id="rememberMe"
            type="checkbox"
            className="h-4 w-4 rounded border-border-strong text-accent focus:ring-accent accent-accent cursor-pointer"
            {...form.register("rememberMe")}
          />
          <span>Remember me</span>
        </label>
        <Link href="/forgot-password" className="text-accent underline underline-offset-4">
          Forgot your password?
        </Link>
      </div>
      <Button type="submit" className="w-full" loading={pending}>
        Sign in
      </Button>
      <p className="text-center text-sm text-muted">
        New to ClosetAI?{" "}
        <Link href="/signup" className="font-medium text-accent underline underline-offset-4">
          Create an account
        </Link>
      </p>
    </form>
  );
}

export function ForgotPasswordForm() {
  const form = useForm<AuthSchemaInput<typeof forgotPasswordSchema>, unknown, ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });
  const [submittedEmail, setSubmittedEmail] = useState("");
  const { errors } = form.formState;
  const { pending, formError, success, submit } = useAuthSubmit<ForgotPasswordInput>(
    (values) => {
      setSubmittedEmail(values.email);
      return requestPasswordResetAction(values);
    },
    (name, message) => form.setError(name, { message }),
  );

  return (
    <form method="post" onSubmit={form.handleSubmit(submit)} className="space-y-5" noValidate>
      <FormMessages error={formError} success={success} />
      {success ? (
        <OtpFallbackPanel
          email={submittedEmail || form.getValues("email")}
          type="recovery"
          next="/reset-password"
        />
      ) : null}
      <Field id="email" label="Email" error={errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" inputMode="email" aria-invalid={!!errors.email} {...form.register("email")} />
      </Field>
      <Button type="submit" variant={success ? "outline" : "primary"} className="w-full" loading={pending}>
        {success ? "Resend reset email" : "Send reset link"}
      </Button>
      <p className="text-center text-sm text-muted">
        <Link href="/login" className="font-medium text-accent underline underline-offset-4">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}

export function ResetPasswordForm() {
  const form = useForm<AuthSchemaInput<typeof resetPasswordSchema>, unknown, ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });
  const { errors } = form.formState;
  const { pending, formError, success, submit } = useAuthSubmit<ResetPasswordInput>(
    (values) => updatePasswordAction(values),
    (name, message) => form.setError(name, { message }),
  );

  return (
    <form method="post" onSubmit={form.handleSubmit(submit)} className="space-y-5" noValidate>
      <FormMessages error={formError} success={success} />
      <Field id="password" label="New password" hint="At least 8 characters." error={errors.password?.message}>
        <Input id="password" type="password" autoComplete="new-password" aria-invalid={!!errors.password} {...form.register("password")} />
      </Field>
      <Field id="confirmPassword" label="Confirm new password" error={errors.confirmPassword?.message}>
        <Input id="confirmPassword" type="password" autoComplete="new-password" aria-invalid={!!errors.confirmPassword} {...form.register("confirmPassword")} />
      </Field>
      <Button type="submit" className="w-full" loading={pending}>
        Update password
      </Button>
    </form>
  );
}
