import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createTestDb, createUser } from "./harness";

let db: PGlite | undefined;
let alice: string;
let bob: string;
let carol: string;

function getDb(): PGlite {
  if (!db) throw new Error("Database not initialized");
  return db;
}

beforeAll(async () => {
  db = await createTestDb();
  alice = await createUser(db, "Alice");
  bob = await createUser(db, "Bob");
  carol = await createUser(db, "Carol");
});

afterAll(async () => {
  if (db) await db.close();
});

describe("start_direct_conversation RPC", () => {
  it("creates a conversation with both members and returns its id", async () => {
    const db = getDb();
    const convId = await asUser(db, alice, async () => {
      const r = await db.query<{ start_direct_conversation: string }>(
        `select public.start_direct_conversation($1)`,
        [bob],
      );
      return r.rows[0].start_direct_conversation;
    });

    expect(convId).toBeTruthy();

    const members = await db.query<{ user_id: string }>(
      `select user_id from public.connect_members where conversation_id = $1 order by user_id`,
      [convId],
    );
    expect(members.rows.map((r) => r.user_id).sort()).toEqual([alice, bob].sort());
  });

  it("returns the existing conversation instead of creating a duplicate", async () => {
    const db = getDb();
    const first = await asUser(db, bob, async () => {
      const r = await db.query<{ start_direct_conversation: string }>(
        `select public.start_direct_conversation($1)`,
        [alice],
      );
      return r.rows[0].start_direct_conversation;
    });

    const second = await asUser(db, alice, async () => {
      const r = await db.query<{ start_direct_conversation: string }>(
        `select public.start_direct_conversation($1)`,
        [bob],
      );
      return r.rows[0].start_direct_conversation;
    });

    expect(first).toBe(second);

    const count = await db.query<{ count: number }>(
      `select count(*)::int as count from public.connect_members m1
       join public.connect_members m2 on m1.conversation_id = m2.conversation_id
       where m1.user_id = $1 and m2.user_id = $2`,
      [alice, bob],
    );
    expect(count.rows[0].count).toBe(1);
  });

  it("rejects starting a conversation with yourself", async () => {
    const db = getDb();
    await asUser(db, alice, async () => {
      await expect(
        db.query(`select public.start_direct_conversation($1)`, [alice]),
      ).rejects.toThrow(/yourself/i);
    });
  });

  it("rejects a non-existent other user", async () => {
    const db = getDb();
    await asUser(db, alice, async () => {
      await expect(
        db.query(`select public.start_direct_conversation($1)`, [
          "00000000-0000-0000-0000-000000000000",
        ]),
      ).rejects.toThrow(/not found/i);
    });
  });

  it("cannot be called by anonymous users", async () => {
    const db = getDb();
    // anon role has no execute grant on the function
    await expect(
      db.query(`select public.start_direct_conversation($1)`, [bob]),
    ).rejects.toThrow();
  });
});

describe("conversation membership & message isolation", () => {
  let convId: string;

  beforeAll(async () => {
    const db = getDb();
    convId = await asUser(db, alice, async () => {
      const r = await db.query<{ start_direct_conversation: string }>(
        `select public.start_direct_conversation($1)`,
        [bob],
      );
      return r.rows[0].start_direct_conversation;
    });
  });

  it("a member can insert and read their own messages", async () => {
    const db = getDb();
    await asUser(db, alice, async () => {
      await db.query(
        `insert into public.connect_messages (conversation_id, sender_id, body) values ($1, $2, 'hi bob')`,
        [convId, alice],
      );
    });

    const rows = await asUser(db, bob, async () =>
      (
        await db.query<{ body: string }>(
          `select body from public.connect_messages where conversation_id = $1`,
          [convId],
        )
      ).rows,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].body).toBe("hi bob");
  });

  it("a non-member cannot read messages in the conversation", async () => {
    const db = getDb();
    const rows = await asUser(db, carol, async () =>
      (await db.query(`select 1 from public.connect_messages where conversation_id = $1`, [convId]))
        .rows,
    );
    expect(rows).toHaveLength(0);
  });

  it("a non-member cannot insert a message into the conversation", async () => {
    const db = getDb();
    await asUser(db, carol, async () => {
      await expect(
        db.query(
          `insert into public.connect_messages (conversation_id, sender_id, body) values ($1, $2, 'intruder')`,
          [convId, carol],
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });

  it("a member cannot spoof the sender_id", async () => {
    const db = getDb();
    await asUser(db, bob, async () => {
      await expect(
        db.query(
          `insert into public.connect_messages (conversation_id, sender_id, body) values ($1, $2, 'spoofed')`,
          [convId, alice],
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });

  it("enforces the 2-member limit on direct conversations", async () => {
    const db = getDb();
    await expect(
      db.query(
        `insert into public.connect_members (conversation_id, user_id) values ($1, $2)`,
        [convId, carol],
      ),
    ).rejects.toThrow(/2 members/i);
  });
});

describe("connect_user_profiles restricted view", () => {
  it("exposes id, display_name and closet_id for all users to authenticated callers", async () => {
    const db = getDb();
    const rows = await asUser(db, alice, async () =>
      (
        await db.query<{ id: string; display_name: string | null; closet_id: string }>(
          `select id, display_name, closet_id from public.connect_user_profiles order by display_name`,
        )
      ).rows,
    );

    const names = rows.map((r) => r.display_name).sort();
    expect(names).toEqual(["Alice", "Bob", "Carol"]);
    for (const r of rows) {
      expect(r.closet_id).toMatch(/^CLOS-[A-Z0-9]{8}$/);
    }
  });

  it("does not expose private profile columns (location, timezone, style preferences)", async () => {
    const db = getDb();
    await asUser(db, alice, async () => {
      await expect(
        db.query(`select location from public.connect_user_profiles limit 1`),
      ).rejects.toThrow();
      await expect(
        db.query(`select timezone from public.connect_user_profiles limit 1`),
      ).rejects.toThrow();
    });
  });

  it("restores strict profiles RLS: a user can only read their own profiles row", async () => {
    const db = getDb();
    const rows = await asUser(db, bob, async () =>
      (await db.query<{ id: string }>(`select id from public.profiles`)).rows,
    );
    expect(rows.map((r) => r.id)).toEqual([bob]);
  });
});

describe("message soft-delete", () => {
  it("only the sender can delete (soft-delete) their own message", async () => {
    const db = getDb();
    const convId = await asUser(db, alice, async () => {
      const r = await db.query<{ start_direct_conversation: string }>(
        `select public.start_direct_conversation($1)`,
        [bob],
      );
      return r.rows[0].start_direct_conversation;
    });

    let msgId: string;
    await asUser(db, alice, async () => {
      const r = await db.query<{ id: string }>(
        `insert into public.connect_messages (conversation_id, sender_id, body)
         values ($1, $2, 'delete me') returning id`,
        [convId, alice],
      );
      msgId = r.rows[0].id;
    });

    // Bob (non-sender) cannot delete
    await asUser(db, bob, async () => {
      const del = await db.query(`delete from public.connect_messages where id = $1`, [msgId]);
      expect(del.affectedRows).toBe(0);
    });

    // Alice (sender) can delete
    await asUser(db, alice, async () => {
      const del = await db.query(`delete from public.connect_messages where id = $1`, [msgId]);
      expect(del.affectedRows).toBe(1);
    });
  });
});
