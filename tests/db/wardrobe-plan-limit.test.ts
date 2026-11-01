import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asService, asUser, createTestDb, createUser } from "./harness";

describe("Wardrobe items database plan limit trigger (20261101000003)", () => {
  let db: PGlite;
  let freeUser: string;
  let premiumUser: string;
  let expiredUser: string;

  beforeAll(async () => {
    db = await createTestDb();
    freeUser = await createUser(db, "FreeUser");
    premiumUser = await createUser(db, "PremiumUser");
    expiredUser = await createUser(db, "ExpiredUser");

    // Upgrade premiumUser via service role
    await asService(db, async () => {
      await db.query(
        `update public.profiles set
           subscription_status = 'active',
           subscription_plan = 'monthly',
           subscription_expires_at = now() + interval '30 days'
         where id = $1`,
        [premiumUser],
      );

      // Set expiredUser with an expired subscription
      await db.query(
        `update public.profiles set
           subscription_status = 'active',
           subscription_plan = 'monthly',
           subscription_expires_at = now() - interval '1 day'
         where id = $1`,
        [expiredUser],
      );
    });
  });

  afterAll(async () => {
    if (db) await db.close();
  });

  it("allows a free user to insert up to 30 wardrobe items", async () => {
    await asUser(db, freeUser, async () => {
      for (let i = 1; i <= 30; i++) {
        await db.query(
          `insert into public.wardrobe_items (user_id, name, category, image_path)
           values ($1, $2, 't-shirts', $3)`,
          [freeUser, `Free Item ${i}`, `${freeUser}/item-${i}.jpg`],
        );
      }

      const countRes = await db.query<{ count: string }>(
        `select count(*) as count from public.wardrobe_items where user_id = $1`,
        [freeUser],
      );
      expect(Number(countRes.rows[0].count)).toBe(30);
    });
  });

  it("blocks a free user from inserting the 31st item with P0001 Free plan limit error", async () => {
    await asUser(db, freeUser, async () => {
      let threw = false;
      let errorMessage = "";
      try {
        await db.query(
          `insert into public.wardrobe_items (user_id, name, category, image_path)
           values ($1, 'Item 31', 't-shirts', $2)`,
          [freeUser, `${freeUser}/item-31.jpg`],
        );
      } catch (err: unknown) {
        threw = true;
        errorMessage = err instanceof Error ? err.message : String(err);
      }

      expect(threw).toBe(true);
      expect(errorMessage).toContain("Free plan limit reached (30 wardrobe items)");
    });
  });

  it("allows a premium user to insert beyond 30 wardrobe items", async () => {
    await asUser(db, premiumUser, async () => {
      for (let i = 1; i <= 35; i++) {
        await db.query(
          `insert into public.wardrobe_items (user_id, name, category, image_path)
           values ($1, $2, 't-shirts', $3)`,
          [premiumUser, `Premium Item ${i}`, `${premiumUser}/item-${i}.jpg`],
        );
      }

      const countRes = await db.query<{ count: string }>(
        `select count(*) as count from public.wardrobe_items where user_id = $1`,
        [premiumUser],
      );
      expect(Number(countRes.rows[0].count)).toBe(35);
    });
  });

  it("blocks an expired subscriber at 30 items", async () => {
    await asUser(db, expiredUser, async () => {
      for (let i = 1; i <= 30; i++) {
        await db.query(
          `insert into public.wardrobe_items (user_id, name, category, image_path)
           values ($1, $2, 't-shirts', $3)`,
          [expiredUser, `Expired Item ${i}`, `${expiredUser}/item-${i}.jpg`],
        );
      }

      await expect(
        db.query(
          `insert into public.wardrobe_items (user_id, name, category, image_path)
           values ($1, 'Expired Item 31', 't-shirts', $2)`,
          [expiredUser, `${expiredUser}/item-31.jpg`],
        ),
      ).rejects.toThrow("Free plan limit reached (30 wardrobe items)");
    });
  });

  it("allows service_role to insert items beyond 30 even for a free user", async () => {
    await asService(db, async () => {
      await db.query(
        `insert into public.wardrobe_items (user_id, name, category, image_path)
         values ($1, 'Service Role Extra Item', 't-shirts', $2)`,
        [freeUser, `${freeUser}/service-item.jpg`],
      );

      const countRes = await db.query<{ count: string }>(
        `select count(*) as count from public.wardrobe_items where user_id = $1`,
        [freeUser],
      );
      expect(Number(countRes.rows[0].count)).toBe(31);
    });
  });
});
