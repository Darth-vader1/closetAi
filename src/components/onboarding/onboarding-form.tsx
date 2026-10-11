"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { completeOnboardingAction, skipOnboardingAction } from "@/app/onboarding/actions";
import { Button } from "@/components/ui/button";
import { Chip, toggleValue as toggle } from "@/components/ui/chip";
import { Alert } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { COLOUR_OPTIONS, OCCASION_OPTIONS, STYLE_OPTIONS, WEEKDAYS } from "@/lib/profile/options";
import { listTimeZones } from "@/lib/scheduling/timezone";
import { optionalStringFromSelect } from "@/lib/validation/wardrobe";
import { onboardingSchema, type OnboardingData, type OnboardingInput } from "@/lib/validation/onboarding";

// Browser-only list of timezones, read through useSyncExternalStore so server and client markup agree
// during hydration (the server snapshot is empty, then React switches to the real list).
const noopSubscribe = () => () => {};
const NO_ZONES: string[] = [];
let cachedZones: string[] | null = null;
const getClientZones = () => (cachedZones ??= listTimeZones());
const getServerZones = () => NO_ZONES;

export function OnboardingForm({ initialName }: { initialName: string }) {
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const zones = useSyncExternalStore(noopSubscribe, getClientZones, getServerZones);

  const form = useForm<OnboardingInput, unknown, OnboardingData>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      displayName: initialName,
      preferredStyles: [],
      favouriteColours: [],
      commonOccasions: [],
      location: "",
      timezone: "UTC",
      dailyEnabled: false,
      dailyTime: "07:00",
      weeklyEnabled: false,
      weeklyDay: 0,
      weeklyTime: "18:00",
    },
  });
  const { errors } = form.formState;
  const dailyEnabled = useWatch({ control: form.control, name: "dailyEnabled" });
  const weeklyEnabled = useWatch({ control: form.control, name: "weeklyEnabled" });

  // The timezone is only a starting suggestion, taken from the browser. The user can change it.
  useEffect(() => {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (detected && getClientZones().includes(detected)) form.setValue("timezone", detected);
  }, [form]);

  const run = (action: () => Promise<{ ok: boolean; error?: string; fieldErrors?: Record<string, string> } | void>) => {
    setFormError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (result && !result.ok) {
          setFormError(result.error ?? "Something went wrong.");
          for (const [name, message] of Object.entries(result.fieldErrors ?? {})) {
            form.setError(name as keyof OnboardingInput, { message });
          }
        }
      } catch {
        setFormError("We couldn't reach the server. Check your connection and try again.");
      }
    });
  };

  return (
    <form method="post" onSubmit={form.handleSubmit((values) => run(() => completeOnboardingAction(values)))} className="space-y-8" noValidate>
      {formError ? <Alert tone="danger">{formError}</Alert> : null}

      <section className="space-y-5" aria-labelledby="about-heading">
        <h2 id="about-heading" className="text-2xl">About you</h2>
        <Field id="displayName" label="Display name" error={errors.displayName?.message}>
          <Input id="displayName" autoComplete="given-name" aria-invalid={!!errors.displayName} {...form.register("displayName")} />
        </Field>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Preferred styles <span className="font-normal text-muted">(optional)</span></legend>
          <p className="text-xs text-muted">Pick any styles that represent you. Helps rank outfit ideas.</p>
          <Controller
            control={form.control}
            name="preferredStyles"
            render={({ field }) => (
              <div className="flex flex-wrap gap-2">
                {STYLE_OPTIONS.map((s) => (
                  <Chip
                    key={s.value}
                    selected={field.value.includes(s.value)}
                    onToggle={() => field.onChange(toggle(field.value, s.value))}
                  >
                    {s.label}
                  </Chip>
                ))}
              </div>
            )}
          />
          {errors.preferredStyles?.message ? <p role="alert" className="text-sm text-danger">{errors.preferredStyles.message}</p> : null}
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Favourite colours <span className="font-normal text-muted">(optional)</span></legend>
          <Controller
            control={form.control}
            name="favouriteColours"
            render={({ field }) => (
              <div className="flex flex-wrap gap-2">
                {COLOUR_OPTIONS.map((c) => (
                  <Chip key={c} selected={field.value.includes(c)} onToggle={() => field.onChange(toggle(field.value, c))}>
                    {c[0].toUpperCase() + c.slice(1)}
                  </Chip>
                ))}
              </div>
            )}
          />
          {errors.favouriteColours?.message ? <p role="alert" className="text-sm text-danger">{errors.favouriteColours.message}</p> : null}
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">What do you usually dress for? <span className="font-normal text-muted">(optional)</span></legend>
          <Controller
            control={form.control}
            name="commonOccasions"
            render={({ field }) => (
              <div className="flex flex-wrap gap-2">
                {OCCASION_OPTIONS.map((o) => (
                  <Chip key={o.value} selected={field.value.includes(o.value)} onToggle={() => field.onChange(toggle(field.value, o.value))}>
                    {o.label}
                  </Chip>
                ))}
              </div>
            )}
          />
        </fieldset>

        <Field id="location" label="Location" hint="Optional. A city or area, for example Lagos." error={errors.location?.message}>
          <Input id="location" autoComplete="address-level2" {...form.register("location")} />
        </Field>
      </section>

      <section className="space-y-5" aria-labelledby="email-heading">
        <div>
          <h2 id="email-heading" className="text-2xl">Email</h2>
          <p className="mt-1 text-muted">Both emails are off unless you turn them on. You can change this any time.</p>
        </div>

        <Field id="timezone" label="Your timezone" hint="Emails are sent at your local time." error={errors.timezone?.message}>
          <Select id="timezone" {...form.register("timezone")}>
            {(zones.length ? zones : [form.getValues("timezone")]).map((z) => (
              <option key={z} value={z}>{z.replaceAll("_", " ")}</option>
            ))}
          </Select>
        </Field>

        <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
          <label className="flex min-h-11 items-center gap-3 font-medium">
            <input type="checkbox" className="size-5 accent-[var(--accent)]" {...form.register("dailyEnabled")} />
            Send me a daily outfit email
          </label>
          {dailyEnabled ? (
            <Field id="dailyTime" label="Deliver at" error={errors.dailyTime?.message}>
              <Input id="dailyTime" type="time" className="max-w-40" {...form.register("dailyTime")} />
            </Field>
          ) : null}
        </div>

        <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
          <label className="flex min-h-11 items-center gap-3 font-medium">
            <input type="checkbox" className="size-5 accent-[var(--accent)]" {...form.register("weeklyEnabled")} />
            Send me a weekly wardrobe and laundry summary
          </label>
          {weeklyEnabled ? (
            <div className="flex flex-wrap gap-4">
              <Field id="weeklyDay" label="Day" error={errors.weeklyDay?.message}>
                <Select id="weeklyDay" className="min-w-40" {...form.register("weeklyDay", { valueAsNumber: true })}>
                  {WEEKDAYS.map((d, i) => (
                    <option key={d} value={i}>{d}</option>
                  ))}
                </Select>
              </Field>
              <Field id="weeklyTime" label="Deliver at" error={errors.weeklyTime?.message}>
                <Input id="weeklyTime" type="time" className="max-w-40" {...form.register("weeklyTime")} />
              </Field>
            </div>
          ) : null}
        </div>
      </section>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <Button type="button" variant="ghost" disabled={pending} onClick={() => run(() => skipOnboardingAction())}>
          Skip for now
        </Button>
        <Button type="submit" size="lg" loading={pending}>
          Finish setup
        </Button>
      </div>
    </form>
  );
}
