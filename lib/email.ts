import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

let transporter: Transporter | null = null;

// Semua email dikirim lewat SMTP standar, jadi penyedia bisa diganti tanpa mengubah kode:
// Resend, Brevo, Amazon SES, atau penyedia lain. Pakai kredensial SMTP yang sama
// dengan yang dipasang di Supabase Auth.
function getTransporter(): Transporter | null {
  if (!process.env.SMTP_HOST) return null;
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT ?? 465);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
}

export async function sendEmail(message: { to: string; subject: string; text: string }): Promise<void> {
  const t = getTransporter();
  if (!t) {
    // Tanpa SMTP_HOST (misalnya saat baru clone), email hanya dicetak ke log.
    console.log(`[email belum dikirim, SMTP_HOST kosong] ke ${message.to}: ${message.subject}\n${message.text}`);
    return;
  }
  const from = process.env.EMAIL_FROM;
  if (!from) throw new Error("EMAIL_FROM belum diisi");
  await t.sendMail({ from, ...message });
}
