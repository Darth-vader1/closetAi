"use client";

import { useState, useTransition } from "react";
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

type AuthSchemaInput<S extends z.ZodType> = z.input<S> & FieldValues;

export function SignUpForm() {
  const form = useForm<AuthSchemaInput<typeof signUpSchema>, unknown, SignUpInput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { displayName: "", email: "", password: "", confirmPassword: "" },
  });
  const { errors } = form.formState;
  const { pending, formError, success, submit } = useAuthSubmit<SignUpInput>(
    (values) => signUpAction(values),
    (name, message) => form.setError(name, { message }),
  );

  return (
    <form onSubmit={form.handleSubmit(submit)} className="space-y-5" noValidate>
      <FormMessages error={formError} success={success} />
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

export function LoginForm({ next, notice }: { next?: string; notice?: string | null }) {
  const form = useForm<AuthSchemaInput<typeof loginSchema>, unknown, LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });
  const { errors } = form.formState;
  const { pending, formError, success, submit } = useAuthSubmit<LoginInput>(
    (values) => signInAction(values, next),
    (name, message) => form.setError(name, { message }),
  );

  return (
    <form onSubmit={form.handleSubmit(submit)} className="space-y-5" noValidate>
      {notice ? <Alert tone="warning">{notice}</Alert> : null}
      <FormMessages error={formError} success={success} />
      <Field id="email" label="Email" error={errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" inputMode="email" aria-invalid={!!errors.email} {...form.register("email")} />
      </Field>
      <Field id="password" label="Password" error={errors.password?.message}>
        <Input id="password" type="password" autoComplete="current-password" aria-invalid={!!errors.password} {...form.register("password")} />
      </Field>
      <div className="text-right text-sm">
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
  const { errors } = form.formState;
  const { pending, formError, success, submit } = useAuthSubmit<ForgotPasswordInput>(
    (values) => requestPasswordResetAction(values),
    (name, message) => form.setError(name, { message }),
  );

  return (
    <form onSubmit={form.handleSubmit(submit)} className="space-y-5" noValidate>
      <FormMessages error={formError} success={success} />
      <Field id="email" label="Email" error={errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" inputMode="email" aria-invalid={!!errors.email} {...form.register("email")} />
      </Field>
      <Button type="submit" className="w-full" loading={pending}>
        Send reset link
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
    <form onSubmit={form.handleSubmit(submit)} className="space-y-5" noValidate>
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
