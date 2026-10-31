import "server-only";
import crypto from "node:crypto";
import type { PaymentDriver, PaymentOutcome } from "./types";

const isProduction = () => process.env.MIDTRANS_IS_PRODUCTION === "true";
const snapUrl = () =>
  isProduction() ? "https://app.midtrans.com/snap/v1/transactions" : "https://app.sandbox.midtrans.com/snap/v1/transactions";
const apiBase = () => (isProduction() ? "https://api.midtrans.com" : "https://api.sandbox.midtrans.com");

function serverKey(): string {
  const key = process.env.MIDTRANS_SERVER_KEY;
  if (!key) throw new Error("MIDTRANS_SERVER_KEY belum diisi");
  return key;
}

// Server Key sebagai username, password kosong.
function authHeader(): string {
  return "Basic " + Buffer.from(serverKey() + ":").toString("base64");
}

// SHA512(order_id + status_code + gross_amount + ServerKey), dibandingkan dengan signature_key.
export function isValidSignature(n: Record<string, unknown>): boolean {
  const { order_id, status_code, gross_amount, signature_key } = n;
  if (
    typeof order_id !== "string" ||
    typeof status_code !== "string" ||
    typeof gross_amount !== "string" ||
    typeof signature_key !== "string"
  ) {
    return false;
  }
  const expected = crypto
    .createHash("sha512")
    .update(order_id + status_code + gross_amount + serverKey())
    .digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature_key);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export type MidtransStatus = {
  status_code: string;
  transaction_status?: string;
  fraud_status?: string;
  gross_amount?: string;
  payment_type?: string;
};

export function interpretStatus(s: MidtransStatus): PaymentOutcome {
  if (s.fraud_status === "deny") return "failed";
  switch (s.transaction_status) {
    case "settlement":
    case "capture":
      // Lunas hanya kalau status_code 200 dan fraud_status accept (atau tidak ada).
      return s.status_code === "200" && (!s.fraud_status || s.fraud_status === "accept") ? "paid" : "pending";
    case "deny":
    case "cancel":
    case "expire":
    case "failure":
      return "failed";
    case "refund":
    case "partial_refund":
    case "chargeback":
    case "partial_chargeback":
      return "refunded";
    default:
      return "pending";
  }
}

export const midtrans: PaymentDriver = {
  id: "midtrans",

  async createPayment(input) {
    const res = await fetch(snapUrl(), {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: authHeader() },
      body: JSON.stringify({
        transaction_details: { order_id: input.orderId, gross_amount: input.amount },
        item_details: [{ id: input.itemId, price: input.amount, quantity: 1, name: input.itemName.slice(0, 50) }],
        customer_details: { email: input.email },
        // Tanpa enabled_payments, Snap menampilkan semua metode yang aktif di akunmu.
        // Akun perorangan tidak mendapat BCA VA, jadi daftar tetap sesuai akun.
        expiry: { unit: "minutes", duration: 60 },
        callbacks: { finish: input.finishUrl },
      }),
      cache: "no-store",
    });
    if (res.status !== 201) throw new Error(`Snap gagal (${res.status}): ${await res.text()}`);
    const { redirect_url } = (await res.json()) as { redirect_url: string };
    return { redirectUrl: redirect_url };
  },

  async verifyNotification(req) {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    return body && isValidSignature(body) ? (body.order_id as string) : null;
  },

  async getStatus(orderId) {
    const res = await fetch(`${apiBase()}/v2/${encodeURIComponent(orderId)}/status`, {
      headers: { Accept: "application/json", Authorization: authHeader() },
      cache: "no-store",
    });
    const s = (await res.json().catch(() => null)) as MidtransStatus | null;
    // Transaksi yang belum dibuat di Midtrans dibalas status_code 404.
    if (res.status === 404 || s?.status_code === "404") return null;
    if (!res.ok || !s) throw new Error(`Status API gagal (${res.status})`);
    return {
      outcome: interpretStatus(s),
      amount: Number(s.gross_amount),
      paymentType: s.payment_type ?? null,
      raw: s.transaction_status ?? s.status_code,
    };
  },
};
