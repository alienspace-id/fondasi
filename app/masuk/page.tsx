import { redirect } from "next/navigation";
import { getUser, safeNext } from "@/lib/auth";
import { signInWithGoogle } from "./actions";
import { EmailForm } from "./email-form";

export const metadata = { title: "Masuk" };

const ERRORS: Record<string, string> = {
  google: "Login Google belum bisa dimulai. Pastikan provider Google sudah aktif di Supabase.",
  link: "Link masuk tidak valid atau sudah kedaluwarsa. Minta link baru di bawah.",
};

export default async function MasukPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next: rawNext, error } = await searchParams;
  const next = safeNext(rawNext);
  if (await getUser()) redirect(next);

  return (
    <main className="narrow">
      <h1>Masuk</h1>
      <p className="muted">Belum punya akun? Akun dibuat otomatis saat pertama kali masuk.</p>
      {error && ERRORS[error] && (
        <p className="error" role="alert">
          {ERRORS[error]}
        </p>
      )}
      <form action={signInWithGoogle}>
        <input type="hidden" name="next" value={next} />
        <button type="submit" className="secondary wide">
          Masuk dengan Google
        </button>
      </form>
      <p className="divider">atau</p>
      <EmailForm next={next} />
    </main>
  );
}
