"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NewConversationDialog } from "@/components/connect/new-conversation-dialog";

interface Props {
  label?: string;
}

export function NewConversationButton({ label = "New conversation" }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm">
        <UserPlus className="size-4" aria-hidden />
        {label}
      </Button>
      {open && <NewConversationDialog onClose={() => setOpen(false)} />}
    </>
  );
}
