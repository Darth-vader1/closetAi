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

describe("connect_user_profiles locked down & partner profile resolution", () => {
  it("normal authenticated users cannot select from connect_user_profiles or list non-discoverable users", async () => {
    const db = getDb();
    const priv = await db.query<{ auth: boolean; anon: boolean }>(
      `select
         has_table_privilege('authenticated', 'public.connect_user_profiles', 'select') as auth,
         has_table_privilege('anon',          'public.connect_user_profiles', 'select') as anon`,
    );
    expect(priv.rows[0]).toEqual({ auth: false, anon: false });

    await asUser(db, alice, async () => {
      await expect(
        db.query(`select id, display_name, closet_id from public.connect_user_profiles`),
      ).rejects.toThrow();
    });
  });

  it("connect_resolve_partner_profiles resolves conversation partners but NOT arbitrary strangers", async () => {
    const db = getDb();
    // Alice and Bob already share a conversation from earlier tests; Carol does not share one with Alice.
    const rows = await asUser(db, alice, async () =>
      (
        await db.query<{ id: string; display_name: string | null; closet_id: string }>(
          `select id, display_name, closet_id from public.connect_resolve_partner_profiles($1::uuid[])`,
          [[bob, carol]],
        )
      ).rows,
    );

    expect(rows.map((r) => r.id)).toEqual([bob]);
    expect(rows[0].display_name).toBe("Bob");
    expect(rows[0].closet_id).toMatch(/^CLOS-[A-Z0-9]{8}$/);
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

  it("does NOT substring-match the name of a profile that opted out (discoverable = false)", async () => {
    const db = getDb();
    const searcher = await createUser(db, "SearchSubstr");
    const target = await createUser(db, "ZzUniqueHiddenName");
    await db.query(`update public.profiles set discoverable = false where id = $1`, [target]);
    const res = await asUser(db, searcher, async () =>
      db.query<{ id: string }>(`select * from public.connect_search_users($1)`, ["ZzUniqueHidden"]),
    );
    expect(res.rows.map((r) => r.id)).not.toContain(target);
  });

  it("substring-matches the name by default (discoverable defaults to true)", async () => {
    const db = getDb();
    const searcher = await createUser(db, "SearchDisc");
    const target = await createUser(db, "ZzDiscoverableName");

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
  it("a user can file a report against someone they share a conversation with", async () => {
    const db = getDb();
    const a = await createUser(db, "ReportA");
    const b = await createUser(db, "ReportB");
    const convId = await startConv(a, b);

    await asUser(db, a, async () => {
      await db.query(
        `insert into public.connect_reports (reporter, reported_user, conversation_id, reason)
         values ($1, $2, $3, 'spam')`,
        [a, b, convId],
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

  it("rejects reporting a user when the reporter does not share a conversation with them", async () => {
    const db = getDb();
    const a = await createUser(db, "ReportStrangerA");
    const stranger = await createUser(db, "ReportStrangerB");

    await asUser(db, a, async () => {
      await expect(
        db.query(
          `insert into public.connect_reports (reporter, reported_user, reason) values ($1, $2, 'stranger report')`,
          [a, stranger],
        ),
      ).rejects.toThrow(/row-level security|share a conversation/i);
    });
  });

  it("enforces at most one open report per (reporter, reported_user)", async () => {
    const db = getDb();
    const a = await createUser(db, "ReportDupA");
    const b = await createUser(db, "ReportDupB");
    await startConv(a, b);

    await asUser(db, a, async () => {
      await db.query(
        `insert into public.connect_reports (reporter, reported_user, reason) values ($1, $2, 'first report')`,
        [a, b],
      );
      await expect(
        db.query(
          `insert into public.connect_reports (reporter, reported_user, reason) values ($1, $2, 'second open report')`,
          [a, b],
        ),
      ).rejects.toThrow(/already have an open report|unique/i);
    });
  });

  it("rate-limits to 5 reports per day per user", async () => {
    const db = getDb();
    const reporter = await createUser(db, "ReportRlUser");
    const targets: string[] = [];
    for (let i = 0; i < 6; i++) {
      const t = await createUser(db, `ReportRlTarget${i}`);
      await startConv(reporter, t);
      targets.push(t);
    }

    await asUser(db, reporter, async () => {
      for (let i = 0; i < 5; i++) {
        await db.query(
          `insert into public.connect_reports (reporter, reported_user, reason) values ($1, $2, $3)`,
          [reporter, targets[i], `reason ${i}`],
        );
      }
      await expect(
        db.query(
          `insert into public.connect_reports (reporter, reported_user, reason) values ($1, $2, 'sixth')`,
          [reporter, targets[5]],
        ),
      ).rejects.toThrow(/RATE_LIMITED/);
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

// ═══════════════════════════════════════════════════════════════════════════
// Phase 2: Wardrobe & Outfit Sharing + Controlled Grants
// (migration 20261016000001_connect_phase2_sharing)
// ═══════════════════════════════════════════════════════════════════════════

async function createTestItem(
  ownerId: string,
  name: string,
  imagePath = `${ownerId}/${name.toLowerCase().replace(/\s+/g, "-")}.jpg`,
): Promise<string> {
  const db = getDb();
  return asUser(db, ownerId, async () => {
    await db.query(
      `insert into storage.objects (bucket_id, name) values ('wardrobe', $1)`,
      [imagePath],
    );
    const r = await db.query<{ id: string }>(
      `insert into public.wardrobe_items (user_id, name, category, primary_colour, image_path)
       values ($1, $2, 'tops', 'black', $3) returning id`,
      [ownerId, name, imagePath],
    );
    return r.rows[0].id;
  });
}

async function createTestOutfit(
  ownerId: string,
  name: string,
  itemIds: string[],
): Promise<string> {
  const db = getDb();
  return asUser(db, ownerId, async () => {
    const r = await db.query<{ id: string }>(
      `insert into public.outfits (user_id, name, occasion, source)
       values ($1, $2, 'casual', 'MANUAL') returning id`,
      [ownerId, name],
    );
    const outfitId = r.rows[0].id;
    for (let i = 0; i < itemIds.length; i++) {
      await db.query(
        `insert into public.outfit_items (outfit_id, item_id, user_id, position)
         values ($1, $2, $3, $4)`,
        [outfitId, itemIds[i], ownerId, i],
      );
    }
    return outfitId;
  });
}

describe("Phase 2: connect_message_attachments & shared item/outfit RLS", () => {
  it("allows sharing an owned item in a conversation without exposing unshared items", async () => {
    const db = getDb();
    const owner = await createUser(db, "ShareOwnerA");
    const partner = await createUser(db, "SharePartnerB");
    const outsider = await createUser(db, "ShareOutsiderC");

    const sharedPath = `${owner}/shared-jacket.jpg`;
    const privatePath = `${owner}/private-shirt.jpg`;
    const sharedItemId = await createTestItem(owner, "Shared Jacket", sharedPath);
    const privateItemId = await createTestItem(owner, "Private Shirt", privatePath);

    const convId = await startConv(owner, partner);
    await acceptConv(partner, convId);

    let msgId = "";
    await asUser(db, owner, async () => {
      const m = await db.query<{ id: string }>(
        `insert into public.connect_messages (conversation_id, sender_id, body)
         values ($1, $2, 'What do you think of this jacket?') returning id`,
        [convId, owner],
      );
      msgId = m.rows[0].id;

      await db.query(
        `insert into public.connect_message_attachments
           (message_id, conversation_id, owner_id, kind, item_id)
         values ($1, $2, $3, 'item', $4)`,
        [msgId, convId, owner, sharedItemId],
      );
    });

    // Partner can read the shared item via shared_wardrobe_items and its storage object, but NOT the private item
    await asUser(db, partner, async () => {
      const items = await db.query<{ id: string; name: string }>(
        `select id, name from public.shared_wardrobe_items where user_id = $1`,
        [owner],
      );
      expect(items.rows.map((r) => r.id)).toEqual([sharedItemId]);
      expect(items.rows.map((r) => r.id)).not.toContain(privateItemId);

      const objs = await db.query<{ name: string }>(
        `select name from storage.objects where bucket_id = 'wardrobe' and name in ($1, $2)`,
        [sharedPath, privatePath],
      );
      expect(objs.rows.map((r) => r.name)).toEqual([sharedPath]);
    });

    // Outsider cannot read the attachment or the shared item
    await asUser(db, outsider, async () => {
      const att = await db.query(
        `select id from public.connect_message_attachments where conversation_id = $1`,
        [convId],
      );
      expect(att.rows).toHaveLength(0);

      const items = await db.query(
        `select id from public.shared_wardrobe_items where id = $1`,
        [sharedItemId],
      );
      expect(items.rows).toHaveLength(0);
    });
  });

  it("allows sharing an owned outfit and grants read access to its constituent items", async () => {
    const db = getDb();
    const owner = await createUser(db, "OutfitOwner");
    const partner = await createUser(db, "OutfitPartner");

    const topId = await createTestItem(owner, "Linen Shirt");
    const pantsId = await createTestItem(owner, "Tailored Trousers");
    const unsharedShoeId = await createTestItem(owner, "Unshared Boots");
    const outfitId = await createTestOutfit(owner, "Friday Dinner", [topId, pantsId]);

    const convId = await startConv(owner, partner);
    await acceptConv(partner, convId);

    let attachmentId = "";
    await asUser(db, owner, async () => {
      const m = await db.query<{ id: string }>(
        `insert into public.connect_messages (conversation_id, sender_id, body)
         values ($1, $2, 'Friday look') returning id`,
        [convId, owner],
      );
      const a = await db.query<{ id: string }>(
        `insert into public.connect_message_attachments
           (message_id, conversation_id, owner_id, kind, outfit_id)
         values ($1, $2, $3, 'outfit', $4) returning id`,
        [m.rows[0].id, convId, owner, outfitId],
      );
      attachmentId = a.rows[0].id;
    });

    await asUser(db, partner, async () => {
      const outfits = await db.query<{ id: string; name: string }>(
        `select id, name from public.outfits where id = $1`,
        [outfitId],
      );
      expect(outfits.rows).toHaveLength(1);

      const links = await db.query<{ item_id: string }>(
        `select item_id from public.outfit_items where outfit_id = $1 order by position`,
        [outfitId],
      );
      expect(links.rows.map((r) => r.item_id)).toEqual([topId, pantsId]);

      const visibleItems = await db.query<{ id: string }>(
        `select id from public.shared_wardrobe_items where user_id = $1`,
        [owner],
      );
      expect(visibleItems.rows.map((r) => r.id).sort()).toEqual([topId, pantsId].sort());
      expect(visibleItems.rows.map((r) => r.id)).not.toContain(unsharedShoeId);
    });

    // Revoking the outfit attachment immediately blocks reading the outfit and its items
    await asUser(db, owner, async () => {
      await db.query(
        `update public.connect_message_attachments set revoked_at = now() where id = $1`,
        [attachmentId],
      );
    });

    await asUser(db, partner, async () => {
      const outfits = await db.query(`select id from public.outfits where id = $1`, [outfitId]);
      expect(outfits.rows).toHaveLength(0);

      const visibleItems = await db.query(
        `select id from public.shared_wardrobe_items where user_id = $1`,
        [owner],
      );
      expect(visibleItems.rows).toHaveLength(0);
    });
  });

  it("rejects sharing another user's item or outfit, and blocks recipient from mutating shared items", async () => {
    const db = getDb();
    const owner = await createUser(db, "GuardOwner");
    const attacker = await createUser(db, "GuardAttacker");

    const ownerItemId = await createTestItem(owner, "Owner Blazer");
    const convId = await startConv(owner, attacker);
    await acceptConv(attacker, convId);

    // Attacker tries to attach owner's item to attacker's own message
    await asUser(db, attacker, async () => {
      const m = await db.query<{ id: string }>(
        `insert into public.connect_messages (conversation_id, sender_id, body)
         values ($1, $2, 'stealing item') returning id`,
        [convId, attacker],
      );
      await expect(
        db.query(
          `insert into public.connect_message_attachments
             (message_id, conversation_id, owner_id, kind, item_id)
           values ($1, $2, $3, 'item', $4)`,
          [m.rows[0].id, convId, attacker, ownerItemId],
        ),
      ).rejects.toThrow(/only share clothing items that you own/i);
    });

    // Owner legitimately shares the item
    await asUser(db, owner, async () => {
      const m = await db.query<{ id: string }>(
        `insert into public.connect_messages (conversation_id, sender_id, body)
         values ($1, $2, 'here is my blazer') returning id`,
        [convId, owner],
      );
      await db.query(
        `insert into public.connect_message_attachments
           (message_id, conversation_id, owner_id, kind, item_id)
         values ($1, $2, $3, 'item', $4)`,
        [m.rows[0].id, convId, owner, ownerItemId],
      );
    });

    // Recipient cannot update or delete the shared item
    await asUser(db, attacker, async () => {
      const upd = await db.query(
        `update public.wardrobe_items set name = 'Hacked', status = 'IN_LAUNDRY' where id = $1`,
        [ownerItemId],
      );
      expect(upd.affectedRows).toBe(0);

      const del = await db.query(
        `delete from public.wardrobe_items where id = $1`,
        [ownerItemId],
      );
      expect(del.affectedRows).toBe(0);
    });

    const check = await db.query<{ name: string; status: string }>(
      `select name, status from public.wardrobe_items where id = $1`,
      [ownerItemId],
    );
    expect(check.rows[0]).toEqual({ name: "Owner Blazer", status: "CLEAN" });
  });
});

describe("Phase 2: connect_wardrobe_grants & connect_grant_items", () => {
  it("supports selected_items and wardrobe scopes with immediate revocation", async () => {
    const db = getDb();
    const owner = await createUser(db, "GrantOwner");
    const stylist = await createUser(db, "GrantStylist");

    const item1 = await createTestItem(owner, "Silk Blouse");
    const item2 = await createTestItem(owner, "Denim Skirt");
    const item3 = await createTestItem(owner, "Cashmere Coat");

    // 1. Owner creates a selected_items grant with only item1 and item2
    let grantId = "";
    await asUser(db, owner, async () => {
      const g = await db.query<{ id: string }>(
        `insert into public.connect_wardrobe_grants
           (owner_id, grantee_id, scope, can_view_items, can_recommend)
         values ($1, $2, 'selected_items', true, true) returning id`,
        [owner, stylist],
      );
      grantId = g.rows[0].id;

      await db.query(
        `insert into public.connect_grant_items (grant_id, item_id, owner_id)
         values ($1, $2, $4), ($1, $3, $4)`,
        [grantId, item1, item2, owner],
      );
    });

    // Stylist sees only item1 and item2 via shared_wardrobe_items
    await asUser(db, stylist, async () => {
      const items = await db.query<{ id: string }>(
        `select id from public.shared_wardrobe_items where user_id = $1`,
        [owner],
      );
      expect(items.rows.map((r) => r.id).sort()).toEqual([item1, item2].sort());
    });

    // 2. Owner upgrades scope to 'wardrobe' -> stylist now sees all 3 items
    await asUser(db, owner, async () => {
      await db.query(
        `update public.connect_wardrobe_grants set scope = 'wardrobe' where id = $1`,
        [grantId],
      );
    });

    await asUser(db, stylist, async () => {
      const items = await db.query<{ id: string }>(
        `select id from public.shared_wardrobe_items where user_id = $1`,
        [owner],
      );
      expect(items.rows.map((r) => r.id).sort()).toEqual([item1, item2, item3].sort());
    });

    // 3. Owner revokes grant -> stylist immediately sees 0 items and cannot see the revoked grant
    await asUser(db, owner, async () => {
      await db.query(
        `update public.connect_wardrobe_grants set revoked_at = now() where id = $1`,
        [grantId],
      );
    });

    await asUser(db, stylist, async () => {
      const items = await db.query<{ id: string }>(
        `select id from public.shared_wardrobe_items where user_id = $1`,
        [owner],
      );
      expect(items.rows).toHaveLength(0);

      const grants = await db.query<{ id: string }>(
        `select id from public.connect_wardrobe_grants where id = $1`,
        [grantId],
      );
      expect(grants.rows).toHaveLength(0);
    });
  });

  it("blocks access immediately when owner or grantee blocks the other", async () => {
    const db = getDb();
    const owner = await createUser(db, "BlockGrantOwner");
    const grantee = await createUser(db, "BlockGrantGrantee");
    const itemId = await createTestItem(owner, "Wool Sweater");

    await asUser(db, owner, async () => {
      await db.query(
        `insert into public.connect_wardrobe_grants
           (owner_id, grantee_id, scope, can_view_items)
         values ($1, $2, 'wardrobe', true)`,
        [owner, grantee],
      );
    });

    // Before block, grantee can read via shared_wardrobe_items
    await asUser(db, grantee, async () => {
      const r = await db.query(`select id from public.shared_wardrobe_items where id = $1`, [itemId]);
      expect(r.rows).toHaveLength(1);
    });

    // Owner blocks grantee
    await asUser(db, owner, async () => {
      await db.query(
        `insert into public.connect_blocks (blocker, blocked) values ($1, $2)`,
        [owner, grantee],
      );
    });

    // After block, grantee immediately loses read access
    await asUser(db, grantee, async () => {
      const r = await db.query(`select id from public.shared_wardrobe_items where id = $1`, [itemId]);
      expect(r.rows).toHaveLength(0);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Round 3 Hardening Attack Tests (migration 20261016000002_connect_hardening_round3)
// ═══════════════════════════════════════════════════════════════════════════

describe("Round 3 #1: connect_conversations UPDATE lockdown", () => {
  it("revokes UPDATE on connect_conversations from anon and authenticated", async () => {
    const db = getDb();
    const priv = await db.query<{ auth: boolean; anon: boolean }>(
      `select
         has_table_privilege('authenticated', 'public.connect_conversations', 'update') as auth,
         has_table_privilege('anon',          'public.connect_conversations', 'update') as anon`,
    );
    expect(priv.rows[0]).toEqual({ auth: false, anon: false });
  });

  it("requester cannot set status or requester directly; recipient cannot either", async () => {
    const db = getDb();
    const requester = await createUser(db, "UpdLockReq");
    const recipient = await createUser(db, "UpdLockRecip");
    const convId = await startConv(requester, recipient);

    // Requester tries to force status = 'active' or swap requester
    await asUser(db, requester, async () => {
      await expect(
        db.query(
          `update public.connect_conversations set status = 'active' where id = $1`,
          [convId],
        ),
      ).rejects.toThrow();

      await expect(
        db.query(
          `update public.connect_conversations set requester = $1 where id = $2`,
          [recipient, convId],
        ),
      ).rejects.toThrow();
    });

    // Recipient tries to update status or requester directly without accept_conversation RPC
    await asUser(db, recipient, async () => {
      await expect(
        db.query(
          `update public.connect_conversations set status = 'active' where id = $1`,
          [convId],
        ),
      ).rejects.toThrow();

      await expect(
        db.query(
          `update public.connect_conversations set requester = $1 where id = $2`,
          [recipient, convId],
        ),
      ).rejects.toThrow();
    });

    const check = await db.query<{ status: string; requester: string }>(
      `select status, requester from public.connect_conversations where id = $1`,
      [convId],
    );
    expect(check.rows[0]).toEqual({ status: "pending", requester });
  });

  it("recipient can decline a pending request via decline_conversation RPC, but requester cannot", async () => {
    const db = getDb();
    const requester = await createUser(db, "DeclineReq");
    const recipient = await createUser(db, "DeclineRecip");
    const convId = await startConv(requester, recipient);

    await asUser(db, requester, async () => {
      await expect(
        db.query(`select public.decline_conversation($1)`, [convId]),
      ).rejects.toThrow(/only the recipient/i);
    });

    await asUser(db, recipient, async () => {
      await db.query(`select public.decline_conversation($1)`, [convId]);
    });

    const check = await db.query(`select id from public.connect_conversations where id = $1`, [
      convId,
    ]);
    expect(check.rows).toHaveLength(0);
  });
});

describe("Round 3 #2: pending request_messages_sent monotonic counter", () => {
  it("send, delete, resend in a pending conversation must fail", async () => {
    const db = getDb();
    const requester = await createUser(db, "MonotonicReq");
    const recipient = await createUser(db, "MonotonicRecip");
    const convId = await startConv(requester, recipient);

    // 1. Send first message in pending conversation
    let msgId = "";
    await asUser(db, requester, async () => {
      const r = await db.query<{ id: string }>(
        `insert into public.connect_messages (conversation_id, sender_id, body)
         values ($1, $2, 'first intro') returning id`,
        [convId, requester],
      );
      msgId = r.rows[0].id;
    });

    const afterSend = await db.query<{ request_messages_sent: number }>(
      `select request_messages_sent from public.connect_conversations where id = $1`,
      [convId],
    );
    expect(afterSend.rows[0].request_messages_sent).toBe(1);

    // 2. Delete the sent message
    await asUser(db, requester, async () => {
      const del = await db.query(`delete from public.connect_messages where id = $1`, [msgId]);
      expect(del.affectedRows).toBe(1);
    });

    const afterDel = await db.query<{ request_messages_sent: number }>(
      `select request_messages_sent from public.connect_conversations where id = $1`,
      [convId],
    );
    expect(afterDel.rows[0].request_messages_sent).toBe(1);

    // 3. Attempt to resend while still pending must fail
    await asUser(db, requester, async () => {
      await expect(
        db.query(
          `insert into public.connect_messages (conversation_id, sender_id, body)
           values ($1, $2, 'resend after delete')`,
          [convId, requester],
        ),
      ).rejects.toThrow(/one message until/i);
    });
  });
});

describe("Round 3 #4: connect_is_blocked revoked from authenticated", () => {
  it("authenticated and anon cannot execute connect_is_blocked directly", async () => {
    const db = getDb();
    const priv = await db.query<{ auth: boolean; anon: boolean }>(
      `select
         has_function_privilege('authenticated', 'public.connect_is_blocked(uuid, uuid)', 'execute') as auth,
         has_function_privilege('anon',          'public.connect_is_blocked(uuid, uuid)', 'execute') as anon`,
    );
    expect(priv.rows[0]).toEqual({ auth: false, anon: false });

    const u1 = await createUser(db, "BlockProbe1");
    const u2 = await createUser(db, "BlockProbe2");
    await asUser(db, u1, async () => {
      await expect(
        db.query(`select public.connect_is_blocked($1, $2)`, [u1, u2]),
      ).rejects.toThrow();
    });
  });
});

describe("Round 3 #6: connect_search_users min 2 chars, wildcard escaping & rate event cleanup", () => {
  it("rejects/ignores name searches shorter than 2 characters and matches 2+ characters", async () => {
    const db = getDb();
    const searcher = await createUser(db, "MinLenSearcher");
    const target = await createUser(db, "AbShortTarget");

    const res1 = await asUser(db, searcher, async () =>
      db.query<{ id: string }>(`select * from public.connect_search_users($1)`, ["A"]),
    );
    expect(res1.rows.map((r) => r.id)).not.toContain(target);

    const res2 = await asUser(db, searcher, async () =>
      db.query<{ id: string }>(`select * from public.connect_search_users($1)`, ["Ab"]),
    );
    expect(res2.rows.map((r) => r.id)).toContain(target);

    const res3 = await asUser(db, searcher, async () =>
      db.query<{ id: string }>(`select * from public.connect_search_users($1)`, ["AbS"]),
    );
    expect(res3.rows.map((r) => r.id)).toContain(target);
  });

  it("escapes %, _ and \\ in search terms so wildcards cannot dump all discoverable users", async () => {
    const db = getDb();
    const searcher = await createUser(db, "WildcardSearcher");
    const normalDisc = await createUser(db, "NormalDiscoverableUser");
    const literalSpecial = await createUser(db, "Lit%User_With\\Special");
    await db.query(`update public.profiles set discoverable = true where id in ($1, $2)`, [
      normalDisc,
      literalSpecial,
    ]);

    // Searching "%%%" or "___" must NOT match NormalDiscoverableUser
    const pctRes = await asUser(db, searcher, async () =>
      db.query<{ id: string }>(`select * from public.connect_search_users($1)`, ["%%%"]),
    );
    expect(pctRes.rows.map((r) => r.id)).not.toContain(normalDisc);

    const underRes = await asUser(db, searcher, async () =>
      db.query<{ id: string }>(`select * from public.connect_search_users($1)`, ["___"]),
    );
    expect(underRes.rows.map((r) => r.id)).not.toContain(normalDisc);

    // Searching literal "Lit%User" or "With\Special" matches only the user with those literal chars
    const litPct = await asUser(db, searcher, async () =>
      db.query<{ id: string }>(`select * from public.connect_search_users($1)`, ["Lit%User"]),
    );
    expect(litPct.rows.map((r) => r.id)).toContain(literalSpecial);
    expect(litPct.rows.map((r) => r.id)).not.toContain(normalDisc);

    const litBackslash = await asUser(db, searcher, async () =>
      db.query<{ id: string }>(`select * from public.connect_search_users($1)`, ["With\\Special"]),
    );
    expect(litBackslash.rows.map((r) => r.id)).toContain(literalSpecial);
  });

  it("opportunistically deletes connect_rate_events older than 2 days", async () => {
    const db = getDb();
    const user = await createUser(db, "CleanupRateUser");

    const inserted = await db.query<{ id: string }>(
      `insert into public.connect_rate_events (user_id, action, created_at)
       values ($1, 'search', now() - interval '3 days') returning id`,
      [user],
    );
    const staleId = inserted.rows[0].id;

    // Trigger connect_check_rate_limit via a search call
    await asUser(db, user, async () => {
      await db.query(`select * from public.connect_search_users($1)`, ["CLOS-CLEANUP1"]);
    });

    const check = await db.query(
      `select id from public.connect_rate_events where id = $1`,
      [staleId],
    );
    expect(check.rows).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Round 4 Hardening Attack Tests (migration 20261018000003_connect_hardening_round4)
// ═══════════════════════════════════════════════════════════════════════════

describe("Round 4 #1: Path forgery protection on wardrobe_items, outfits & storage", () => {
  it("rejects updating own item image_path, thumbnail_path, medium_path, original_image_path, or beautified_image_path to another user's path or '..' and keeps can_access_storage_object false", async () => {
    const db = getDb();
    const victim = await createUser(db, "PathVictim");
    const attacker = await createUser(db, "PathAttacker");
    const accomplice = await createUser(db, "PathAccomplice");

    const victimSecretPath = `${victim}/secret-passport.jpg`;
    await createTestItem(victim, "Victim Jacket", victimSecretPath);
    const attackerItemId = await createTestItem(attacker, "Attacker Shirt", `${attacker}/legit.jpg`);

    // Attacker grants accomplice full wardrobe access in hopes of exfiltrating victim's file via path forgery
    await asUser(db, attacker, async () => {
      await db.query(
        `insert into public.connect_wardrobe_grants (owner_id, grantee_id, scope, can_view_items)
         values ($1, $2, 'wardrobe', true)`,
        [attacker, accomplice],
      );
    });

    await asUser(db, attacker, async () => {
      // 1. Forging image_path to victim's path
      await expect(
        db.query(`update public.wardrobe_items set image_path = $1 where id = $2`, [
          victimSecretPath,
          attackerItemId,
        ]),
      ).rejects.toThrow(/image_path must reside inside the owner folder/i);

      // 2. Forging image_path with '..' traversal inside own prefix
      await expect(
        db.query(`update public.wardrobe_items set image_path = $1 where id = $2`, [
          `${attacker}/../${victim}/secret-passport.jpg`,
          attackerItemId,
        ]),
      ).rejects.toThrow(/image_path must reside inside the owner folder/i);

      // 3. Forging thumbnail_path to victim's path
      await expect(
        db.query(`update public.wardrobe_items set thumbnail_path = $1 where id = $2`, [
          victimSecretPath,
          attackerItemId,
        ]),
      ).rejects.toThrow(/thumbnail_path must reside inside the owner folder/i);

      // 4. Forging medium_path to victim's path
      await expect(
        db.query(`update public.wardrobe_items set medium_path = $1 where id = $2`, [
          victimSecretPath,
          attackerItemId,
        ]),
      ).rejects.toThrow(/medium_path must reside inside the owner folder/i);

      // 5. Forging original_image_path without a '/' (previously skipped exception now removed)
      await expect(
        db.query(`update public.wardrobe_items set original_image_path = 'plain-no-slash.jpg' where id = $1`, [
          attackerItemId,
        ]),
      ).rejects.toThrow(/original_image_path must reside inside the owner folder/i);

      // 6. Forging original_image_path to victim's path
      await expect(
        db.query(`update public.wardrobe_items set original_image_path = $1 where id = $2`, [
          victimSecretPath,
          attackerItemId,
        ]),
      ).rejects.toThrow(/original_image_path must reside inside the owner folder/i);

      // 7. Forging beautified_image_path to victim's path
      await expect(
        db.query(`update public.wardrobe_items set beautified_image_path = $1 where id = $2`, [
          victimSecretPath,
          attackerItemId,
        ]),
      ).rejects.toThrow(/beautified_image_path must reside inside the owner folder/i);
    });

    // Rejects outfits.photo_path forgery on INSERT and UPDATE
    await asUser(db, attacker, async () => {
      await expect(
        db.query(
          `insert into public.outfits (user_id, name, photo_path) values ($1, 'Forged Look', $2)`,
          [attacker, victimSecretPath],
        ),
      ).rejects.toThrow(/photo_path must reside inside the owner folder/i);

      await expect(
        db.query(
          `insert into public.outfits (user_id, name, photo_path) values ($1, 'Traversal Look', $2)`,
          [attacker, `${attacker}/../${victim}/secret-passport.jpg`],
        ),
      ).rejects.toThrow(/photo_path must reside inside the owner folder/i);

      const o = await db.query<{ id: string }>(
        `insert into public.outfits (user_id, name, photo_path) values ($1, 'Valid Look', $2) returning id`,
        [attacker, `${attacker}/outfit.jpg`],
      );
      await expect(
        db.query(`update public.outfits set photo_path = $1 where id = $2`, [
          victimSecretPath,
          o.rows[0].id,
        ]),
      ).rejects.toThrow(/photo_path must reside inside the owner folder/i);
    });

    // Verify can_access_storage_object stays false for both attacker and accomplice
    await asUser(db, attacker, async () => {
      const r = await db.query<{ ok: boolean }>(
        `select public.can_access_storage_object($1) as ok`,
        [victimSecretPath],
      );
      expect(r.rows[0].ok).toBe(false);
    });

    await asUser(db, accomplice, async () => {
      const r = await db.query<{ ok: boolean }>(
        `select public.can_access_storage_object($1) as ok`,
        [victimSecretPath],
      );
      expect(r.rows[0].ok).toBe(false);
    });
  });
});

describe("Round 4 #2: shared_wardrobe_items view & wardrobe_items_select_shared removal", () => {
  it("exposes only the 13 allowed columns in shared_wardrobe_items and prevents grantees from reading status, wear_count, last_worn_at, care_type, original_* or beautification_*", async () => {
    const db = getDb();
    const owner = await createUser(db, "ViewOwner");
    const grantee = await createUser(db, "ViewGrantee");

    const res = await db.query<{ id: string }>(
      `insert into public.wardrobe_items (
         user_id, name, category, subcategory, primary_colour, secondary_colours,
         pattern, material, style, image_path, thumbnail_path, medium_path,
         status, wear_count, last_worn_at, care_type,
         original_image_path, beautified_image_path, beautification_mode, beautification_status
       ) values (
         $1, 'Silk Trench', 'outerwear', 'trench', 'beige', array['black'],
         'solid', 'silk', 'classic', $2, $3, $4,
         'DIRTY', 17, now(), 'WASHABLE',
         $5, $2, 'ai-enhance', 'COMPLETED'
       ) returning id`,
      [
        owner,
        `${owner}/beautified.png`,
        `${owner}/thumb.webp`,
        `${owner}/medium.webp`,
        `${owner}/raw-messy-bedroom.jpg`,
      ],
    );
    const itemId = res.rows[0].id;

    await asUser(db, owner, async () => {
      await db.query(
        `insert into public.connect_wardrobe_grants (owner_id, grantee_id, scope, can_view_items)
         values ($1, $2, 'wardrobe', true)`,
        [owner, grantee],
      );
    });

    // 1. Inspect information_schema.columns on shared_wardrobe_items
    const colRes = await db.query<{ column_name: string }>(
      `select column_name
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'shared_wardrobe_items'
       order by ordinal_position`,
    );
    expect(colRes.rows.map((r) => r.column_name)).toEqual([
      "id",
      "user_id",
      "name",
      "category",
      "subcategory",
      "primary_colour",
      "secondary_colours",
      "pattern",
      "material",
      "style",
      "image_path",
      "thumbnail_path",
      "medium_path",
    ]);

    // 2. Grantee CANNOT read from public.wardrobe_items directly (wardrobe_items_select_shared is gone)
    await asUser(db, grantee, async () => {
      const directRows = await db.query(
        `select id, status, wear_count, last_worn_at, care_type, original_image_path, beautified_image_path, beautification_mode, beautification_status
         from public.wardrobe_items
         where id = $1`,
        [itemId],
      );
      expect(directRows.rows).toHaveLength(0);

      // 3. Attempting to select private columns from shared_wardrobe_items fails with undefined_column
      for (const forbiddenCol of [
        "status",
        "wear_count",
        "last_worn_at",
        "care_type",
        "original_image_path",
        "beautified_image_path",
        "beautification_mode",
        "beautification_status",
        "beautification_provider",
        "beautification_model",
      ]) {
        await expect(
          db.query(`select ${forbiddenCol} from public.shared_wardrobe_items where id = $1`, [itemId]),
        ).rejects.toThrow(/column .* does not exist/i);
      }

      // 4. Grantee CAN read the 13 allowed columns from shared_wardrobe_items
      const sharedRows = await db.query<Record<string, unknown>>(
        `select * from public.shared_wardrobe_items where id = $1`,
        [itemId],
      );
      expect(sharedRows.rows).toHaveLength(1);
      expect(Object.keys(sharedRows.rows[0]).sort()).toEqual(
        [
          "id",
          "user_id",
          "name",
          "category",
          "subcategory",
          "primary_colour",
          "secondary_colours",
          "pattern",
          "material",
          "style",
          "image_path",
          "thumbnail_path",
          "medium_path",
        ].sort(),
      );
    });
  });
});

describe("Round 4 #3: Hidden categories (Underwear, Intimates, Swimwear) & per-grant excluded_categories", () => {
  it("never exposes Underwear, Intimates, or Swimwear through wardrobe grants or message attachments, and enforces per-grant excluded_categories", async () => {
    const db = getDb();
    const owner = await createUser(db, "HiddenCatOwner");
    const grantee = await createUser(db, "HiddenCatGrantee");

    const insertCatItem = async (name: string, category: string, subcategory: string | null = null) => {
      const path = `${owner}/${crypto.randomUUID()}.jpg`;
      const r = await db.query<{ id: string }>(
        `insert into public.wardrobe_items (user_id, name, category, subcategory, image_path)
         values ($1, $2, $3, $4, $5) returning id`,
        [owner, name, category, subcategory, path],
      );
      return { id: r.rows[0].id, path };
    };

    const shirt = await insertCatItem("Oxford Shirt", "shirts");
    const coat = await insertCatItem("Wool Overcoat", "outerwear");
    const sneakers = await insertCatItem("White Sneakers", "shoes");
    const underwear = await insertCatItem("Cotton Briefs", "Underwear");
    const intimates = await insertCatItem("Silk Bralette", "Intimates");
    const swimwear = await insertCatItem("Beach Trunks", "Swimwear");
    const subcatSwim = await insertCatItem("Resort One-Piece", "activewear", "Swimwear");

    // 1. Grant scope='wardrobe' with excluded_categories = ['outerwear']
    let grantId = "";
    await asUser(db, owner, async () => {
      const g = await db.query<{ id: string }>(
        `insert into public.connect_wardrobe_grants
           (owner_id, grantee_id, scope, can_view_items, excluded_categories)
         values ($1, $2, 'wardrobe', true, array['outerwear']) returning id`,
        [owner, grantee],
      );
      grantId = g.rows[0].id;
    });

    // Grantee sees shirt and sneakers, but NOT coat (excluded_categories) and NOT underwear/intimates/swimwear
    await asUser(db, grantee, async () => {
      const rows = await db.query<{ id: string }>(
        `select id from public.shared_wardrobe_items where user_id = $1`,
        [owner],
      );
      const visibleIds = rows.rows.map((r) => r.id);
      expect(visibleIds.sort()).toEqual([shirt.id, sneakers.id].sort());
      expect(visibleIds).not.toContain(coat.id);
      expect(visibleIds).not.toContain(underwear.id);
      expect(visibleIds).not.toContain(intimates.id);
      expect(visibleIds).not.toContain(swimwear.id);
      expect(visibleIds).not.toContain(subcatSwim.id);
    });

    // Updating excluded_categories to also exclude 'shoes' hides sneakers too
    await asUser(db, owner, async () => {
      await db.query(
        `update public.connect_wardrobe_grants
            set excluded_categories = array['outerwear', 'shoes']
          where id = $1`,
        [grantId],
      );
    });

    await asUser(db, grantee, async () => {
      const rows = await db.query<{ id: string }>(
        `select id from public.shared_wardrobe_items where user_id = $1`,
        [owner],
      );
      expect(rows.rows.map((r) => r.id)).toEqual([shirt.id]);
    });

    // 2. Even if owner attaches Underwear/Intimates/Swimwear in an active conversation,
    //    can_access_wardrobe_item, shared_wardrobe_items, and can_access_storage_object stay false!
    const convId = await startConv(owner, grantee);
    await acceptConv(grantee, convId);

    await asUser(db, owner, async () => {
      const m = await db.query<{ id: string }>(
        `insert into public.connect_messages (conversation_id, sender_id, body)
         values ($1, $2, 'trying to attach hidden categories') returning id`,
        [convId, owner],
      );
      await db.query(
        `insert into public.connect_message_attachments (message_id, conversation_id, owner_id, kind, item_id)
         values ($1, $2, $3, 'item', $4),
                ($1, $2, $3, 'item', $5),
                ($1, $2, $3, 'item', $6)`,
        [m.rows[0].id, convId, owner, underwear.id, intimates.id, swimwear.id],
      );
    });

    await asUser(db, grantee, async () => {
      for (const hidden of [underwear, intimates, swimwear, subcatSwim]) {
        const access = await db.query<{ ok: boolean }>(
          `select public.can_access_wardrobe_item($1, $2) as ok`,
          [hidden.id, owner],
        );
        expect(access.rows[0].ok).toBe(false);

        const storageAccess = await db.query<{ ok: boolean }>(
          `select public.can_access_storage_object($1) as ok`,
          [hidden.path],
        );
        expect(storageAccess.rows[0].ok).toBe(false);
      }

      const sharedView = await db.query<{ id: string }>(
        `select id from public.shared_wardrobe_items where id in ($1, $2, $3, $4)`,
        [underwear.id, intimates.id, swimwear.id, subcatSwim.id],
      );
      expect(sharedView.rows).toHaveLength(0);
    });
  });
});

describe("Round 4 #4: Attachments limited to 6 per message and forbidden in pending conversations", () => {
  it("rejects any attachment on a message in a pending conversation and limits attachments to at most 6 per message in an active conversation", async () => {
    const db = getDb();
    const sender = await createUser(db, "AttLimitSender");
    const recipient = await createUser(db, "AttLimitRecipient");

    const itemIds: string[] = [];
    for (let i = 0; i < 7; i++) {
      itemIds.push(await createTestItem(sender, `Piece ${i + 1}`));
    }

    // 1. Start conversation (status = 'pending') and send the 1 allowed intro message
    const convId = await startConv(sender, recipient);
    let pendingMsgId = "";
    await asUser(db, sender, async () => {
      const m = await db.query<{ id: string }>(
        `insert into public.connect_messages (conversation_id, sender_id, body)
         values ($1, $2, 'Hello in pending request') returning id`,
        [convId, sender],
      );
      pendingMsgId = m.rows[0].id;

      // Attaching even 1 item while conversation status='pending' is rejected
      await expect(
        db.query(
          `insert into public.connect_message_attachments
             (message_id, conversation_id, owner_id, kind, item_id)
           values ($1, $2, $3, 'item', $4)`,
          [pendingMsgId, convId, sender, itemIds[0]],
        ),
      ).rejects.toThrow(/pending/i);
    });

    // 2. Recipient accepts conversation (status = 'active')
    await acceptConv(recipient, convId);

    await asUser(db, sender, async () => {
      const m = await db.query<{ id: string }>(
        `insert into public.connect_messages (conversation_id, sender_id, body)
         values ($1, $2, 'Here are 6 items') returning id`,
        [convId, sender],
      );
      const activeMsgId = m.rows[0].id;

      // Attaching 6 items succeeds
      for (let i = 0; i < 6; i++) {
        await db.query(
          `insert into public.connect_message_attachments
             (message_id, conversation_id, owner_id, kind, item_id)
           values ($1, $2, $3, 'item', $4)`,
          [activeMsgId, convId, sender, itemIds[i]],
        );
      }

      // 7th attachment on the same message is rejected
      await expect(
        db.query(
          `insert into public.connect_message_attachments
             (message_id, conversation_id, owner_id, kind, item_id)
           values ($1, $2, $3, 'item', $4)`,
          [activeMsgId, convId, sender, itemIds[6]],
        ),
      ).rejects.toThrow(/at most 6 attachments/i);
    });
  });
});



