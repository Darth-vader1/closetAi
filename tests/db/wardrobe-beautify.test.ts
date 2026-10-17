import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { asUser, createTestDb, createUser } from "./harness";

describe("Wardrobe Garment Beautification Database Schema, Metadata & Security", () => {
  let db: PGlite;
  let aliceId: string;
  let bobId: string;

  beforeAll(async () => {
    db = await createTestDb();
    aliceId = await createUser(db, "Alice");
    bobId = await createUser(db, "Bob");
  });

  it("automatically sets original_image_path = image_path and beautification_status = 'NONE' on insert", async () => {
    const origPath = `${aliceId}/11111111-1111-4111-8111-111111111111.jpg`;
    const row = await asUser(db, aliceId, async () => {
      const res = await db.query<{
        id: string;
        image_path: string;
        original_image_path: string;
        beautified_image_path: string | null;
        beautification_mode: string | null;
        beautification_status: string;
      }>(
        `insert into public.wardrobe_items (user_id, name, category, image_path)
         values ($1, 'Linen Shirt', 'shirts', $2)
         returning id, image_path, original_image_path, beautified_image_path, beautification_mode, beautification_status`,
        [aliceId, origPath],
      );
      return res.rows[0];
    });

    expect(row.image_path).toBe(origPath);
    expect(row.original_image_path).toBe(origPath);
    expect(row.beautified_image_path).toBeNull();
    expect(row.beautification_mode).toBeNull();
    expect(row.beautification_status).toBe("NONE");
  });

  it("persists provider, model, status, and timestamp when saving a beautified version and supports restoring original", async () => {
    const origPath = `${aliceId}/22222222-2222-4222-8222-222222222222.jpg`;
    const beautifiedPath = `${aliceId}/33333333-3333-4333-8333-333333333333.jpg`;

    await asUser(db, aliceId, async () => {
      const created = await db.query<{ id: string }>(
        `insert into public.wardrobe_items (user_id, name, category, image_path)
         values ($1, 'Pleated Trousers', 'trousers', $2)
         returning id`,
        [aliceId, origPath],
      );
      const itemId = created.rows[0].id;

      // Accept beautified version (Mode 2: ai-enhance) with provider & model provenance
      const afterBeautify = await db.query<{
        image_path: string;
        original_image_path: string;
        beautified_image_path: string | null;
        beautification_mode: string | null;
        beautification_provider: string | null;
        beautification_model: string | null;
        beautification_status: string;
        beautified_at: string | null;
      }>(
        `update public.wardrobe_items
         set image_path = $1,
             beautified_image_path = $1,
             beautification_mode = 'ai-enhance',
             beautification_provider = 'photoroom+gemini',
             beautification_model = 'photoroom-v2-edit+gemini-2.5-flash',
             beautification_status = 'COMPLETED',
             beautified_at = now()
         where id = $2 and user_id = $3
         returning image_path, original_image_path, beautified_image_path, beautification_mode, beautification_provider, beautification_model, beautification_status, beautified_at`,
        [beautifiedPath, itemId, aliceId],
      );

      expect(afterBeautify.rows[0].image_path).toBe(beautifiedPath);
      expect(afterBeautify.rows[0].original_image_path).toBe(origPath);
      expect(afterBeautify.rows[0].beautified_image_path).toBe(beautifiedPath);
      expect(afterBeautify.rows[0].beautification_mode).toBe("ai-enhance");
      expect(afterBeautify.rows[0].beautification_provider).toBe("photoroom+gemini");
      expect(afterBeautify.rows[0].beautification_model).toBe(
        "photoroom-v2-edit+gemini-2.5-flash",
      );
      expect(afterBeautify.rows[0].beautification_status).toBe("COMPLETED");
      expect(afterBeautify.rows[0].beautified_at).toBeTruthy();

      // Restore original image while retaining beautified_image_path
      const switchedToOrig = await db.query<{
        image_path: string;
        original_image_path: string;
        beautified_image_path: string | null;
        beautification_status: string;
      }>(
        `update public.wardrobe_items
         set image_path = original_image_path,
             beautification_status = 'RESTORED_ORIGINAL'
         where id = $1 and user_id = $2
         returning image_path, original_image_path, beautified_image_path, beautification_status`,
        [itemId, aliceId],
      );

      expect(switchedToOrig.rows[0].image_path).toBe(origPath);
      expect(switchedToOrig.rows[0].original_image_path).toBe(origPath);
      expect(switchedToOrig.rows[0].beautified_image_path).toBe(beautifiedPath);
      expect(switchedToOrig.rows[0].beautification_status).toBe("RESTORED_ORIGINAL");
    });
  });

  it("rejects cross-user storage paths in image_path, original_image_path, and beautified_image_path", async () => {
    const aliceOrig = `${aliceId}/44444444-4444-4444-8444-444444444444.jpg`;
    const bobPath = `${bobId}/55555555-5555-4555-8555-555555555555.jpg`;

    await asUser(db, aliceId, async () => {
      await expect(
        db.query(
          `insert into public.wardrobe_items (user_id, name, category, image_path, beautified_image_path)
           values ($1, 'Jacket', 'jackets', $2, $3)`,
          [aliceId, aliceOrig, bobPath],
        ),
      ).rejects.toThrow(/beautified_image_path must reside inside the owner folder/i);

      await expect(
        db.query(
          `insert into public.wardrobe_items (user_id, name, category, image_path, original_image_path)
           values ($1, 'Jacket', 'jackets', $2, $3)`,
          [aliceId, aliceOrig, bobPath],
        ),
      ).rejects.toThrow(/original_image_path must reside inside the owner folder/i);
    });
  });

  it("prevents another user from modifying or replacing a garment's beautified image via RLS", async () => {
    const aliceOrig = `${aliceId}/66666666-6666-4666-8666-666666666666.jpg`;
    const itemId = await asUser(db, aliceId, async () => {
      const res = await db.query<{ id: string }>(
        `insert into public.wardrobe_items (user_id, name, category, image_path)
         values ($1, 'Silk Dress', 'dresses', $2)
         returning id`,
        [aliceId, aliceOrig],
      );
      return res.rows[0].id;
    });

    await asUser(db, bobId, async () => {
      const attempt = await db.query(
        `update public.wardrobe_items
         set beautified_image_path = $1
         where id = $2
         returning id`,
        [`${bobId}/77777777-7777-4777-8777-777777777777.jpg`, itemId],
      );
      expect(attempt.rows.length).toBe(0);
    });
  });
});
