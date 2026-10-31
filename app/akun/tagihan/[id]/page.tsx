import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { rupiah, tanggal, type Order } from "@/lib/billing";
import { createClient } from "@/lib/supabase/server";
import { AutoRefresh } from "./auto-refresh";

export const metadata = { title: "Status pembayaran" };

// Tujuan setelah pembeli selesai di halaman bayar gateway. Status di sini dibaca dari database,
// yang hanya diubah webhook atau cron. Parameter di URL dari gateway tidak dipercaya.
export default async function TagihanPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;

  const supabase = await createClient();
  const { data: order } = await supabase
    .from("orders")
    .select("id, plan_name, amount, status, period_end")
    .eq("id", id)
    .maybeSingle<Pick<Order, "id" | "plan_name" | "amount" | "status" | "period_end">>();
  if (!order) notFound();

  return (
    <main className="narrow">
      <h1>{order.plan_name}</h1>
      <p className="price">{rupiah(order.amount)}</p>

      {order.status === "paid" && (
        <>
          <p className="notice">
            Pembayaran diterima.{order.period_end && ` Langganan aktif sampai ${tanggal(order.period_end)}.`}
          </p>
          <p>
            <Link href={`/akun/kuitansi/${order.id}`}>Lihat kuitansi</Link> · <Link href="/akun">Ke akun</Link>
          </p>
        </>
      )}

      {order.status === "pending" && (
        <>
          <p className="notice" role="status">
            Menunggu konfirmasi pembayaran. Halaman ini diperbarui otomatis. Kalau kamu memilih transfer bank,
            selesaikan pembayaran sesuai instruksi, lalu status berubah dalam beberapa menit.
          </p>
          <AutoRefresh />
          <p>
            <Link href="/akun">Kembali ke akun</Link>
          </p>
        </>
      )}

      {(order.status === "failed" || order.status === "refunded") && (
        <>
          <p className="error">
            {order.status === "failed"
              ? "Pembayaran gagal atau sudah kedaluwarsa. Tidak ada dana yang ditarik."
              : "Pembayaran ini sudah dikembalikan."}
          </p>
          <p>
            <Link href="/akun">Coba lagi dari halaman akun</Link>
          </p>
        </>
      )}
    </main>
  );
}
