import "server-only";
import crypto from "node:crypto";
import { siteUrl } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { defaultDriver, getDriver } from "@/lib/payments";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type Plan = { id: string; name: string; amount: number; period_days: number };

export type Order = {
  id: string;
  user_id: string | null;
  email: string;
  plan_id: string;
  plan_name: string;
  amount: number;
  period_days: number;
  provider: string;
  status: "pending" | "paid" | "failed" | "refunded";
  payment_type: string | null;
  paid_at: string | null;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
};

const ORDER_COLUMNS =
  "id, user_id, email, plan_id, plan_name, amount, period_days, provider, status, payment_type, paid_at, period_start, period_end, created_at";

export const rupiah = (n: number) => "Rp" + n.toLocaleString("id-ID");

// Nama metode bayar untuk ditampilkan. Kode yang tidak dikenal ditampilkan apa adanya.
const PAYMENT_LABELS: Record<string, string> = {
  qris: "QRIS",
  gopay: "GoPay",
  shopeepay: "ShopeePay",
  bank_transfer: "Transfer bank (VA)",
  echannel: "Mandiri Bill",
  credit_card: "Kartu kredit",
  cstore: "Minimarket",
};

export const paymentLabel = (type: string | null) => (type ? (PAYMENT_LABELS[type] ?? type) : "-");

export const tanggal = (iso: string) =>
  new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" });

// Membuat order pending lalu transaksi di gateway. Harga diambil dari tabel plans,
// jadi pembeli tidak bisa mengubah nominal dari browser.
export async function startCheckout(user: { id: string; email: string }, planId: string): Promise<string> {
  const db = supabaseAdmin();
  const { data: plan, error } = await db
    .from("plans")
    .select("id, name, amount, period_days")
    .eq("id", planId)
    .eq("active", true)
    .maybeSingle<Plan>();
  if (error) throw error;
  if (!plan) throw new Error(`Paket ${planId} tidak ditemukan`);

  const driver = defaultDriver();
  const orderId = `ORD-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;

  const { error: insertError } = await db.from("orders").insert({
    id: orderId,
    user_id: user.id,
    email: user.email,
    plan_id: plan.id,
    plan_name: plan.name,
    amount: plan.amount,
    period_days: plan.period_days,
    provider: driver.id,
  });
  if (insertError) throw insertError;

  try {
    const { redirectUrl } = await driver.createPayment({
      orderId,
      amount: plan.amount,
      itemId: plan.id,
      itemName: plan.name,
      email: user.email,
      finishUrl: `${siteUrl()}/akun/tagihan/${orderId}`,
    });
    return redirectUrl;
  } catch (err) {
    await db.from("orders").update({ status: "failed" }).eq("id", orderId).eq("status", "pending");
    throw err;
  }
}

async function getOrder(id: string): Promise<Order | null> {
  const { data, error } = await supabaseAdmin().from("orders").select(ORDER_COLUMNS).eq("id", id).maybeSingle<Order>();
  if (error) throw error;
  return data;
}

// Batas umur order pending yang tidak pernah dibuat di gateway sebelum dianggap gagal.
// Lebih panjang dari masa berlaku transaksi Snap (60 menit).
const ABANDONED_AFTER_MS = 3 * 60 * 60 * 1000;

// Menyamakan status order dengan gateway. Dipanggil webhook dan cron pengecek pending.
// Aman dipanggil berulang: status hanya bisa maju, dan efeknya hanya terjadi sekali.
export async function settleOrder(orderId: string): Promise<Order["status"] | null> {
  const order = await getOrder(orderId);
  if (!order) return null;

  const driver = getDriver(order.provider);
  if (!driver) throw new Error(`Driver ${order.provider} untuk ${orderId} tidak terdaftar`);

  // Status dari API gateway, bukan dari isi notifikasi (bisa dobel atau tidak berurutan).
  const status = await driver.getStatus(orderId);
  const db = supabaseAdmin();

  if (!status) {
    if (order.status === "pending" && Date.now() - Date.parse(order.created_at) > ABANDONED_AFTER_MS) {
      await db.from("orders").update({ status: "failed" }).eq("id", orderId).eq("status", "pending");
      return "failed";
    }
    return order.status;
  }

  switch (status.outcome) {
    case "paid": {
      if (status.amount !== order.amount) {
        console.error(`Nominal ${orderId} tidak cocok: gateway ${status.amount}, order ${order.amount}`);
        return order.status;
      }
      const { data: firstTime, error } = await db.rpc("mark_order_paid", {
        p_order_id: orderId,
        p_payment_type: status.paymentType,
      });
      if (error) throw error;
      if (firstTime) await sendReceipt(orderId);
      return "paid";
    }
    case "failed": {
      const { data } = await db
        .from("orders")
        .update({ status: "failed" })
        .eq("id", orderId)
        .eq("status", "pending")
        .select("id");
      if (!data?.length && order.status === "paid") {
        console.warn(`${orderId} sudah lunas tapi gateway kini ${status.raw}. Cek di dashboard gateway.`);
      }
      return data?.length ? "failed" : order.status;
    }
    case "refunded": {
      // Hanya order yang sudah lunas yang bisa direfund; masa langganan dikurangi di fungsi database.
      const { error } = await db.rpc("mark_order_refunded", { p_order_id: orderId });
      if (error) throw error;
      return order.status === "paid" || order.status === "refunded" ? "refunded" : order.status;
    }
    default:
      return order.status;
  }
}

async function sendReceipt(orderId: string) {
  const order = await getOrder(orderId);
  if (!order) return;
  try {
    await sendEmail({
      to: order.email,
      subject: `Pembayaran ${order.plan_name} diterima`,
      text: [
        `Terima kasih, pembayaran ${rupiah(order.amount)} untuk ${order.plan_name} sudah kami terima.`,
        order.period_end ? `Langgananmu aktif sampai ${tanggal(order.period_end)}.` : "",
        "",
        `Kuitansi: ${siteUrl()}/akun/kuitansi/${order.id}`,
      ].join("\n"),
    });
  } catch (err) {
    // Email gagal tidak boleh membatalkan pembayaran yang sudah tercatat.
    console.error(`Kuitansi ${orderId} gagal dikirim`, err);
  }
}

// Cek ulang order pending yang notifikasinya tidak sampai, misalnya karena server sedang mati.
export async function checkPendingOrders(): Promise<{ checked: number; changed: number }> {
  const now = Date.now();
  const { data, error } = await supabaseAdmin()
    .from("orders")
    .select("id")
    .eq("status", "pending")
    .lt("created_at", new Date(now - 10 * 60 * 1000).toISOString()) // beri waktu webhook datang dulu
    .gt("created_at", new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString())
    .order("created_at")
    .limit(50);
  if (error) throw error;

  let changed = 0;
  for (const { id } of data) {
    try {
      if ((await settleOrder(id)) !== "pending") changed++;
    } catch (err) {
      console.error(`Gagal mengecek ${id}`, err);
    }
  }
  return { checked: data.length, changed };
}

const REMIND_DAYS_BEFORE = 3;

// Email pengingat beberapa hari sebelum langganan habis. Setiap periode hanya diingatkan sekali.
export async function sendRenewalReminders(): Promise<{ sent: number }> {
  const db = supabaseAdmin();
  const now = new Date();
  const until = new Date(now.getTime() + REMIND_DAYS_BEFORE * 24 * 60 * 60 * 1000);

  const { data, error } = await db
    .from("subscriptions")
    .select("user_id, current_period_end, plans(name), profiles(email)")
    .is("reminder_sent_at", null)
    .gt("current_period_end", now.toISOString())
    .lte("current_period_end", until.toISOString())
    .limit(200);
  if (error) throw error;

  let sent = 0;
  for (const row of data as unknown as ReminderRow[]) {
    if (!row.profiles?.email) continue;

    // Klaim dulu sebelum mengirim: kalau cron berjalan dua kali bersamaan, hanya satu yang mengirim.
    const { data: claimed } = await db
      .from("subscriptions")
      .update({ reminder_sent_at: now.toISOString() })
      .eq("user_id", row.user_id)
      .is("reminder_sent_at", null)
      .select("user_id");
    if (!claimed?.length) continue;

    try {
      await sendEmail({
        to: row.profiles.email,
        subject: `Langganan ${row.plans?.name ?? ""} habis ${tanggal(row.current_period_end)}`,
        text: [
          `Langgananmu akan habis pada ${tanggal(row.current_period_end)}.`,
          "Perpanjang sekarang supaya aksesmu tidak terputus. Masa langganan baru dihitung dari tanggal habis, bukan dari hari ini.",
          "",
          `${siteUrl()}/akun`,
        ].join("\n"),
      });
      sent++;
    } catch (err) {
      // Lepas klaim supaya dicoba lagi di cron berikutnya.
      await db.from("subscriptions").update({ reminder_sent_at: null }).eq("user_id", row.user_id);
      console.error(`Pengingat untuk ${row.user_id} gagal dikirim`, err);
    }
  }
  return { sent };
}

type ReminderRow = {
  user_id: string;
  current_period_end: string;
  plans: { name: string } | null;
  profiles: { email: string } | null;
};
