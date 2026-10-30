import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { takeAiQuota } from "@/lib/ai/rate-limit";
import { getAiProvider } from "@/lib/ai/service";
import { generateStylistChatReply } from "@/lib/ai/stylist-chat";
import { getProfile, getSessionUser } from "@/lib/auth/session";
import { assertActiveSubscription } from "@/lib/billing/entitlements";
import {
  listShareableWardrobeAndOutfits,
  type SharedItemCardData,
  type SharedOutfitCardData,
} from "@/lib/connect/queries";
import type {
  StylistChatMessage,
  StylistProposedOutfitCard,
} from "@/lib/connect/stylist-chat-queries";
import { logger } from "@/lib/logger";
import { isSameOrigin } from "@/lib/security/origin";
import { createClient } from "@/lib/supabase/server";

const historyTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  body: z.string().max(4000),
  attachedItemNames: z.array(z.string().max(160)).max(8).optional(),
  attachedOutfitNames: z.array(z.string().max(160)).max(4).optional(),
});

const chatRequestSchema = z.object({
  message: z.string().trim().max(2000).optional().default(""),
  itemIds: z.array(z.string().uuid()).max(8).optional().default([]),
  outfitIds: z.array(z.string().uuid()).max(4).optional().default([]),
  history: z.array(historyTurnSchema).max(20).optional().default([]),
  weather: z.string().trim().max(500).optional(),
});

const json = (body: Record<string, unknown>, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request.headers)) {
    return json({ error: "Cross-site requests aren't allowed." }, 403);
  }

  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Please sign in again." }, 401);

    const subCheck = await assertActiveSubscription(user.id);
    if (!subCheck.active) {
      return json({ error: subCheck.error, subscriptionRequired: true }, 403);
    }

    const rawBody = await request.json().catch(() => null);
    const parsed = chatRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return json(
        { error: parsed.error.issues[0]?.message || "Invalid chat message." },
        400,
      );
    }

    const uniqueItemIds = [...new Set(parsed.data.itemIds)];
    const uniqueOutfitIds = [...new Set(parsed.data.outfitIds)];
    const trimmedMessage = parsed.data.message.trim();

    if (!trimmedMessage && uniqueItemIds.length === 0 && uniqueOutfitIds.length === 0) {
      return json(
        { error: "Type a message or attach a clothing item or outfit first." },
        400,
      );
    }

    const availability = getAiProvider();
    if (!availability.available) {
      return json({ status: "unavailable", reason: availability.reason }, 503);
    }

    const supabase = await createClient();

    // Check rate limit quota using the dedicated CHAT bucket (60/hr)
    const quota = await takeAiQuota(supabase, user.id, "CHAT");
    if (!quota.allowed) {
      return json(
        {
          error:
            "You've reached the hourly chat limit with @ClosetAI Stylist. Please try again in a bit.",
        },
        429,
      );
    }

    const [profile, shareable, statusRowsRes] = await Promise.all([
      getProfile(),
      listShareableWardrobeAndOutfits(supabase, user.id),
      supabase
        .from("wardrobe_items")
        .select("id, status, warmth_level")
        .eq("user_id", user.id)
        .limit(200),
    ]);

    const statusMap = new Map<string, { status: string; warmthLevel: number | null }>();
    for (const row of statusRowsRes.data ?? []) {
      statusMap.set(row.id as string, {
        status: (row.status as string) ?? "CLEAN",
        warmthLevel: (row.warmth_level as number | null) ?? null,
      });
    }

    const itemMap = new Map<string, SharedItemCardData>(
      shareable.items.map((it) => [it.id, it]),
    );
    const outfitMap = new Map<string, SharedOutfitCardData>(
      shareable.outfits.map((o) => [o.id, o]),
    );

    const attachedItems = uniqueItemIds
      .map((id) => itemMap.get(id))
      .filter((x): x is SharedItemCardData => Boolean(x));

    const attachedOutfits = uniqueOutfitIds
      .map((id) => outfitMap.get(id))
      .filter((x): x is SharedOutfitCardData => Boolean(x));

    // Construct default message if user shared clothes/outfits without typing a note
    const effectiveUserBody =
      trimmedMessage ||
      (attachedOutfits.length > 0 && attachedItems.length > 0
        ? "What do you think of these pieces and saved outfits? How should I style them?"
        : attachedOutfits.length > 0
          ? attachedOutfits.length === 1
            ? `What do you think of my "${attachedOutfits[0].name}" outfit? How can I style or elevate it?`
            : "Which of these saved outfits works best, and how would you style them?"
          : attachedItems.length === 1
            ? `How can I style my ${attachedItems[0].name} using pieces from my closet?`
            : "How can I style these pieces from my closet together or into outfits?");

    // Persist user message to DB (if migration is applied)
    let savedUserMsgId: string = crypto.randomUUID();
    let savedUserCreatedAt: string = new Date().toISOString();
    try {
      const { data: insertedUser } = await supabase
        .from("stylist_chat_messages")
        .insert({
          user_id: user.id,
          role: "user",
          body: effectiveUserBody,
          attached_item_ids: attachedItems.map((i) => i.id),
          attached_outfit_ids: attachedOutfits.map((o) => o.id),
        })
        .select("id, created_at")
        .single();

      if (insertedUser) {
        savedUserMsgId = insertedUser.id as string;
        savedUserCreatedAt = insertedUser.created_at as string;
      }
    } catch {
      // Table may not be migrated yet; continue seamlessly
    }

    const stylePreferences = Array.isArray(profile?.preferred_style)
      ? [...profile.preferred_style]
      : typeof profile?.preferred_style === "string"
        ? [profile.preferred_style]
        : [];

    const inventory = shareable.items.map((item) => {
      const extra = statusMap.get(item.id);
      return {
        id: item.id,
        name: item.name,
        category: item.category,
        subcategory: item.subcategory,
        primaryColour: item.primaryColour,
        secondaryColours: item.secondaryColours,
        pattern: item.pattern,
        material: item.material,
        style: item.style,
        occasions: item.occasions,
        warmthLevel: extra?.warmthLevel ?? null,
        status: extra?.status ?? "CLEAN",
      };
    });

    const sharedItemsContext = attachedItems.map((item) => {
      const extra = statusMap.get(item.id);
      return {
        id: item.id,
        name: item.name,
        category: item.category,
        subcategory: item.subcategory,
        primaryColour: item.primaryColour,
        secondaryColours: item.secondaryColours,
        pattern: item.pattern,
        material: item.material,
        style: item.style,
        occasions: item.occasions,
        warmthLevel: extra?.warmthLevel ?? null,
        status: extra?.status ?? "CLEAN",
      };
    });

    const sharedOutfitsContext = attachedOutfits.map((o) => ({
      id: o.id,
      name: o.name,
      occasion: o.occasion,
      styleDescription: o.styleDescription,
      stylingTip: o.stylingTip,
      items: o.items.map((it) => ({
        id: it.id,
        name: it.name,
        category: it.category,
        primaryColour: it.primaryColour,
      })),
    }));

    const aiResult = await generateStylistChatReply(
      {
        userMessage: effectiveUserBody,
        history: parsed.data.history,
        sharedItems: sharedItemsContext,
        sharedOutfits: sharedOutfitsContext,
        inventory,
        weather: parsed.data.weather || null,
        stylePreferences,
        gender: profile?.gender ?? null,
      },
      { provider: availability.provider, signal: request.signal },
    );

    if (aiResult.status !== "ok") {
      return json(
        {
          error:
            aiResult.status === "unavailable"
              ? aiResult.reason
              : aiResult.message,
        },
        502,
      );
    }

    const referencedIds = aiResult.data.referenced_item_ids ?? [];
    const referencedItems = referencedIds
      .map((id) => itemMap.get(id))
      .filter((x): x is SharedItemCardData => Boolean(x));

    const proposedOutfits: StylistProposedOutfitCard[] = (
      aiResult.data.proposed_outfits ?? []
    )
      .map((po) => {
        const items = po.item_ids
          .map((id) => itemMap.get(id))
          .filter((x): x is SharedItemCardData => Boolean(x));
        return {
          name: po.name,
          occasion: po.occasion,
          styleDescription: po.style_description,
          explanation: po.explanation,
          stylingTip: po.styling_tip,
          items,
        };
      })
      .filter((po) => po.items.length > 0);

    const quickReplies = aiResult.data.quick_replies ?? [];

    // Persist assistant reply to DB (if migration is applied)
    let savedAssistantMsgId: string = crypto.randomUUID();
    let savedAssistantCreatedAt: string = new Date().toISOString();
    try {
      const { data: insertedAssistant } = await supabase
        .from("stylist_chat_messages")
        .insert({
          user_id: user.id,
          role: "assistant",
          body: aiResult.data.reply,
          referenced_item_ids: referencedItems.map((i) => i.id),
          proposed_outfits: aiResult.data.proposed_outfits ?? [],
          quick_replies: quickReplies,
        })
        .select("id, created_at")
        .single();

      if (insertedAssistant) {
        savedAssistantMsgId = insertedAssistant.id as string;
        savedAssistantCreatedAt = insertedAssistant.created_at as string;
      }
    } catch {
      // Table may not be migrated yet; continue seamlessly
    }

    const userMessage: StylistChatMessage = {
      id: savedUserMsgId,
      role: "user",
      body: effectiveUserBody,
      createdAt: savedUserCreatedAt,
      attachedItems,
      attachedOutfits,
      referencedItems: [],
      proposedOutfits: [],
      quickReplies: [],
    };

    const assistantMessage: StylistChatMessage = {
      id: savedAssistantMsgId,
      role: "assistant",
      body: aiResult.data.reply,
      createdAt: savedAssistantCreatedAt,
      attachedItems: [],
      attachedOutfits: [],
      referencedItems,
      proposedOutfits,
      quickReplies,
    };

    return json({
      status: "ok",
      userMessage,
      assistantMessage,
      provider: aiResult.provider,
    });
  } catch (err) {
    logger.error("stylist_chat.api_error", { err });
    return json(
      { error: "Something went wrong while chatting with @ClosetAI Stylist." },
      500,
    );
  }
}

export async function DELETE(request: NextRequest) {
  if (!isSameOrigin(request.headers)) {
    return json({ error: "Cross-site requests aren't allowed." }, 403);
  }

  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Please sign in again." }, 401);

    const subCheck = await assertActiveSubscription(user.id);
    if (!subCheck.active) {
      return json({ error: subCheck.error, subscriptionRequired: true }, 403);
    }

    const supabase = await createClient();
    await supabase
      .from("stylist_chat_messages")
      .delete()
      .eq("user_id", user.id);

    return json({ ok: true });
  } catch {
    return json({ ok: true });
  }
}
