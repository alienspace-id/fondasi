import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Tujuan setelah login Google, atau link masuk kalau template email belum diganti.
// Kode hanya bisa ditukar di browser yang meminta login (PKCE). Link email yang dibuka
// di browser lain gagal di sini; karena itu README mewajibkan template /auth/confirm.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = safeNext(request.nextUrl.searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, request.url));
    console.error("exchangeCodeForSession", error);
  }
  return NextResponse.redirect(new URL("/masuk?error=link", request.url));
}
