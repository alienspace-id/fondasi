import { NextResponse } from "next/server";
import { sendRenewalReminders } from "@/lib/billing";
import { isAuthorizedCron } from "@/lib/cron";

// Kirim email pengingat untuk langganan yang segera habis.
export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await sendRenewalReminders());
}
