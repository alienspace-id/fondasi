"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { startCheckout } from "@/lib/billing";

export async function checkout(formData: FormData) {
  const user = await requireUser();
  const planId = String(formData.get("plan") ?? "");

  let redirectUrl: string;
  try {
    redirectUrl = await startCheckout(user, planId);
  } catch (err) {
    console.error("checkout", err);
    redirect("/akun?error=checkout");
  }
  // redirect() melempar error khusus, jadi dipanggil di luar try.
  redirect(redirectUrl);
}
