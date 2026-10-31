import Link from "next/link";
import { rupiah, type Plan } from "@/lib/billing";
import { createClient } from "@/lib/supabase/server";

// Halaman depan contoh. Ganti dengan halaman produkmu.
export default async function HomePage() {
  const supabase = await createClient();
  const { data: plans } = await supabase
    .from("plans")
    .select("id, name, amount, period_days")
    .order("sort_order")
    .overrideTypes<Plan[], { merge: false }>();

  return (
    <main>
      <h1>{process.env.NEXT_PUBLIC_APP_NAME ?? "Fondasi"}</h1>
      <p className="muted">Ganti halaman ini dengan penjelasan produkmu.</p>
      <div className="plans">
        {plans?.map((plan) => (
          <div key={plan.id} className="plan">
            <strong>{plan.name}</strong>
            <span className="price">{rupiah(plan.amount)}</span>
            <span className="muted">{plan.period_days} hari</span>
            <Link className="button" href="/akun">
              Pilih paket
            </Link>
          </div>
        ))}
      </div>
    </main>
  );
}
