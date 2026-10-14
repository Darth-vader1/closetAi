import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asAnon, asService, asUser, createTestDb, createUser } from "./harness";

/**
 * Regression tests for the WhatsApp verification audit. Every "cannot" test below was a real,
 * reproduced hole against migration 20261013000001/3 before 20261014000001 closed it.
 */

let db: PGlite;
let alice: string;
let bob: string;
let carol: string;

const svc = <T extends Record<string, unknown> = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  asService(db, async () => (await db.query<T>(sql, params)).rows);

const prefs = async (userId: string) =>
  (
    await svc<{
      whatsapp_phone_verified: boolean;
      whatsapp_phone_verified_at: string | null;
      whatsapp_phone: string | null;
    }>(`select whatsapp_phone_verified, whatsapp_phone_verified_at, whatsapp_phone from public.email_preferences where user_id = $1`, [
      userId,
    ])
  )[0];

async function setPhone(userId: string, phone: string, enabled = true) {
  await svc(`update public.email_preferences set whatsapp_phone = $2, whatsapp_enabled = $3 where user_id = $1`, [
    userId,
    phone,
    enabled,
  ]);
}

const inMinutes = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

async function start(userId: string, hash: string, expires = inMinutes(10)) {
  return svc<{ out_verification_id: string; out_phone_digits: string }>(
    `select * from public.start_whatsapp_verification($1, $2, 'CLOSET', $3)`,
    [userId, hash, expires],
  );
}

async function verifyByUser(userId: string, hash: string) {
  return (
    await svc<{ out_success: boolean; out_message: string; out_user_id: string | null }>(
      `select * from public.verify_whatsapp_code($1, $2, null)`,
      [hash, userId],
    )
  )[0];
}

async function verifyByPhone(digits: string, hash: string) {
  return (
    await svc<{ out_success: boolean; out_message: string; out_user_id: string | null }>(
      `select * from public.verify_whatsapp_code($1, null, $2)`,
      [hash, digits],
    )
  )[0];
}

async function resetPrefs(userId: string) {
  await svc(
    `update public.email_preferences set whatsapp_phone = null, whatsapp_enabled = false, whatsapp_phone_verified = false,
       whatsapp_phone_verified_at = null where user_id = $1`,
    [userId],
  );
  await svc(`delete from public.whatsapp_verifications where user_id = $1`, [userId]);
}

beforeAll(async () => {
  db = await createTestDb();
  alice = await createUser(db, "Alice");
  bob = await createUser(db, "Bob");
  carol = await createUser(db, "Carol");
});

afterAll(async () => {
  await db.close();
});

describe("email_preferences verification columns are server-only", () => {
  it("rejects a user setting their own whatsapp_phone_verified", async () => {
    await expect(
      asUser(db, alice, () =>
        db.query(`update public.email_preferences set whatsapp_phone_verified = true where user_id = $1`, [alice]),
      ),
    ).rejects.toThrow(/server/i);
    expect((await prefs(alice)).whatsapp_phone_verified).toBe(false);
  });

  it.each([
    ["whatsapp_phone_verified_at", `now()`],
    ["whatsapp_verification_attempts", `99`],
    ["whatsapp_verification_locked_until", `now()`],
    ["last_whatsapp_message_at", `now()`],
    ["whatsapp_last_inbound_at", `now()`],
  ])("rejects a user writing %s", async (column, value) => {
    await expect(
      asUser(db, alice, () => db.query(`update public.email_preferences set ${column} = ${value} where user_id = $1`, [alice])),
    ).rejects.toThrow(/server/i);
  });

  it("forces verification fields back to defaults when a user deletes and re-inserts their own row", async () => {
    await asUser(db, bob, async () => {
      await db.query(`delete from public.email_preferences where user_id = $1`, [bob]);
      await db.query(
        `insert into public.email_preferences (user_id, whatsapp_phone, whatsapp_phone_verified, whatsapp_phone_verified_at, whatsapp_last_inbound_at)
         values ($1, '+2348011111111', true, now(), now())`,
        [bob],
      );
    });
    const row = (
      await svc<{ whatsapp_phone_verified: boolean; whatsapp_phone_verified_at: string | null; whatsapp_last_inbound_at: string | null }>(
        `select whatsapp_phone_verified, whatsapp_phone_verified_at, whatsapp_last_inbound_at from public.email_preferences where user_id = $1`,
        [bob],
      )
    )[0];
    expect(row.whatsapp_phone_verified).toBe(false);
    expect(row.whatsapp_phone_verified_at).toBeNull();
    expect(row.whatsapp_last_inbound_at).toBeNull();
    await resetPrefs(bob);
  });

  it("lets a user edit their own number, and changing the number drops verification", async () => {
    await setPhone(alice, "+2348022222222");
    await start(alice, "h1");
    expect((await verifyByUser(alice, "h1")).out_success).toBe(true);
    expect((await prefs(alice)).whatsapp_phone_verified).toBe(true);

    await asUser(db, alice, () =>
      db.query(`update public.email_preferences set whatsapp_phone = '+2348033333333' where user_id = $1`, [alice]),
    );
    const after = await prefs(alice);
    expect(after.whatsapp_phone_verified).toBe(false);
    expect(after.whatsapp_phone_verified_at).toBeNull();
    await resetPrefs(alice);
  });
});

describe("verification RPCs are not callable by end users or anonymous visitors", () => {
  it("blocks authenticated users from starting or verifying a code (self-verify bypass)", async () => {
    await setPhone(alice, "+2348044444444");
    await expect(
      asUser(db, alice, () => db.query(`select * from public.start_whatsapp_verification($1, 'deadbeef', 'CLOSET', $2)`, [alice, inMinutes(10)])),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asUser(db, alice, () => db.query(`select * from public.verify_whatsapp_code('deadbeef', $1, null)`, [alice])),
    ).rejects.toThrow(/permission denied/i);
    expect((await prefs(alice)).whatsapp_phone_verified).toBe(false);
  });

  it("blocks a user from verifying or locking out someone else", async () => {
    await expect(
      asUser(db, bob, () => db.query(`select * from public.verify_whatsapp_code('cafe', $1, null)`, [alice])),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asUser(db, bob, () => db.query(`select * from public.start_whatsapp_verification($1, 'x', 'CLOSET', $2)`, [alice, inMinutes(10)])),
    ).rejects.toThrow(/permission denied/i);
  });

  it("blocks anonymous callers", async () => {
    await expect(
      asAnon(db, () => db.query(`select * from public.start_whatsapp_verification($1, 'x', 'CLOSET', $2)`, [alice, inMinutes(10)])),
    ).rejects.toThrow(/permission denied/i);
    await expect(asAnon(db, () => db.query(`select * from public.verify_whatsapp_code('x', $1, null)`, [alice]))).rejects.toThrow(
      /permission denied/i,
    );
  });

  it("blocks end users and anon from the cleanup functions and the verification tables", async () => {
    for (const fn of ["cleanup_expired_verifications", "cleanup_old_webhook_messages"]) {
      await expect(asUser(db, alice, () => db.query(`select public.${fn}()`))).rejects.toThrow(/permission denied/i);
      await expect(asAnon(db, () => db.query(`select public.${fn}()`))).rejects.toThrow(/permission denied/i);
    }
    await expect(asUser(db, alice, () => db.query(`select * from public.whatsapp_verifications`))).rejects.toThrow(/permission denied/i);
    await expect(asUser(db, alice, () => db.query(`select * from public.whatsapp_webhook_messages`))).rejects.toThrow(/permission denied/i);
    await expect(asUser(db, alice, () => db.query(`select * from public.whatsapp_optouts`))).rejects.toThrow(/permission denied/i);
  });
});

describe("verification flow (server side)", () => {
  it("verifies a correct code once, and refuses a replay", async () => {
    await resetPrefs(alice);
    await setPhone(alice, "+2348055555551");
    await start(alice, "good-hash");
    const ok = await verifyByUser(alice, "good-hash");
    expect(ok).toMatchObject({ out_success: true, out_user_id: alice });
    expect((await prefs(alice)).whatsapp_phone_verified).toBe(true);
    expect((await verifyByUser(alice, "good-hash")).out_success).toBe(false);
  });

  it("verifies via the texted-in path using the sender's number", async () => {
    await resetPrefs(bob);
    await setPhone(bob, "+234 805 555 5552"); // typed with spaces; matched by digits
    await start(bob, "bob-hash");
    expect((await verifyByPhone("2348055555599", "bob-hash")).out_success).toBe(false);
    const ok = await verifyByPhone("2348055555552", "bob-hash");
    expect(ok).toMatchObject({ out_success: true, out_user_id: bob });
    expect((await prefs(bob)).whatsapp_phone_verified).toBe(true);
  });

  it("locks the code after 5 wrong attempts, even if the right code follows", async () => {
    await resetPrefs(carol);
    await setPhone(carol, "+2348055555553");
    await start(carol, "right");
    for (let i = 0; i < 5; i++) expect((await verifyByUser(carol, `wrong-${i}`)).out_success).toBe(false);
    const late = await verifyByUser(carol, "right");
    expect(late.out_success).toBe(false);
    expect(late.out_message).toMatch(/LOCKED/);
    expect((await prefs(carol)).whatsapp_phone_verified).toBe(false);
  });

  it("only the newest code is valid", async () => {
    await resetPrefs(carol);
    await setPhone(carol, "+2348055555553");
    await start(carol, "old");
    await start(carol, "new");
    expect((await verifyByUser(carol, "old")).out_success).toBe(false);
    expect((await verifyByUser(carol, "new")).out_success).toBe(true);
  });

  it("a code issued for one number is useless after the user changes number", async () => {
    await resetPrefs(carol);
    await setPhone(carol, "+2348066666661");
    await start(carol, "bound");
    await setPhone(carol, "+2348066666662");
    const res = await verifyByUser(carol, "bound");
    expect(res.out_success).toBe(false);
    expect((await prefs(carol)).whatsapp_phone_verified).toBe(false);
  });

  it("will not verify a number that another account already verified", async () => {
    // bob is verified on 2348055555552 from the earlier test.
    await resetPrefs(carol);
    await setPhone(carol, "+2348055555552");
    await expect(start(carol, "steal")).rejects.toThrow(/PHONE_IN_USE/);
  });

  it("rate limits starts per user (5/hour) and per number (3/day)", async () => {
    await resetPrefs(carol);
    await setPhone(carol, "+2348077777771");
    await start(carol, "a");
    await start(carol, "b");
    await start(carol, "c");
    await expect(start(carol, "d")).rejects.toThrow(/PHONE_RATE_LIMITED/);

    await resetPrefs(carol);
    for (let i = 0; i < 5; i++) {
      await setPhone(carol, `+23480888888${i}0`); // a different number each time avoids the per-number limit
      await start(carol, `u${i}`);
    }
    await setPhone(carol, "+2348099999999");
    await expect(start(carol, "u6")).rejects.toThrow(/RATE_LIMITED/);
    await resetPrefs(carol);
  });

  it("does not start verification for opted-out numbers, a missing number, or bad expiry", async () => {
    await resetPrefs(carol);
    await setPhone(carol, "+2348012300000");
    await svc(`insert into public.whatsapp_optouts (phone_digits) values ('2348012300000')`);
    await expect(start(carol, "x")).rejects.toThrow(/OPTED_OUT/);
    await svc(`delete from public.whatsapp_optouts`);

    await svc(`update public.email_preferences set whatsapp_phone = null where user_id = $1`, [carol]);
    await expect(start(carol, "x")).rejects.toThrow(/NO_PHONE/);

    await setPhone(carol, "+2348012300002", true);
    await expect(start(carol, "x", inMinutes(-1))).rejects.toThrow(/INVALID_EXPIRY/);
    await expect(start(carol, "x", inMinutes(600))).rejects.toThrow(/INVALID_EXPIRY/);
  });

  it("requires exactly one identifier when verifying", async () => {
    await expect(svc(`select * from public.verify_whatsapp_code('x', null, null)`)).rejects.toThrow(/EXACTLY_ONE/);
    await expect(svc(`select * from public.verify_whatsapp_code('x', $1, '2348000000000')`, [alice])).rejects.toThrow(/EXACTLY_ONE/);
  });
});

describe("care types", () => {
  it("rejects putting a non-washable item into the wash cycle", async () => {
    const watch = (
      await svc<{ id: string }>(
        `insert into public.wardrobe_items (user_id, name, category, image_path, care_type) values ($1, 'watch', 'watches', $2, 'NO_WASH') returning id`,
        [alice, `${alice}/watch.jpg`],
      )
    )[0].id;
    await expect(
      asUser(db, alice, () => db.query(`update public.wardrobe_items set status = 'DIRTY' where id = $1`, [watch])),
    ).rejects.toThrow(/Cannot set NO_WASH/);
  });

  it("wear_outfit keeps non-washable items CLEAN but still counts the wear", async () => {
    const tee = (
      await svc<{ id: string }>(
        `insert into public.wardrobe_items (user_id, name, category, image_path, care_type) values ($1, 'tee', 't-shirts', $2, 'WASHABLE') returning id`,
        [alice, `${alice}/tee.jpg`],
      )
    )[0].id;
    const belt = (
      await svc<{ id: string }>(
        `insert into public.wardrobe_items (user_id, name, category, image_path, care_type) values ($1, 'belt', 'belts', $2, 'NO_WASH') returning id`,
        [alice, `${alice}/belt.jpg`],
      )
    )[0].id;
    const outfit = (await svc<{ id: string }>(`insert into public.outfits (user_id, name) values ($1, 'care test') returning id`, [alice]))[0].id;
    for (const item of [tee, belt]) {
      await svc(`insert into public.outfit_items (outfit_id, item_id, user_id) values ($1, $2, $3)`, [outfit, item, alice]);
    }

    await asUser(db, alice, () => db.query(`select public.wear_outfit($1, current_date, null)`, [outfit]));

    const rows = await svc<{ id: string; status: string; wear_count: number }>(
      `select id, status::text as status, wear_count from public.wardrobe_items where id = any($1::uuid[])`,
      [[tee, belt]],
    );
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId[tee]).toMatchObject({ status: "WORN", wear_count: 1 });
    expect(byId[belt]).toMatchObject({ status: "CLEAN", wear_count: 1 });
  });

  it("item_needs_washing does not leak another user's item state", async () => {
    const aliceTee = (
      await svc<{ id: string }>(`select id from public.wardrobe_items where user_id = $1 and name = 'tee'`, [alice])
    )[0].id;
    const leaked = await asUser(db, bob, async () => (await db.query<{ item_needs_washing: boolean | null }>(`select public.item_needs_washing($1)`, [aliceTee])).rows[0]);
    expect(leaked.item_needs_washing).toBeNull();
    const own = await asUser(db, alice, async () => (await db.query<{ item_needs_washing: boolean | null }>(`select public.item_needs_washing($1)`, [aliceTee])).rows[0]);
    expect(own.item_needs_washing).toBe(true);
  });
});
