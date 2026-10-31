import crypto from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { interpretStatus, isValidSignature } from "@/lib/payments/midtrans";

const KEY = "SB-Mid-server-test";
const sign = (orderId: string, statusCode: string, gross: string, key = KEY) =>
  crypto.createHash("sha512").update(orderId + statusCode + gross + key).digest("hex");

beforeAll(() => {
  process.env.MIDTRANS_SERVER_KEY = KEY;
});

describe("isValidSignature", () => {
  const base = { order_id: "ORD-1", status_code: "200", gross_amount: "49000.00" };

  it("menerima signature yang benar", () => {
    expect(isValidSignature({ ...base, signature_key: sign("ORD-1", "200", "49000.00") })).toBe(true);
  });

  it("menolak signature dari key lain", () => {
    expect(isValidSignature({ ...base, signature_key: sign("ORD-1", "200", "49000.00", "kunci-lain") })).toBe(false);
  });

  it("menolak nominal yang diubah", () => {
    expect(isValidSignature({ ...base, gross_amount: "1.00", signature_key: sign("ORD-1", "200", "49000.00") })).toBe(
      false,
    );
  });

  it("menolak notifikasi tanpa signature", () => {
    expect(isValidSignature(base)).toBe(false);
  });
});

describe("interpretStatus", () => {
  it.each([
    [{ status_code: "200", transaction_status: "settlement" }, "paid"],
    [{ status_code: "200", transaction_status: "capture", fraud_status: "accept" }, "paid"],
    [{ status_code: "201", transaction_status: "capture", fraud_status: "challenge" }, "pending"],
    [{ status_code: "201", transaction_status: "pending" }, "pending"],
    [{ status_code: "407", transaction_status: "expire" }, "failed"],
    [{ status_code: "200", transaction_status: "settlement", fraud_status: "deny" }, "failed"],
    [{ status_code: "200", transaction_status: "refund" }, "refunded"],
  ] as const)("%o -> %s", (status, expected) => {
    expect(interpretStatus(status)).toBe(expected);
  });
});
