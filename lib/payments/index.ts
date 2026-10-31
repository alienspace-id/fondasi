import "server-only";
import { midtrans } from "./midtrans";
import type { PaymentDriver } from "./types";

// Daftar driver yang tersedia. Tambahkan driver baru di sini.
const drivers: Record<string, PaymentDriver> = {
  [midtrans.id]: midtrans,
};

export function getDriver(id: string): PaymentDriver | null {
  return Object.hasOwn(drivers, id) ? drivers[id] : null;
}

// Driver untuk order baru. Order lama tetap memakai driver yang tercatat di kolom provider,
// jadi pindah gateway tidak merusak transaksi yang sedang berjalan.
export function defaultDriver(): PaymentDriver {
  const id = process.env.PAYMENT_DRIVER ?? "midtrans";
  const driver = getDriver(id);
  if (!driver) throw new Error(`PAYMENT_DRIVER "${id}" tidak dikenal`);
  return driver;
}
