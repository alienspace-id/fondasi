import { NextResponse } from "next/server";
import { checkPendingOrders } from "@/lib/billing";
import { isAuthorizedCron } from "@/lib/cron";

// Cek ulang transaksi yang tertahan di pending karena notifikasi gateway tidak sampai.
export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await checkPendingOrders());
}
