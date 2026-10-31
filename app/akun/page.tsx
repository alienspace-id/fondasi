import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { rupiah, tanggal, type Order, type Plan } from "@/lib/billing";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "../masuk/actions";
import { checkout } from "./actions";

export const metadata = { title: "Akun" };

const STATUS_LABEL: Record<Order["status"], string> = {
  pending: "Menunggu pembayaran",
  paid: "Lunas",
  failed: "Gagal atau kedaluwarsa",
  refunded: "Dikembalikan",
};

export default async function AkunPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireUser();
  const { error } = await searchParams;

  // Klien atas nama pengguna: RLS memastikan hanya data miliknya yang terbaca.
  const supabase = await createClient();
  const [{ data: subscription }, { data: orders }, { data: plans }] = await Promise.all([
    supabase.from("subscriptions").select("current_period_end, plans(name)").maybeSingle<{
      current_period_end: string;
      plans: { name: string } | null;
    }>(),
    supabase
      .from("orders")
      .select("id, plan_name, amount, status, created_at, paid_at")
      .order("created_at", { ascending: false })
      .limit(20)
      .overrideTypes<Pick<Order, "id" | "plan_name" | "amount" | "status" | "created_at" | "paid_at">[], { merge: false }>(),
    supabase.from("plans").select("id, name, amount, period_days").order("sort_order").overrideTypes<Plan[], { merge: false }>(),
  ]);

  const active = subscription && Date.parse(subscription.current_period_end) > Date.now();

  return (
    <main>
      <header className="row">
        <div>
          <h1>Akun</h1>
          <p className="muted">{user.email}</p>
        </div>
        <form action={signOut}>
          <button type="submit" className="secondary">
            Keluar
          </button>
        </form>
      </header>

      {error === "checkout" && (
        <p className="error" role="alert">
          Pembayaran belum bisa dimulai. Coba lagi sebentar lagi.
        </p>
      )}

      <section className="card">
        <h2>Langganan</h2>
        {active ? (
          <p>
            <strong>{subscription.plans?.name}</strong> aktif sampai {tanggal(subscription.current_period_end)}.
            Perpanjangan ditambahkan setelah tanggal itu.
          </p>
        ) : subscription ? (
          <p>Langgananmu habis pada {tanggal(subscription.current_period_end)}.</p>
        ) : (
          <p>Kamu belum berlangganan.</p>
        )}
        <div className="plans">
          {plans?.map((plan) => (
            <form key={plan.id} action={checkout} className="plan">
              <input type="hidden" name="plan" value={plan.id} />
              <strong>{plan.name}</strong>
              <span className="price">{rupiah(plan.amount)}</span>
              <span className="muted">{plan.period_days} hari</span>
              <button type="submit">{active ? "Perpanjang" : "Bayar"}</button>
            </form>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Riwayat pembayaran</h2>
        {orders?.length ? (
          <table>
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Paket</th>
                <th>Nominal</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>{tanggal(o.paid_at ?? o.created_at)}</td>
                  <td>{o.plan_name}</td>
                  <td>{rupiah(o.amount)}</td>
                  <td>{STATUS_LABEL[o.status]}</td>
                  <td>
                    {o.status === "paid" ? (
                      <Link href={`/akun/kuitansi/${o.id}`}>Kuitansi</Link>
                    ) : o.status === "pending" ? (
                      <Link href={`/akun/tagihan/${o.id}`}>Cek status</Link>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">Belum ada pembayaran.</p>
        )}
      </section>
    </main>
  );
}
