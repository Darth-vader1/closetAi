import { describe, expect, it } from "vitest";
import {
  OUTFIT_TIME_OF_DAY_SLOTS,
  compareTimeOfDaySlots,
  getDayPlansBySlot,
  normalizeOutfitTimeOfDay,
  upsertCalendarSlotPlan,
  type CalendarSlotItemLike,
} from "@/lib/outfits/calendar-slots";

describe("calendar-slots multi-slot helpers", () => {
  it("normalizes time_of_day values with MORNING as safe default", () => {
    expect(normalizeOutfitTimeOfDay(undefined)).toBe("MORNING");
    expect(normalizeOutfitTimeOfDay(null)).toBe("MORNING");
    expect(normalizeOutfitTimeOfDay("")).toBe("MORNING");
    expect(normalizeOutfitTimeOfDay("morning")).toBe("MORNING");
    expect(normalizeOutfitTimeOfDay("AFTERNOON")).toBe("AFTERNOON");
    expect(normalizeOutfitTimeOfDay(" evening ")).toBe("EVENING");
    expect(normalizeOutfitTimeOfDay("invalid")).toBe("MORNING");
  });

  it("orders slots strictly as MORNING -> AFTERNOON -> EVENING", () => {
    const shuffled = ["EVENING", "MORNING", "AFTERNOON"];
    shuffled.sort(compareTimeOfDaySlots);
    expect(shuffled).toEqual([...OUTFIT_TIME_OF_DAY_SLOTS]);
  });

  it("groups day plans into MORNING, AFTERNOON, and EVENING slots and counts worn entries", () => {
    const samplePlans: CalendarSlotItemLike[] = [
      {
        id: "plan-eve",
        plannedFor: "2026-11-07",
        timeOfDay: "EVENING",
        status: "WORN",
      },
      {
        id: "plan-am",
        plannedFor: "2026-11-07",
        timeOfDay: "MORNING",
        status: "WORN",
      },
      {
        id: "plan-pm",
        plannedFor: "2026-11-07",
        timeOfDay: "AFTERNOON",
        status: "PLANNED",
      },
      {
        id: "plan-other-day",
        plannedFor: "2026-11-08",
        timeOfDay: "MORNING",
        status: "PLANNED",
      },
    ];

    const grouped = getDayPlansBySlot(samplePlans, "2026-11-07");
    expect(grouped.MORNING?.id).toBe("plan-am");
    expect(grouped.AFTERNOON?.id).toBe("plan-pm");
    expect(grouped.EVENING?.id).toBe("plan-eve");
    expect(grouped.ordered.map((p) => p.id)).toEqual([
      "plan-am",
      "plan-pm",
      "plan-eve",
    ]);
    expect(grouped.plannedCount).toBe(3);
    expect(grouped.wornCount).toBe(2);
  });

  it("upserts a specific time_of_day slot without clobbering other slots on the same date", () => {
    const initial: CalendarSlotItemLike[] = [
      {
        id: "am-1",
        plannedFor: "2026-11-07",
        timeOfDay: "MORNING",
        status: "WORN",
      },
      {
        id: "pm-1",
        plannedFor: "2026-11-07",
        timeOfDay: "AFTERNOON",
        status: "PLANNED",
      },
    ];

    // Add EVENING slot on the same date
    const withEvening = upsertCalendarSlotPlan(initial, {
      id: "eve-1",
      plannedFor: "2026-11-07",
      timeOfDay: "EVENING",
      status: "WORN",
    });

    expect(withEvening).toHaveLength(3);
    expect(withEvening.map((p) => p.id)).toEqual(["am-1", "pm-1", "eve-1"]);

    // Replace AFTERNOON slot from PLANNED to WORN while keeping MORNING and EVENING intact
    const updatedAfternoon = upsertCalendarSlotPlan(withEvening, {
      id: "pm-2",
      plannedFor: "2026-11-07",
      timeOfDay: "AFTERNOON",
      status: "WORN",
    });

    expect(updatedAfternoon).toHaveLength(3);
    expect(updatedAfternoon.map((p) => `${p.timeOfDay}:${p.id}:${p.status}`)).toEqual([
      "MORNING:am-1:WORN",
      "AFTERNOON:pm-2:WORN",
      "EVENING:eve-1:WORN",
    ]);
  });

  it("enforces multi-slot unique constraints and wear_outfit RPC slot upserts in PGlite", async () => {
    const { createTestDb, createUser, asUser } = await import("../db/harness");
    const db = await createTestDb();
    try {
      const userId = await createUser(db, "SlotTester");
      const itemRes = await db.query<{ id: string }>(
        `insert into public.wardrobe_items (user_id, name, category, image_path) values ($1, 'Linen Shirt', 'TOPS', $2) returning id`,
        [userId, `${userId}/linen.jpg`],
      );
      const itemId = itemRes.rows[0].id;

      const outfit1 = (
        await db.query<{ id: string }>(
          `insert into public.outfits (user_id, name) values ($1, 'Morning Look') returning id`,
          [userId],
        )
      ).rows[0].id;
      const outfit2 = (
        await db.query<{ id: string }>(
          `insert into public.outfits (user_id, name) values ($1, 'Afternoon Look') returning id`,
          [userId],
        )
      ).rows[0].id;
      const outfit3 = (
        await db.query<{ id: string }>(
          `insert into public.outfits (user_id, name) values ($1, 'Evening Look') returning id`,
          [userId],
        )
      ).rows[0].id;

      for (const oid of [outfit1, outfit2, outfit3]) {
        await db.query(
          `insert into public.outfit_items (outfit_id, item_id, user_id) values ($1, $2, $3)`,
          [oid, itemId, userId],
        );
      }

      // Directly log MORNING and AFTERNOON as worn, and plan EVENING on the same date
      await asUser(db, userId, async () => {
        await db.query(`select public.wear_outfit($1, current_date, null, 'MORNING')`, [
          outfit1,
        ]);
        await db.query(`select public.wear_outfit($1, current_date, null, 'AFTERNOON')`, [
          outfit2,
        ]);
        await db.query(
          `insert into public.outfit_plans (user_id, outfit_id, planned_for, time_of_day, status) values ($1, $2, current_date, 'EVENING', 'PLANNED')`,
          [userId, outfit3],
        );
      });

      const plans = await db.query<{ time_of_day: string; status: string; outfit_id: string }>(
        `select time_of_day, status, outfit_id from public.outfit_plans where user_id = $1 and planned_for = current_date order by time_of_day`,
        [userId],
      );
      expect(plans.rows).toEqual([
        { time_of_day: "AFTERNOON", status: "WORN", outfit_id: outfit2 },
        { time_of_day: "EVENING", status: "PLANNED", outfit_id: outfit3 },
        { time_of_day: "MORNING", status: "WORN", outfit_id: outfit1 },
      ]);
    } finally {
      await db.close();
    }
  }, 30_000);
});
