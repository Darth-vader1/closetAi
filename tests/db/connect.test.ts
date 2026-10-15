import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asAnon, asUser, createTestDb, createUser } from "./harness";

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

    // Bob accepts so Alice can send the deletable message (consent model).
    await asUser(db, bob, async () => {
      await db.query(`select public.accept_conversation($1)`, [convId]);
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

// ═══════════════════════════════════════════════════════════════════════════
// Security hardening attack tests (migration 20261015000003_connect_security_v2)
// ═══════════════════════════════════════════════════════════════════════════

function closetIdOf(userId: string): Promise<string> {
  const db = getDb();
  return db
    .query<{ closet_id: string }>(`select closet_id from public.profiles where id = $1`, [userId])
    .then((r) => r.rows[0].closet_id);
}

/** Start a 1:1 conversation as `from` with `to`, returning the conversation id. */
async function startConv(from: string, to: string): Promise<string> {
  const db = getDb();
  return asUser(db, from, async () => {
    const r = await db.query<{ start_direct_conversation: string }>(
      `select public.start_direct_conversation($1)`,
      [to],
    );
    return r.rows[0].start_direct_conversation;
  });
}

/** Recipient accepts a pending conversation (status -> active). */
async function acceptConv(recipient: string, convId: string): Promise<void> {
  const db = getDb();
  await asUser(db, recipient, async () => {
    await db.query(`select public.accept_conversation($1)`, [convId]);
  });
}

async function sendMessage(convId: string, sender: string, body = "hello"): Promise<void> {
  const db = getDb();
  await asUser(db, sender, async () => {
    await db.query(
      `insert into public.connect_messages (conversation_id, sender_id, body) values ($1, $2, $3)`,
      [convId, sender, body],
    );
  });
}

// ── #1 / #2 Search: no email, exact closet_id, opt-in discoverable, rate limit ─

describe("search: connect_search_users", () => {
  it("never exposes an email column", async () => {
    const db = getDb();
    const searcher = await createUser(db, "SearchShape");
    const res = await asUser(db, searcher, async () =>
      db.query(`select * from public.connect_search_users($1) limit 0`, ["CLOS-NOTFOUND"]),
    );
    const names = (res.fields ?? []).map((f) => f.name);
    expect(names).toEqual(expect.arrayContaining(["id", "display_name", "closet_id"]));
    expect(names).not.toContain("email");
  });

  it("matches closet_id exactly, case-insensitively", async () => {
    const db = getDb();
    const searcher = await createUser(db, "SearchExact");
    const target = await createUser(db, "ExactTarget");
    const cid = await closetIdOf(target);

    const res = await asUser(db, searcher, async () =>
      db.query<{ id: string }>(`select * from public.connect_search_users($1)`, [cid.toLowerCase()]),
    );
    expect(res.rows.map((r) => r.id)).toContain(target);
  });

  it("does NOT match a partial/substring closet_id", async () => {
    const db = getDb();
    const searcher = await createUser(db, "SearchPartial");
    const target = await createUser(db, "PartialTarget");
    const cid = await closetIdOf(target);

    const res = await asUser(db, searcher, async () =>
      db.query<{ id: string }>(`select * from public.connect_search_users($1)`, [cid.slice(0, -2)]),
    );
    expect(res.rows.map((r) => r.id)).not.toContain(target);
  });

  it("does NOT substring-match the name of a non-discoverable profile", async () => {
    const db = getDb();
    const searcher = await createUser(db, "SearchSubstr");
    const target = await createUser(db, "ZzUniqueHiddenName");
    // discoverable defaults to false
    const res = await asUser(db, searcher, async () =>
      db.query<{ id: string }>(`select * from public.connect_search_users($1)`, ["ZzUniqueHidden"]),
    );
    expect(res.rows.map((r) => r.id)).not.toContain(target);
  });

  it("substring-matches the name once discoverable = true (opt-in)", async () => {
    const db = getDb();
    const searcher = await createUser(db, "SearchDisc");
    const target = await createUser(db, "ZzDiscoverableName");
    await db.query(`update public.profiles set discoverable = true where id = $1`, [target]);

    const res = await asUser(db, searcher, async () =>
      db.query<{ id: string }>(`select * from public.connect_search_users($1)`, ["ZzDiscover"]),
    );
    expect(res.rows.map((r) => r.id)).toContain(target);
  });

  it("rate-limits to 20 searches/minute/user", async () => {
    const db = getDb();
    const searcher = await createUser(db, "SearchRL");
    await asUser(db, searcher, async () => {
      for (let i = 0; i < 20; i++) {
        await db.query(`select * from public.connect_search_users($1)`, [`CLOS-NOPE${i}`]);
      }
      await expect(
        db.query(`select * from public.connect_search_users($1)`, ["CLOS-NOPE-21"]),
      ).rejects.toThrow(/RATE_LIMITED/);
    });
  });

  it("cannot be called by anonymous users", async () => {
    const db = getDb();
    await expect(
      asAnon(db, async () => db.query(`select * from public.connect_search_users($1)`, ["anything"])),
    ).rejects.toThrow();
  });
});

// ── #3 profiles.closet_id immutability ────────────────────────────────────────

describe("profiles.closet_id immutability", () => {
  it("rejects an authenticated user changing their own closet_id", async () => {
    const db = getDb();
    const user = await createUser(db, "ClosetGuard");
    const before = await closetIdOf(user);

    await asUser(db, user, async () => {
      await expect(
        db.query(`update public.profiles set closet_id = 'CLOS-ZZZZZZZZ' where id = $1`, [user]),
      ).rejects.toThrow(/closet_id cannot be changed/);
    });

    expect(await closetIdOf(user)).toBe(before);
  });

  it("still allows updating other profile columns", async () => {
    const db = getDb();
    const user = await createUser(db, "ClosetGuard2");
    await asUser(db, user, async () => {
      await db.query(`update public.profiles set display_name = 'Renamed' where id = $1`, [user]);
    });
    const r = await db.query<{ display_name: string }>(
      `select display_name from public.profiles where id = $1`,
      [user],
    );
    expect(r.rows[0].display_name).toBe("Renamed");
  });
});

// ── #4 Consent model ──────────────────────────────────────────────────────────

describe("consent model", () => {
  it("new conversations start pending with the creator as requester", async () => {
    const db = getDb();
    const a = await createUser(db, "ConsentMetaA");
    const b = await createUser(db, "ConsentMetaB");
    const convId = await startConv(a, b);

    const r = await db.query<{ status: string; requester: string }>(
      `select status, requester from public.connect_conversations where id = $1`,
      [convId],
    );
    expect(r.rows[0].status).toBe("pending");
    expect(r.rows[0].requester).toBe(a);
  });

  it("lets the requester send exactly one message while pending", async () => {
    const db = getDb();
    const a = await createUser(db, "ConsentOneA");
    const b = await createUser(db, "ConsentOneB");
    const convId = await startConv(a, b);

    await sendMessage(convId, a, "first");
    await asUser(db, a, async () => {
      await expect(
        db.query(
          `insert into public.connect_messages (conversation_id, sender_id, body) values ($1, $2, 'second')`,
          [convId, a],
        ),
      ).rejects.toThrow(/one message until/i);
    });
  });

  it("blocks the recipient from sending until they accept", async () => {
    const db = getDb();
    const a = await createUser(db, "ConsentRecipA");
    const b = await createUser(db, "ConsentRecipB");
    const convId = await startConv(a, b);

    await asUser(db, b, async () => {
      await expect(
        db.query(
          `insert into public.connect_messages (conversation_id, sender_id, body) values ($1, $2, 'hi')`,
          [convId, b],
        ),
      ).rejects.toThrow(/accept this conversation/i);
    });
  });

  it("allows both members to message after the recipient accepts", async () => {
    const db = getDb();
    const a = await createUser(db, "ConsentAcceptA");
    const b = await createUser(db, "ConsentAcceptB");
    const convId = await startConv(a, b);

    await sendMessage(convId, a, "first");
    await acceptConv(b, convId);

    const after = await db.query<{ status: string }>(
      `select status from public.connect_conversations where id = $1`,
      [convId],
    );
    expect(after.rows[0].status).toBe("active");

    await sendMessage(convId, b, "hi back"); // recipient can now reply
    await sendMessage(convId, a, "second"); // requester can send more
  });

  it("only the recipient may accept — not the requester, not an outsider", async () => {
    const db = getDb();
    const a = await createUser(db, "ConsentWhoA");
    const b = await createUser(db, "ConsentWhoB");
    const outsider = await createUser(db, "ConsentWhoC");
    const convId = await startConv(a, b);

    await asUser(db, a, async () => {
      await expect(
        db.query(`select public.accept_conversation($1)`, [convId]),
      ).rejects.toThrow(/only the recipient/i);
    });

    await asUser(db, outsider, async () => {
      await expect(
        db.query(`select public.accept_conversation($1)`, [convId]),
      ).rejects.toThrow(/not a member/i);
    });
  });
});

// ── #4 Blocks ─────────────────────────────────────────────────────────────────

describe("blocks", () => {
  it("a blocked user cannot start a conversation (either direction)", async () => {
    const db = getDb();
    const a = await createUser(db, "BlockStartA");
    const c = await createUser(db, "BlockStartC");

    await asUser(db, a, async () => {
      await db.query(`insert into public.connect_blocks (blocker, blocked) values ($1, $2)`, [a, c]);
    });

    await asUser(db, c, async () => {
      await expect(
        db.query(`select public.start_direct_conversation($1)`, [a]),
      ).rejects.toThrow(/cannot start a conversation/i);
    });
    await asUser(db, a, async () => {
      await expect(
        db.query(`select public.start_direct_conversation($1)`, [c]),
      ).rejects.toThrow(/cannot start a conversation/i);
    });
  });

  it("a blocked user cannot send messages in an existing conversation", async () => {
    const db = getDb();
    const a = await createUser(db, "BlockMsgA");
    const b = await createUser(db, "BlockMsgB");
    const convId = await startConv(a, b);
    await acceptConv(b, convId);

    // Bob blocks Alice, then Alice (blocked) tries to message.
    await asUser(db, b, async () => {
      await db.query(`insert into public.connect_blocks (blocker, blocked) values ($1, $2)`, [b, a]);
    });

    await asUser(db, a, async () => {
      await expect(
        db.query(
          `insert into public.connect_messages (conversation_id, sender_id, body) values ($1, $2, 'nope')`,
          [convId, a],
        ),
      ).rejects.toThrow(/cannot send messages/i);
    });
  });

  it("RLS: a user only sees and creates their own blocks", async () => {
    const db = getDb();
    const a = await createUser(db, "BlockRlsA");
    const b = await createUser(db, "BlockRlsB");
    const c = await createUser(db, "BlockRlsC");

    // Impersonating another blocker is rejected.
    await asUser(db, a, async () => {
      await expect(
        db.query(`insert into public.connect_blocks (blocker, blocked) values ($1, $2)`, [b, c]),
      ).rejects.toThrow(/row-level security/i);
    });

    // Alice can block Bob.
    await asUser(db, a, async () => {
      await db.query(`insert into public.connect_blocks (blocker, blocked) values ($1, $2)`, [a, b]);
    });

    // Alice sees only her own block rows.
    const seen = await asUser(db, a, async () =>
      db.query<{ blocker: string }>(`select blocker from public.connect_blocks`),
    );
    expect(seen.rows.every((r) => r.blocker === a)).toBe(true);

    // Bob cannot see Alice's block of him.
    const bobSeen = await asUser(db, b, async () =>
      db.query<{ blocker: string }>(`select blocker from public.connect_blocks`),
    );
    expect(bobSeen.rows.length).toBe(0);
  });
});

// ── #4 Reports ────────────────────────────────────────────────────────────────

describe("connect_reports", () => {
  it("a user can file a report as themselves", async () => {
    const db = getDb();
    const a = await createUser(db, "ReportA");
    const b = await createUser(db, "ReportB");

    await asUser(db, a, async () => {
      await db.query(
        `insert into public.connect_reports (reporter, reported_user, reason) values ($1, $2, 'spam')`,
        [a, b],
      );
    });

    const r = await db.query<{ count: number }>(
      `select count(*)::int as count from public.connect_reports where reporter = $1`,
      [a],
    );
    expect(r.rows[0].count).toBe(1);
  });

  it("cannot file a report impersonating another user", async () => {
    const db = getDb();
    const a = await createUser(db, "ReportFakeA");
    const b = await createUser(db, "ReportFakeB");
    const c = await createUser(db, "ReportFakeC");

    await asUser(db, a, async () => {
      await expect(
        db.query(
          `insert into public.connect_reports (reporter, reported_user, reason) values ($1, $2, 'x')`,
          [b, c],
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });
});

// ── #4 Message rate limit ─────────────────────────────────────────────────────

describe("message rate limit", () => {
  it("raises RATE_LIMITED after 30 messages in a minute", async () => {
    const db = getDb();
    const a = await createUser(db, "MsgRlA");
    const b = await createUser(db, "MsgRlB");
    const convId = await startConv(a, b);
    await acceptConv(b, convId);

    await asUser(db, a, async () => {
      for (let i = 0; i < 30; i++) {
        await db.query(
          `insert into public.connect_messages (conversation_id, sender_id, body) values ($1, $2, $3)`,
          [convId, a, `msg ${i}`],
        );
      }
      await expect(
        db.query(
          `insert into public.connect_messages (conversation_id, sender_id, body) values ($1, $2, 'over')`,
          [convId, a],
        ),
      ).rejects.toThrow(/RATE_LIMITED/);
    });
  });
});

// ── #4 New-conversation rate limit ────────────────────────────────────────────

describe("new conversation rate limit", () => {
  it("raises RATE_LIMITED on the 21st new conversation in a day", async () => {
    const db = getDb();
    const requester = await createUser(db, "NcRlRequester");
    const targets: string[] = [];
    for (let i = 0; i < 21; i++) targets.push(await createUser(db, `NcRlTarget${i}`));

    await asUser(db, requester, async () => {
      for (let i = 0; i < 20; i++) {
        await db.query(`select public.start_direct_conversation($1)`, [targets[i]]);
      }
      await expect(
        db.query(`select public.start_direct_conversation($1)`, [targets[20]]),
      ).rejects.toThrow(/RATE_LIMITED/);
    });
  });
});

// ── #5 start_direct_conversation pair uniqueness ──────────────────────────────

describe("start_direct_conversation pair uniqueness", () => {
  it("returns a single conversation for calls from both directions", async () => {
    const db = getDb();
    const a = await createUser(db, "UniqA");
    const b = await createUser(db, "UniqB");

    // PGlite is a single connection, so this exercises the reuse path that the
    // pg_advisory_xact_lock guards: whichever direction runs first creates the
    // conversation, the other must return the same id (never a duplicate).
    const first = await startConv(a, b);
    const second = await startConv(b, a);
    expect(second).toBe(first);

    const count = await db.query<{ count: number }>(
      `select count(distinct c.id)::int as count
         from public.connect_conversations c
         join public.connect_members m1 on m1.conversation_id = c.id and m1.user_id = $1
         join public.connect_members m2 on m2.conversation_id = c.id and m2.user_id = $2`,
      [a, b],
    );
    expect(count.rows[0].count).toBe(1);
  });
});

// ── #6 connect_members column protection ──────────────────────────────────────

describe("connect_members column protection", () => {
  it("resets protected columns on update but allows last_read_at", async () => {
    const db = getDb();
    const a = await createUser(db, "MemberGuardA");
    const b = await createUser(db, "MemberGuardB");
    const convId = await startConv(a, b);

    const before = await db.query<{ conversation_id: string; user_id: string; joined_at: string }>(
      `select conversation_id, user_id, joined_at from public.connect_members
        where conversation_id = $1 and user_id = $2`,
      [convId, a],
    );

    await asUser(db, a, async () => {
      await db.query(
        `update public.connect_members
            set conversation_id = gen_random_uuid(),
                user_id         = $1,
                joined_at       = now() + interval '1 day',
                last_read_at    = now()
          where conversation_id = $2 and user_id = $3`,
        [b, convId, a],
      );
    });

    const after = await db.query<{
      conversation_id: string;
      user_id: string;
      joined_at: string;
      last_read_at: string | null;
    }>(
      `select conversation_id, user_id, joined_at, last_read_at from public.connect_members
        where conversation_id = $1 and user_id = $2`,
      [convId, a],
    );

    expect(after.rows.length).toBe(1);
    expect(after.rows[0].conversation_id).toBe(before.rows[0].conversation_id);
    expect(after.rows[0].user_id).toBe(before.rows[0].user_id);
    expect(new Date(after.rows[0].joined_at).getTime()).toBe(
      new Date(before.rows[0].joined_at).getTime(),
    );
    expect(after.rows[0].last_read_at).not.toBeNull();
  });
});

// ── #6 closet_id helper functions are not callable by users ───────────────────

describe("closet_id helper functions are locked down", () => {
  it("authenticated and anon cannot execute generate_closet_id / assign_closet_id", async () => {
    const db = getDb();
    const gen = await db.query<{ auth: boolean; anon: boolean }>(
      `select
         has_function_privilege('authenticated', 'public.generate_closet_id()', 'execute') as auth,
         has_function_privilege('anon',          'public.generate_closet_id()', 'execute') as anon`,
    );
    expect(gen.rows[0]).toEqual({ auth: false, anon: false });

    const assign = await db.query<{ auth: boolean; anon: boolean }>(
      `select
         has_function_privilege('authenticated', 'public.assign_closet_id()', 'execute') as auth,
         has_function_privilege('anon',          'public.assign_closet_id()', 'execute') as anon`,
    );
    expect(assign.rows[0]).toEqual({ auth: false, anon: false });
  });

  it("a direct call as an authenticated user is denied", async () => {
    const db = getDb();
    const user = await createUser(db, "FnLock");
    await asUser(db, user, async () => {
      await expect(db.query(`select public.generate_closet_id()`)).rejects.toThrow();
    });
  });
});
