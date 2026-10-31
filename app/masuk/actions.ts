"use server";

import { redirect } from "next/navigation";
import { safeNext, siteUrl } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { sent?: string; error?: string };

// Login tanpa password: Supabase mengirim link masuk ke email.
export async function signInWithEmail(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Alamat email tidak valid." };

  const next = safeNext(String(formData.get("next") ?? ""));
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error) {
    console.error("signInWithOtp", error);
    // Batas kirim email bawaan Supabase sangat kecil tanpa SMTP sendiri; lihat README.
    return { error: error.status === 429 ? "Terlalu banyak permintaan. Coba lagi beberapa menit lagi." : "Link masuk belum bisa dikirim. Coba lagi." };
  }
  return { sent: email };
}

export async function signInWithGoogle(formData: FormData) {
  const next = safeNext(String(formData.get("next") ?? ""));
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.url) redirect("/masuk?error=google");
  redirect(data.url);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
