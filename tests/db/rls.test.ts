import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createTestDb, createUser } from "./harness";

let db: PGlite;
let alice: string;
let bob: string;
let aliceItem: string;
let aliceOutfit: string;

async function insertItem(userId: string, name: string, imagePath: string): Promise<string> {
  const res = await db.query<{ id: string }>(
    `insert into public.wardrobe_items (user_id, name, category, image_path)
     values ($1, $2, 'tshirts', $3) returning id`,
    [userId, name, imagePath],
  );
  return res.rows[0].id;
}

beforeAll(async () => {
  db = await createTestDb();
  alice = await createUser(db, "Alice");
  bob = await createUser(db, "Bob");
  aliceItem = await insertItem(alice, "Alice tee", `${alice}/tee.jpg`);
  const o = await db.query<{ id: string }>(
    `insert into public.outfits (user_id, name) values ($1, 'Alice outfit') returning id`,
    [alice],
  );
  aliceOutfit = o.rows[0].id;
  await db.query(`insert into public.outfit_items (outfit_id, item_id, user_id) values ($1, $2, $3)`, [
    aliceOutfit,
    aliceItem,
    alice,
  ]);
});

afterAll(async () => {
  await db.close();
});

describe("schema bootstrap", () => {
  it("creates a profile and DISABLED email preferences when a user signs up", async () => {
    const profile = await db.query<{ display_name: string; timezone: string }>(
      `select display_name, timezone from public.profiles where id = $1`,
      [alice],
    );
    expect(profile.rows[0].display_name).toBe("Alice");
    const prefs = await db.query<{ daily_enabled: boolean; weekly_enabled: boolean }>(
      `select daily_enabled, weekly_enabled from public.email_preferences where user_id = $1`,
      [alice],
    );
    expect(prefs.rows[0]).toEqual({ daily_enabled: false, weekly_enabled: false });
  });

  it("creates the wardrobe storage bucket as private", async () => {
    const res = await db.query<{ public: boolean }>(`select public from storage.buckets where id = 'wardrobe'`);
    expect(res.rows[0].public).toBe(false);
  });
});

describe("Row Level Security isolation (Flow G)", () => {
  it("lets a user read their own items", async () => {
    const rows = await asUser(db, alice, async () => (await db.query(`select id from public.wardrobe_items`)).rows);
    expect(rows).toHaveLength(1);
  });

  it("hides another user's items, outfits and profile", async () => {
    await asUser(db, bob, async () => {
      expect((await db.query(`select 1 from public.wardrobe_items`)).rows).toHaveLength(0);
      expect((await db.query(`select 1 from public.outfits`)).rows).toHaveLength(0);
      expect((await db.query(`select 1 from public.outfit_items`)).rows).toHaveLength(0);
      const profiles = await db.query<{ id: string }>(`select id from public.profiles`);
      expect(profiles.rows.map((r) => r.id)).toEqual([bob]);
    });
  });

  it("cannot update or delete another user's item by guessing its id", async () => {
    await asUser(db, bob, async () => {
      const upd = await db.query(`update public.wardrobe_items set name = 'hacked' where id = $1`, [aliceItem]);
      expect(upd.affectedRows).toBe(0);
      const del = await db.query(`delete from public.wardrobe_items where id = $1`, [aliceItem]);
      expect(del.affectedRows).toBe(0);
    });
    const still = await db.query<{ name: string }>(`select name from public.wardrobe_items where id = $1`, [aliceItem]);
    expect(still.rows[0].name).toBe("Alice tee");
  });

  it("rejects inserting a row that claims another user's id", async () => {
    await asUser(db, bob, async () => {
      await expect(
        db.query(`insert into public.wardrobe_items (user_id, name, category, image_path) values ($1, 'x', 'jeans', 'p')`, [
          alice,
        ]),
      ).rejects.toThrow(/row-level security/i);
    });
  });

  it("prevents Bob from putting Alice's garment into Bob's outfit (composite FK)", async () => {
    const bobOutfit = (
      await db.query<{ id: string }>(`insert into public.outfits (user_id, name) values ($1, 'Bob outfit') returning id`, [
        bob,
      ])
    ).rows[0].id;
    await asUser(db, bob, async () => {
      await expect(
        db.query(`insert into public.outfit_items (outfit_id, item_id, user_id) values ($1, $2, $3)`, [
          bobOutfit,
          aliceItem,
          bob,
        ]),
      ).rejects.toThrow(/foreign key|violates/i);
    });
  });

  it("blocks users from writing email_logs, which are service-role only", async () => {
    await asUser(db, alice, async () => {
      await expect(
        db.query(`insert into public.email_logs (user_id, kind, period_key) values ($1, 'DAILY', '2026-10-09')`, [alice]),
      ).rejects.toThrow(/row-level security/i);
    });
  });

  it("isolates private storage objects by folder", async () => {
    await db.query(`insert into storage.objects (bucket_id, name) values ('wardrobe', $1)`, [`${alice}/tee.jpg`]);
    const seenByBob = await asUser(db, bob, async () => (await db.query(`select 1 from storage.objects`)).rows);
    expect(seenByBob).toHaveLength(0);
    const seenByAlice = await asUser(db, alice, async () => (await db.query(`select 1 from storage.objects`)).rows);
    expect(seenByAlice).toHaveLength(1);
    await asUser(db, bob, async () => {
      await expect(
        db.query(`insert into storage.objects (bucket_id, name) values ('wardrobe', $1)`, [`${alice}/evil.jpg`]),
      ).rejects.toThrow(/row-level security/i);
    });
  });
});

describe("delete semantics", () => {
  it("deleting an outfit never deletes garments", async () => {
    const item = await insertItem(alice, "Keep me", `${alice}/keep.jpg`);
    const outfit = (
      await db.query<{ id: string }>(`insert into public.outfits (user_id, name) values ($1, 'Temp') returning id`, [alice])
    ).rows[0].id;
    await db.query(`insert into public.outfit_items (outfit_id, item_id, user_id) values ($1, $2, $3)`, [outfit, item, alice]);
    await db.query(`delete from public.outfits where id = $1`, [outfit]);
    const items = await db.query(`select 1 from public.wardrobe_items where id = $1`, [item]);
    expect(items.rows).toHaveLength(1);
  });

  it("deleting a garment removes its outfit links but keeps the outfit", async () => {
    const item = await insertItem(alice, "Temp item", `${alice}/temp.jpg`);
    const outfit = (
      await db.query<{ id: string }>(`insert into public.outfits (user_id, name) values ($1, 'Stays') returning id`, [alice])
    ).rows[0].id;
    await db.query(`insert into public.outfit_items (outfit_id, item_id, user_id) values ($1, $2, $3)`, [outfit, item, alice]);
    await db.query(`delete from public.wardrobe_items where id = $1`, [item]);
    expect((await db.query(`select 1 from public.outfit_items where outfit_id = $1`, [outfit])).rows).toHaveLength(0);
    expect((await db.query(`select 1 from public.outfits where id = $1`, [outfit])).rows).toHaveLength(1);
  });

  it("deleting an outfit keeps worn history, nulling the outfit reference", async () => {
    const outfit = (
      await db.query<{ id: string }>(`insert into public.outfits (user_id, name) values ($1, 'Worn once') returning id`, [alice])
    ).rows[0].id;
    const hist = (
      await db.query<{ id: string }>(
        `insert into public.outfit_history (user_id, outfit_id, worn_on) values ($1, $2, '2026-10-01') returning id`,
        [alice, outfit],
      )
    ).rows[0].id;
    await db.query(`delete from public.outfits where id = $1`, [outfit]);
    const res = await db.query<{ outfit_id: string | null }>(`select outfit_id from public.outfit_history where id = $1`, [hist]);
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].outfit_id).toBeNull();
  });
});

describe("change_item_status (laundry, Flow D)", () => {
  it("records events and updates last_washed_at ONLY when washing is confirmed", async () => {
    const id = await insertItem(alice, "Laundry tee", `${alice}/laundry.jpg`);
    await asUser(db, alice, async () => {
      await db.query(`select public.change_item_status($1, 'DIRTY')`, [id]);
      await db.query(`select public.change_item_status($1, 'WASHING')`, [id]);
    });
    let item = (await db.query<{ status: string; last_washed_at: string | null }>(
      `select status, last_washed_at from public.wardrobe_items where id = $1`, [id])).rows[0];
    expect(item.status).toBe("WASHING");
    expect(item.last_washed_at).toBeNull();

    await asUser(db, alice, async () => {
      await db.query(`select public.change_item_status($1, 'CLEAN', true)`, [id]);
    });
    item = (await db.query<{ status: string; last_washed_at: string | null }>(
      `select status, last_washed_at from public.wardrobe_items where id = $1`, [id])).rows[0];
    expect(item.status).toBe("CLEAN");
    expect(item.last_washed_at).not.toBeNull();

    const events = await db.query<{ from_status: string | null; to_status: string; confirmed_washed: boolean }>(
      `select from_status, to_status, confirmed_washed from public.laundry_events where item_id = $1 order by created_at, id`, [id]);
    expect(events.rows.map((e) => [e.from_status, e.to_status, e.confirmed_washed])).toEqual([
      ["CLEAN", "DIRTY", false],
      ["DIRTY", "WASHING", false],
      ["WASHING", "CLEAN", true],
    ]);
  });

  it("does not touch last_washed_at for a plain status edit back to CLEAN", async () => {
    const id = await insertItem(alice, "Edit tee", `${alice}/edit.jpg`);
    await asUser(db, alice, async () => {
      await db.query(`select public.change_item_status($1, 'DIRTY')`, [id]);
      await db.query(`select public.change_item_status($1, 'CLEAN')`, [id]);
    });
    const item = (await db.query<{ last_washed_at: string | null }>(
      `select last_washed_at from public.wardrobe_items where id = $1`, [id])).rows[0];
    expect(item.last_washed_at).toBeNull();
  });

  it("rejects confirming a wash for a non-CLEAN target", async () => {
    const id = await insertItem(alice, "Bad tee", `${alice}/bad.jpg`);
    await asUser(db, alice, async () => {
      await expect(db.query(`select public.change_item_status($1, 'DRYING', true)`, [id])).rejects.toThrow(/only be confirmed/i);
    });
  });

  it("cannot change another user's item", async () => {
    await asUser(db, bob, async () => {
      await expect(db.query(`select public.change_item_status($1, 'DIRTY')`, [aliceItem])).rejects.toThrow(/not found/i);
    });
  });
});

describe("email idempotency key", () => {
  it("allows only one email_logs row per user, kind and period", async () => {
    await db.query(`insert into public.email_logs (user_id, kind, period_key) values ($1, 'DAILY', '2026-10-10')`, [alice]);
    await expect(
      db.query(`insert into public.email_logs (user_id, kind, period_key) values ($1, 'DAILY', '2026-10-10')`, [alice]),
    ).rejects.toThrow(/unique|duplicate/i);
  });
});

describe("wear_outfit atomic RPC & profile deletion", () => {
  it("atomically logs outfit history, increments wear_count, sets last_worn_at, and marks status WORN", async () => {
    const itemId = await insertItem(alice, "Wear test shirt", `${alice}/wear-shirt.jpg`);
    const outfitId = (
      await db.query<{ id: string }>(`insert into public.outfits (user_id, name) values ($1, 'Wear Test Look') returning id`, [
        alice,
      ])
    ).rows[0].id;
    await db.query(`insert into public.outfit_items (outfit_id, item_id, user_id) values ($1, $2, $3)`, [
      outfitId,
      itemId,
      alice,
    ]);

    const histId = await asUser(db, alice, async () => {
      const r = await db.query<{ wear_outfit: string }>(`select public.wear_outfit($1)`, [outfitId]);
      return r.rows[0].wear_outfit;
    });

    expect(histId).toBeTruthy();

    const updatedItem = (
      await db.query<{ status: string; wear_count: number; last_worn_at: string | null }>(
        `select status, wear_count, last_worn_at from public.wardrobe_items where id = $1`,
        [itemId],
      )
    ).rows[0];
    expect(updatedItem.status).toBe("WORN");
    expect(updatedItem.wear_count).toBe(1);
    expect(updatedItem.last_worn_at).not.toBeNull();

    // Repeating wear_outfit on the same date is rejected and does not bump wear_count
    await asUser(db, alice, async () => {
      await expect(db.query(`select public.wear_outfit($1)`, [outfitId])).rejects.toThrow(/already marked as worn/i);
    });
    const afterDup = (
      await db.query<{ wear_count: number }>(`select wear_count from public.wardrobe_items where id = $1`, [itemId])
    ).rows[0];
    expect(afterDup.wear_count).toBe(1);

    // Future date in 2099 is rejected
    await asUser(db, alice, async () => {
      await expect(db.query(`select public.wear_outfit($1, '2099-01-01')`, [outfitId])).rejects.toThrow(/out of allowed range/i);
    });

    const histItems = await db.query(`select item_id from public.outfit_history_items where history_id = $1`, [histId]);
    expect(histItems.rows).toEqual([{ item_id: itemId }]);
  });

  it("rejects wear_outfit when an item is DIRTY", async () => {
    const dirtyItemId = await insertItem(alice, "Dirty blazer", `${alice}/dirty-blazer.jpg`);
    await db.query(`update public.wardrobe_items set status = 'DIRTY' where id = $1`, [dirtyItemId]);
    const outfitId = (
      await db.query<{ id: string }>(`insert into public.outfits (user_id, name) values ($1, 'Dirty Look') returning id`, [
        alice,
      ])
    ).rows[0].id;
    await db.query(`insert into public.outfit_items (outfit_id, item_id, user_id) values ($1, $2, $3)`, [
      outfitId,
      dirtyItemId,
      alice,
    ]);

    await asUser(db, alice, async () => {
      await expect(db.query(`select public.wear_outfit($1)`, [outfitId])).rejects.toThrow(/not clean and ready/i);
    });
  });

  it("rejects '..' path traversal in storage.objects policies", async () => {
    await asUser(db, bob, async () => {
      await expect(
        db.query(`insert into storage.objects (bucket_id, name) values ('wardrobe', $1)`, [`${bob}/../${alice}/sneaky.jpg`]),
      ).rejects.toThrow(/row-level security/i);
    });
  });

  it("allows a user to delete their own profile and cascades to owned rows", async () => {
    const tempUser = await createUser(db, "TempUser");
    await insertItem(tempUser, "Temp shirt", `${tempUser}/shirt.jpg`);
    await asUser(db, tempUser, async () => {
      const del = await db.query(`delete from public.profiles where id = $1`, [tempUser]);
      expect(del.affectedRows).toBe(1);
    });
    const remaining = await db.query(`select 1 from public.wardrobe_items where user_id = $1`, [tempUser]);
    expect(remaining.rows).toHaveLength(0);
  });
});

