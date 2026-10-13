"use client";

import { Controller, type UseFormReturn } from "react-hook-form";
import { Chip, toggleValue } from "@/components/ui/chip";
import { Field, Input, Select } from "@/components/ui/input";
import { OCCASION_OPTIONS, STYLE_OPTIONS } from "@/lib/profile/options";
import { optionalIntFromSelect, optionalStringFromSelect, type ItemFields, type ItemFieldsInput } from "@/lib/validation/wardrobe";
import { CATEGORIES, humanise, PATTERNS, SEASONS, WARDROBE_COLOURS, WARMTH_LEVELS, categoryDefaultCareType, careTypeLabel, careTypeDescription } from "@/lib/wardrobe/categories";

export type ItemForm = UseFormReturn<ItemFieldsInput, unknown, ItemFields>;

/** The editable attributes of one garment. Shared by the upload review step and the edit page. */
export function ItemFieldsForm({ form, idPrefix, highlight = [] }: { form: ItemForm; idPrefix: string; highlight?: string[] }) {
  const { errors } = form.formState;
  const id = (name: string) => `${idPrefix}-${name}`;
  const uncertain = (name: string) => (highlight.includes(name) ? "Check this one: the AI wasn't sure." : undefined);
  
  // Watch category changes to auto-update care type
  const selectedCategory = form.watch("category");
  const currentCareType = form.watch("careType");
  
  // Auto-suggest care type based on category
  const suggestedCareType = selectedCategory ? categoryDefaultCareType(selectedCategory) : "WASHABLE";
  
  // Show hint if suggested care type differs from current
  const careTypeHint = currentCareType !== suggestedCareType 
    ? `Default for ${CATEGORIES.find(c => c.value === selectedCategory)?.label ?? selectedCategory}: ${careTypeLabel(suggestedCareType)}`
    : careTypeDescription(currentCareType);

  return (
    <div className="space-y-5">
      <Field id={id("name")} label="Name" error={errors.name?.message}>
        <Input id={id("name")} aria-invalid={!!errors.name} {...form.register("name")} />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id={id("category")} label="Category" error={errors.category?.message} hint={uncertain("category")}>
          <Select id={id("category")} aria-invalid={!!errors.category} {...form.register("category")}>
            <option value="" disabled>Choose…</option>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </Select>
        </Field>
        <Field id={id("careType")} label="Care Type" hint={uncertain("care_type") ?? careTypeHint} error={errors.careType?.message}>
          <Select id={id("careType")} aria-invalid={!!errors.careType} {...form.register("careType")}>
            <option value="WASHABLE">{careTypeLabel("WASHABLE")}</option>
            <option value="WIPE_CLEAN">{careTypeLabel("WIPE_CLEAN")}</option>
            <option value="NO_WASH">{careTypeLabel("NO_WASH")}</option>
          </Select>
        </Field>
        <Field id={id("subcategory")} label="Subcategory" hint={uncertain("subcategory") ?? "Optional, e.g. crew neck."} error={errors.subcategory?.message}>
          <Input id={id("subcategory")} {...form.register("subcategory")} />
        </Field>
        <Field id={id("primaryColour")} label="Main colour" hint={uncertain("primary_colour")} error={errors.primaryColour?.message}>
          <Select id={id("primaryColour")} {...form.register("primaryColour", { setValueAs: optionalStringFromSelect })}>
            <option value="">Not sure</option>
            {WARDROBE_COLOURS.map((c) => (
              <option key={c} value={c}>{humanise(c)}</option>
            ))}
          </Select>
        </Field>
        <Field id={id("pattern")} label="Pattern" hint={uncertain("pattern")} error={errors.pattern?.message}>
          <Select id={id("pattern")} {...form.register("pattern", { setValueAs: optionalStringFromSelect })}>
            <option value="">Not sure</option>
            {PATTERNS.map((p) => (
              <option key={p} value={p}>{humanise(p)}</option>
            ))}
          </Select>
        </Field>
        <Field id={id("style")} label="Style" hint={uncertain("style")} error={errors.style?.message}>
          <Select id={id("style")} {...form.register("style", { setValueAs: optionalStringFromSelect })}>
            <option value="">Not sure</option>
            {STYLE_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </Select>
        </Field>
        <Field id={id("warmthLevel")} label="Warmth" hint="Optional." error={errors.warmthLevel?.message}>
          <Select id={id("warmthLevel")} {...form.register("warmthLevel", { setValueAs: optionalIntFromSelect })}>
            <option value="">Not sure</option>
            {WARMTH_LEVELS.map((w) => (
              <option key={w.value} value={w.value}>{w.label}</option>
            ))}
          </Select>
        </Field>
      </div>

      <Field id={id("material")} label="Material" hint="e.g. cotton, denim, wool, linen, polyester, silk." error={errors.material?.message}>
        <Input id={id("material")} aria-invalid={!!errors.material} {...form.register("material")} />
      </Field>

      <ChipGroup
        legend="Other colours"
        hint={uncertain("secondary_colours")}
        error={errors.secondaryColours?.message}
        render={() => (
          <Controller
            control={form.control}
            name="secondaryColours"
            render={({ field }) => (
              <>
                {WARDROBE_COLOURS.map((c) => (
                  <Chip key={c} selected={field.value.includes(c)} onToggle={() => field.onChange(toggleValue(field.value, c))}>
                    {humanise(c)}
                  </Chip>
                ))}
              </>
            )}
          />
        )}
      />

      <ChipGroup
        legend="Good for"
        hint={uncertain("occasions")}
        render={() => (
          <Controller
            control={form.control}
            name="occasions"
            render={({ field }) => (
              <>
                {OCCASION_OPTIONS.map((o) => (
                  <Chip key={o.value} selected={field.value.includes(o.value)} onToggle={() => field.onChange(toggleValue(field.value, o.value))}>
                    {o.label}
                  </Chip>
                ))}
              </>
            )}
          />
        )}
      />

      <ChipGroup
        legend="Seasons"
        hint={uncertain("seasons")}
        render={() => (
          <Controller
            control={form.control}
            name="seasons"
            render={({ field }) => (
              <>
                {SEASONS.map((s) => (
                  <Chip key={s} selected={field.value.includes(s)} onToggle={() => field.onChange(toggleValue(field.value, s))}>
                    {humanise(s)}
                  </Chip>
                ))}
              </>
            )}
          />
        )}
      />

      <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
        <input type="checkbox" className="size-5 accent-[var(--accent)]" {...form.register("isFavourite")} />
        Mark as a favourite
      </label>
    </div>
  );
}

function ChipGroup({ legend, hint, error, render }: { legend: string; hint?: string; error?: string; render: () => React.ReactNode }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-2">{render()}</div>
      {hint ? <p className="text-sm text-muted">{hint}</p> : null}
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
    </fieldset>
  );
}

export function emptyItemValues(): ItemFieldsInput {
  return {
    name: "",
    category: "" as ItemFieldsInput["category"],
    subcategory: "",
    careType: "WASHABLE",
    primaryColour: null,
    secondaryColours: [],
    pattern: null,
    material: "",
    style: null,
    occasions: [],
    seasons: [],
    warmthLevel: null,
    isFavourite: false,
  };
}
