import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createTestDb, createUser } from "./harness";

describe("Onboarding profile database operations & RLS", () => {
  let db: PGlite;
  let user1: string;
  let user2: string;

  beforeAll(async () => {
    db = await createTestDb();
    user1 = await createUser(db, "Gbemisola");
    user2 = await createUser(db, "SecondUser");
  });

  afterAll(async () => {
    if (db) await db.close();
  });

  it("allows an authenticated user to update their profile with multiple preferred styles", async () => {
    await asUser(db, user1, async () => {
      const updateRes = await db.query<{ id: string; display_name: string }>(
        `update public.profiles set
           display_name = 'Gbemisola',
           favourite_colours = '{"white","beige","purple"}',
           common_occasions = '{"formal_event"}',
           location = 'Lagos',
           timezone = 'UTC',
           discoverable = true,
           onboarding_completed_at = now(),
           preferred_style = '{"business_casual"}'
         where id = $1
         returning id, display_name, preferred_style`,
        [user1],
      );

      expect(updateRes.rows.length).toBe(1);
      expect(updateRes.rows[0].display_name).toBe("Gbemisola");
    });
  });

  it("allows an authenticated user to upsert or insert their own profile with profiles_insert_own policy", async () => {
    // Generate a fresh user id directly to simulate a missing profile row
    const freshIdRes = await db.query<{ id: string }>(
      `insert into auth.users (raw_user_meta_data) values ('{"display_name":"NewUser"}'::jsonb) returning id`,
    );
    const freshId = freshIdRes.rows[0].id;

    // Delete the triggered row if any to simulate a completely new / un-triggered profile
    await db.query(`delete from public.profiles where id = $1`, [freshId]);

    await asUser(db, freshId, async () => {
      // With profiles_insert_own, insert and upsert both succeed
      const insertRes = await db.query<{ id: string; display_name: string }>(
        `insert into public.profiles (id, display_name, favourite_colours, common_occasions, location, timezone, discoverable, onboarding_completed_at, preferred_style)
         values ($1, 'NewUser', '{"black"}', '{"everyday"}', 'Abuja', 'UTC', true, now(), '{"casual"}')
         on conflict (id) do update set
           display_name = excluded.display_name
         returning id, display_name`,
        [freshId],
      );

      expect(insertRes.rows.length).toBe(1);
      expect(insertRes.rows[0].display_name).toBe("NewUser");
    });
  });

  it("prevents an authenticated user from modifying or inserting another user's profile", async () => {
    await asUser(db, user1, async () => {
      // Update other user's profile -> 0 rows affected
      const updateRes = await db.query(
        `update public.profiles set display_name = 'Hacked' where id = $1`,
        [user2],
      );
      expect(updateRes.affectedRows).toBe(0);

      // Insert attempting to spoof other user's id -> RLS error
      await expect(
        db.query(
          `insert into public.profiles (id, display_name) values ($1, 'Spoof')`,
          [user2],
        ),
      ).rejects.toThrow();
    });
  });
});
