export type PaymentSplit = {
  method: "CASH" | "CARD" | "CHECK" | "ACCOUNT" | "OTHER";
  amountCents: number;
  label?: string;
};

export function parsePaymentMethod(raw: string): PaymentSplit[] {
  if (!raw) return [{ method: "CASH", amountCents: 0 }];
  if (raw.startsWith("[")) {
    try {
      return JSON.parse(raw) as PaymentSplit[];
    } catch {
      // fall through
    }
  }
  // Normalize legacy "OTHER" to "ACCOUNT" for display
  const method = raw === "OTHER" ? "ACCOUNT" : raw;
  return [{ method: method as PaymentSplit["method"], amountCents: 0 }];
}

export function formatPaymentMethod(raw: string): string {
  const splits = parsePaymentMethod(raw);
  if (splits.length === 1 && !splits[0].label) {
    return splits[0].method;
  }
  return splits
    .map((s) => {
      let text = s.method;
      if (s.label) text += ` (${s.label})`;
      if (s.amountCents > 0) text += ` $${(s.amountCents / 100).toFixed(2)}`;
      return text;
    })
    .join(" / ");
}

export function serializePaymentMethod(splits: PaymentSplit[]): string {
  if (splits.length === 1 && !splits[0].label) {
    return splits[0].method;
  }
  return JSON.stringify(
    splits.map((s) => ({
      method: s.method,
      amountCents: s.amountCents,
      ...(s.label ? { label: s.label } : {}),
    }))
  );
}

/** Extract the ACCOUNT split amount from a payment method string */
export function getAccountPaymentAmount(paymentMethod: string, totalCents: number): number {
  if (paymentMethod === "ACCOUNT") return totalCents;
  if (paymentMethod.startsWith("[")) {
    try {
      const splits: PaymentSplit[] = JSON.parse(paymentMethod);
      const accountSplit = splits.find((s) => s.method === "ACCOUNT");
      return accountSplit?.amountCents || 0;
    } catch {
      return 0;
    }
  }
  return 0;
}
