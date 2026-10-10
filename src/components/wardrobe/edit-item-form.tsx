"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { deleteItemAction, updateItemAction } from "@/app/(app)/wardrobe/actions";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import { ItemFieldsForm } from "@/components/wardrobe/item-fields";
import { itemFieldsSchema, type ItemFields, type ItemFieldsInput } from "@/lib/validation/wardrobe";

export function EditItemForm({ id, initial }: { id: string; initial: ItemFieldsInput }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const form = useForm<ItemFieldsInput, unknown, ItemFields>({ resolver: zodResolver(itemFieldsSchema), defaultValues: initial });

  const submit = form.handleSubmit((values) => {
    setMessage(null);
    startTransition(async () => {
      const result = await updateItemAction(id, values);
      if (result.ok) {
        setMessage({ tone: "success", text: "Changes saved." });
        form.reset(values as unknown as ItemFieldsInput);
        return;
      }
      setMessage({ tone: "danger", text: result.error });
      for (const [name, text] of Object.entries(result.fieldErrors ?? {})) form.setError(name as keyof ItemFieldsInput, { message: text });
    });
  });

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}
      <ItemFieldsForm form={form} idPrefix={`edit-${id}`} />
      <Button type="submit" loading={pending} disabled={!form.formState.isDirty && !pending}>
        Save changes
      </Button>
    </form>
  );
}

export function DeleteItemButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const remove = () =>
    startTransition(async () => {
      const result = await deleteItemAction(id);
      if (result.ok) {
        router.push("/wardrobe");
        router.refresh();
      } else {
        setError(result.error);
      }
    });

  if (!confirming) {
    return (
      <Button type="button" variant="outline" onClick={() => setConfirming(true)}>
        Delete this item
      </Button>
    );
  }

  return (
    <div role="alertdialog" aria-label={`Confirm deleting ${name}`} className="space-y-3 rounded-xl border border-danger/40 bg-danger-soft p-4">
      <p className="text-sm text-danger">
        Delete <strong>{name}</strong> and its photo? It will also be removed from any outfits it&apos;s in. This can&apos;t be undone.
      </p>
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      <div className="flex gap-2">
        <Button type="button" variant="danger" loading={pending} onClick={remove}>
          Yes, delete it
        </Button>
        <Button type="button" variant="outline" disabled={pending} onClick={() => setConfirming(false)}>
          Keep it
        </Button>
      </div>
    </div>
  );
}
