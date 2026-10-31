import { NextResponse } from "next/server";
import { settleOrder } from "@/lib/billing";
import { getDriver } from "@/lib/payments";

// Notifikasi pembayaran dari gateway. Untuk Midtrans: /api/webhooks/midtrans.
export async function POST(req: Request, { params }: { params: Promise<{ driver: string }> }) {
  const driver = getDriver((await params).driver);
  if (!driver) return NextResponse.json({ error: "Driver tidak dikenal" }, { status: 404 });

  // 1. Pastikan notifikasi benar-benar dari gateway.
  const orderId = await driver.verifyNotification(req);
  if (!orderId) return NextResponse.json({ error: "Notifikasi tidak sah" }, { status: 403 });

  // 2. Status diambil ulang dari API gateway, lalu diterapkan sekali saja.
  //    Kalau gagal, balas 500 supaya gateway mengirim ulang; cron pending juga akan mengeceknya.
  try {
    await settleOrder(orderId);
  } catch (err) {
    console.error(`Webhook ${driver.id} untuk ${orderId} gagal`, err);
    return NextResponse.json({ error: "Gagal memproses" }, { status: 500 });
  }

  // Order yang tidak dikenal juga dibalas 200 supaya gateway tidak terus mengulang.
  return NextResponse.json({ ok: true });
}
