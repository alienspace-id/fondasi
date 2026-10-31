import "server-only";
import crypto from "node:crypto";

// Cron hanya boleh dipanggil dengan header "Authorization: Bearer <CRON_SECRET>".
// Vercel Cron mengirim header ini otomatis kalau CRON_SECRET diisi di environment.
export function isAuthorizedCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const a = Buffer.from(req.headers.get("authorization") ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
