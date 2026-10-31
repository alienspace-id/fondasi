export type PaymentOutcome = "paid" | "pending" | "failed" | "refunded";

export type PaymentStatus = {
  outcome: PaymentOutcome;
  amount: number;              // nominal yang tercatat di gateway, dalam rupiah
  paymentType: string | null;  // misalnya "qris", "bank_transfer", "gopay"
  raw: string;                 // status asli dari gateway, untuk log
};

// Setiap gateway pembayaran adalah satu driver. Untuk menambah gateway,
// buat file baru yang mengimplementasikan antarmuka ini lalu daftarkan di lib/payments/index.ts.
export interface PaymentDriver {
  id: string;

  // Membuat transaksi di gateway dan mengembalikan halaman bayar.
  // Nominal selalu dari server (tabel plans), tidak pernah dari browser.
  createPayment(input: {
    orderId: string;
    amount: number;
    itemId: string;
    itemName: string;
    email: string;
    finishUrl: string; // tujuan setelah pembeli selesai di halaman bayar
  }): Promise<{ redirectUrl: string }>;

  // Memeriksa bahwa notifikasi benar-benar dari gateway.
  // Mengembalikan order_id kalau sah, null kalau tidak.
  verifyNotification(req: Request): Promise<string | null>;

  // Status terkini langsung dari API gateway. null kalau transaksi tidak ditemukan
  // (misalnya pembeli menutup halaman bayar sebelum memilih metode).
  getStatus(orderId: string): Promise<PaymentStatus | null>;
}
