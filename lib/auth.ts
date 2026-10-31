import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type User = { id: string; email: string };

// getClaims memverifikasi token login, jadi aman dipakai untuk melindungi halaman.
// Jangan pakai getSession untuk keputusan akses: isinya tidak diverifikasi.
export async function getUser(): Promise<User | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : "" };
}

export async function requireUser(): Promise<User> {
  const user = await getUser();
  if (!user) redirect("/masuk");
  return user;
}

// Hanya izinkan redirect ke path di situs sendiri, bukan ke domain lain.
export function safeNext(value: string | null | undefined, fallback = "/akun"): string {
  // "//domain" dan "/\domain" dibaca browser sebagai domain lain.
  return value && value.startsWith("/") && !/^\/[/\\]/.test(value) ? value : fallback;
}

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}
