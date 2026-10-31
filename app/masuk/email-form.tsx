"use client";

import { useActionState } from "react";
import { signInWithEmail, type LoginState } from "./actions";

export function EmailForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(signInWithEmail, {});

  if (state.sent) {
    return (
      <p className="notice" role="status">
        Link masuk sudah dikirim ke <strong>{state.sent}</strong>. Buka email itu di perangkat ini. Tidak ada di
        kotak masuk? Cek folder spam.
      </p>
    );
  }

  return (
    <form action={action} className="stack">
      <input type="hidden" name="next" value={next} />
      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" autoComplete="email" required placeholder="nama@contoh.com" />
      <button type="submit" disabled={pending}>
        {pending ? "Mengirim..." : "Kirim link masuk"}
      </button>
      {state.error && (
        <p className="error" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
