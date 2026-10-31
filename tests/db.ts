import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

const root = path.resolve(__dirname, "..");

let template: Promise<PGlite> | null = null;

// Tiruan Supabase, semua migrasi berurutan, lalu seed. Dibuat sekali per file test.
async function buildTemplate() {
  const db = new PGlite();
  await db.exec(readFileSync(path.join(root, "tests/supabase-stub.sql"), "utf8"));
  const dir = path.join(root, "supabase/migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(path.join(dir, file), "utf8"));
  }
  await db.exec(readFileSync(path.join(root, "supabase/seed.sql"), "utf8"));
  return db;
}

// Salinan baru dari template untuk setiap test, jadi test tidak saling memengaruhi.
export async function createTestDb() {
  template ??= buildTemplate();
  return (await template).clone();
}

export type TestDb = Awaited<ReturnType<typeof createTestDb>>;

// Jalankan query sebagai role tertentu, seperti request dari PostgREST.
export async function as<T>(
  db: TestDb,
  who: { role: "anon" | "authenticated" | "service_role"; userId?: string },
  fn: () => Promise<T>,
): Promise<T> {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [who.userId ?? ""]);
  await db.exec(`set role ${who.role}`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}

export async function createUser(db: TestDb, id: string, email: string) {
  await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)", [
    id,
    email,
    { full_name: email.split("@")[0] },
  ]);
}
