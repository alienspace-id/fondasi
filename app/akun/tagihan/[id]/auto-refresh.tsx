"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Muat ulang data halaman setiap beberapa detik sampai status berubah. Berhenti setelah 10 menit.
export function AutoRefresh({ everyMs = 4000, maxMs = 10 * 60 * 1000 }: { everyMs?: number; maxMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - started > maxMs) clearInterval(timer);
      else router.refresh();
    }, everyMs);
    return () => clearInterval(timer);
  }, [router, everyMs, maxMs]);
  return null;
}
