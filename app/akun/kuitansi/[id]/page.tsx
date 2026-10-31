import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { paymentLabel, rupiah, tanggal, type Order } from "@/lib/billing";
import { createClient } from "@/lib/supabase/server";
import { PrintButton } from "./print-button";

export const metadata = { title: "Kuitansi" };

// Kuitansi pembayaran, bisa dicetak atau disimpan sebagai PDF dari browser.
// Ini bukan faktur pajak: pengusaha yang belum PKP tidak boleh menerbitkan faktur pajak.
export default async function KuitansiPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;

  const supabase = await createClient();
  const { data: order } = await supabase
    .from("orders")
    .select("id, email, plan_name, amount, status, payment_type, paid_at, period_start, period_end")
    .eq("id", id)
    .in("status", ["paid", "refunded"])
    .maybeSingle<Order>();
  if (!order || !order.paid_at) notFound();

  const seller = process.env.BUSINESS_NAME ?? process.env.NEXT_PUBLIC_APP_NAME ?? "Nama usaha";

  return (
    <main className="narrow receipt">
      <p className="no-print">
        <Link href="/akun">← Kembali ke akun</Link>
      </p>
      <h1>Kuitansi</h1>
      {order.status === "refunded" && <p className="error">Pembayaran ini sudah dikembalikan.</p>}
      <dl>
        <dt>Nomor</dt>
        <dd>{order.id}</dd>
        <dt>Tanggal bayar</dt>
        <dd>{tanggal(order.paid_at)}</dd>
        <dt>Diterima dari</dt>
        <dd>{order.email}</dd>
        <dt>Diterima oleh</dt>
        <dd>{seller}</dd>
        <dt>Untuk</dt>
        <dd>
          {order.plan_name}
          {order.period_start && order.period_end && (
            <>
              , periode {tanggal(order.period_start)} sampai {tanggal(order.period_end)}
            </>
          )}
        </dd>
        <dt>Metode</dt>
        <dd>{paymentLabel(order.payment_type)}</dd>
        <dt>Jumlah</dt>
        <dd className="price">{rupiah(order.amount)}</dd>
      </dl>
      <p className="muted small">Kuitansi ini bukan faktur pajak.</p>
      <PrintButton />
    </main>
  );
}
