import { beforeEach, describe, expect, it } from "vitest";
import { as, createTestDb, createUser, type TestDb } from "./db";

const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";

let db: TestDb;

async function createOrder(id: string, userId: string, plan = "bulanan") {
  await db.query(
    `insert into public.orders (id, user_id, email, plan_id, plan_name, amount, period_days, provider)
     select $1, $2, u.email, p.id, p.name, p.amount, p.period_days, 'midtrans'
       from auth.users u, public.plans p where u.id = $2 and p.id = $3`,
    [id, userId, plan],
  );
}

const anon = <T>(fn: () => Promise<T>) => as(db, { role: "anon" }, fn);
const userA = <T>(fn: () => Promise<T>) => as(db, { role: "authenticated", userId: A }, fn);
const service = <T>(fn: () => Promise<T>) => as(db, { role: "service_role" }, fn);

beforeEach(async () => {
  db = await createTestDb();
  await createUser(db, A, "a@contoh.com");
  await createUser(db, B, "b@contoh.com");
  await createOrder("ORD-A", A);
  await createOrder("ORD-B", B);
});

describe("semua tabel", () => {
  it("memakai RLS", async () => {
    const { rows } = await db.query<{ tablename: string }>(
      "select tablename from pg_tables where schemaname = 'public' and not rowsecurity",
    );
    expect(rows).toEqual([]);
  });
});

describe("profiles", () => {
  it("dibuat otomatis saat pengguna mendaftar", async () => {
    const { rows } = await db.query("select email, full_name from public.profiles where id = $1", [A]);
    expect(rows).toEqual([{ email: "a@contoh.com", full_name: "a" }]);
  });

  it("pengguna hanya membaca profilnya sendiri", async () => {
    const { rows } = await userA(() => db.query<{ id: string }>("select id from public.profiles"));
    expect(rows.map((r) => r.id)).toEqual([A]);
  });

  it("pengunjung tanpa login tidak membaca profil", async () => {
    const { rows } = await anon(() => db.query("select id from public.profiles"));
    expect(rows).toEqual([]);
  });

  it("pengguna bisa mengubah nama, tapi tidak bisa mengubah email", async () => {
    await userA(() => db.query("update public.profiles set full_name = 'Andi' where id = $1", [A]));
    await expect(
      userA(() => db.query("update public.profiles set email = 'x@contoh.com' where id = $1", [A])),
    ).rejects.toThrow(/permission denied/);
    const { rows } = await db.query("select email, full_name from public.profiles where id = $1", [A]);
    expect(rows).toEqual([{ email: "a@contoh.com", full_name: "Andi" }]);
  });

  it("pengguna tidak bisa mengubah profil orang lain", async () => {
    const res = await userA(() => db.query("update public.profiles set full_name = 'X' where id = $1", [B]));
    expect(res.affectedRows).toBe(0);
  });
});

describe("plans", () => {
  it("siapa saja membaca paket aktif, bukan yang nonaktif", async () => {
    await db.query("update public.plans set active = false where id = 'tahunan'");
    const { rows } = await anon(() => db.query<{ id: string }>("select id from public.plans"));
    expect(rows.map((r) => r.id)).toEqual(["bulanan"]);
  });

  it("pengguna tidak bisa mengubah harga", async () => {
    const res = await userA(() => db.query("update public.plans set amount = 1 where id = 'bulanan'"));
    expect(res.affectedRows).toBe(0);
    await expect(
      userA(() => db.query("insert into public.plans (id, name, amount, period_days) values ('x', 'X', 1, 1)")),
    ).rejects.toThrow(/row-level security/);
  });
});

describe("orders", () => {
  it("pengguna hanya membaca ordernya sendiri", async () => {
    const { rows } = await userA(() => db.query<{ id: string }>("select id from public.orders"));
    expect(rows.map((r) => r.id)).toEqual(["ORD-A"]);
  });

  it("pengguna tidak bisa membuat order atau menandainya lunas", async () => {
    await expect(
      userA(() =>
        db.query(
          `insert into public.orders (id, user_id, email, plan_id, plan_name, amount, period_days, provider)
           values ('ORD-X', $1, 'a@contoh.com', 'bulanan', 'X', 1, 30, 'midtrans')`,
          [A],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
    const res = await userA(() => db.query("update public.orders set status = 'paid' where id = 'ORD-A'"));
    expect(res.affectedRows).toBe(0);
  });

  it("pengguna dan pengunjung tidak bisa memanggil fungsi pembayaran", async () => {
    await expect(userA(() => db.query("select public.mark_order_paid('ORD-A', 'qris')"))).rejects.toThrow(
      /permission denied/,
    );
    await expect(anon(() => db.query("select public.mark_order_refunded('ORD-A')"))).rejects.toThrow(
      /permission denied/,
    );
    await expect(userA(() => db.query("select public.handle_new_user()"))).rejects.toThrow(/permission denied/);
  });
});

describe("subscriptions", () => {
  it("pengguna hanya membaca langganannya sendiri", async () => {
    await service(() => db.query("select public.mark_order_paid('ORD-A', 'qris')"));
    await service(() => db.query("select public.mark_order_paid('ORD-B', 'qris')"));
    const { rows } = await userA(() => db.query<{ user_id: string }>("select user_id from public.subscriptions"));
    expect(rows.map((r) => r.user_id)).toEqual([A]);
  });
});

describe("mark_order_paid", () => {
  const paid = (id: string) =>
    service(() => db.query<{ ok: boolean }>("select public.mark_order_paid($1, 'qris') as ok", [id])).then(
      (r) => r.rows[0].ok,
    );
  const daysLeft = async (userId: string) => {
    const { rows } = await db.query<{ days: number }>(
      "select round(extract(epoch from current_period_end - now()) / 86400)::int as days from public.subscriptions where user_id = $1",
      [userId],
    );
    return rows[0]?.days;
  };

  it("hanya berhasil sekali untuk order yang sama", async () => {
    expect(await paid("ORD-A")).toBe(true);
    expect(await paid("ORD-A")).toBe(false);
    expect(await daysLeft(A)).toBe(30);
  });

  it("pembayaran kedua menambah masa langganan, bukan menimpanya", async () => {
    await createOrder("ORD-A2", A, "tahunan");
    await paid("ORD-A");
    await paid("ORD-A2");
    expect(await daysLeft(A)).toBe(395);
    const { rows } = await db.query(
      "select plan_id from public.subscriptions where user_id = $1",
      [A],
    );
    expect(rows).toEqual([{ plan_id: "tahunan" }]);
  });

  it("langganan yang sudah habis dihitung ulang dari tanggal bayar", async () => {
    await paid("ORD-A");
    await db.query("update public.subscriptions set current_period_end = now() - interval '10 days'");
    await createOrder("ORD-A2", A);
    await paid("ORD-A2");
    expect(await daysLeft(A)).toBe(30);
  });

  it("perpanjangan mengosongkan tanda email pengingat", async () => {
    await paid("ORD-A");
    await db.query("update public.subscriptions set reminder_sent_at = now()");
    await createOrder("ORD-A2", A);
    await paid("ORD-A2");
    const { rows } = await db.query("select reminder_sent_at from public.subscriptions where user_id = $1", [A]);
    expect(rows).toEqual([{ reminder_sent_at: null }]);
  });

  it("order gagal tidak bisa ditandai lunas", async () => {
    await db.query("update public.orders set status = 'failed' where id = 'ORD-A'");
    expect(await paid("ORD-A")).toBe(false);
    expect(await daysLeft(A)).toBeUndefined();
  });

  it("refund mengurangi masa langganan tanpa mundur ke masa lalu", async () => {
    await createOrder("ORD-A2", A);
    await paid("ORD-A");
    await paid("ORD-A2");
    expect(await daysLeft(A)).toBe(60);
    await service(() => db.query("select public.mark_order_refunded('ORD-A2')"));
    expect(await daysLeft(A)).toBe(30);
    await service(() => db.query("select public.mark_order_refunded('ORD-A')"));
    expect(await daysLeft(A)).toBe(0);
    const again = await service(() => db.query<{ ok: boolean }>("select public.mark_order_refunded('ORD-A') as ok"));
    expect(again.rows[0].ok).toBe(false);
  });
});
