import { prisma } from "@/lib/prisma";
import crypto from "crypto";

export type SquareConfig = {
  accessToken: string;
  locationId: string;
  applicationId: string;
  sandbox: boolean;
};

function getBaseUrl(sandbox: boolean): string {
  return sandbox
    ? "https://connect.squareupsandbox.com"
    : "https://connect.squareup.com";
}

export async function getSquareConfig(): Promise<SquareConfig | null> {
  const rows = await prisma.settings.findMany({
    where: {
      key: {
        in: [
          "payment_square_access_token",
          "payment_square_location_id",
          "payment_square_application_id",
          "payment_square_sandbox",
        ],
      },
    },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const accessToken = map.get("payment_square_access_token");
  const locationId = map.get("payment_square_location_id");
  const applicationId = map.get("payment_square_application_id");
  if (!accessToken || !locationId) return null;
  return {
    accessToken,
    locationId,
    applicationId: applicationId || "",
    sandbox: map.get("payment_square_sandbox") === "true",
  };
}

async function squareFetch(
  path: string,
  config: SquareConfig,
  options: RequestInit = {}
): Promise<Response> {
  const base = getBaseUrl(config.sandbox);
  return fetch(`${base}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Square-Version": "2024-01-18",
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
}

function idempotencyKey(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

// --- Payment Links (Checkout) ---

export async function createSquarePaymentLink(params: {
  config: SquareConfig;
  amountCents: number;
  currency: string;
  description: string;
  redirectUrl: string;
  note?: string;
  referenceId?: string;
}): Promise<{ paymentLinkId: string; url: string; orderId: string }> {
  const res = await squareFetch("/v2/online-checkout/payment-links", params.config, {
    method: "POST",
    body: JSON.stringify({
      idempotency_key: idempotencyKey(),
      quick_pay: {
        name: params.description,
        price_money: {
          amount: params.amountCents,
          currency: params.currency.toUpperCase(),
        },
        location_id: params.config.locationId,
      },
      checkout_options: {
        redirect_url: params.redirectUrl,
        ...(params.note
          ? { merchant_support_email: undefined, note: params.note }
          : {}),
      },
      ...(params.referenceId
        ? {
            pre_populated_data: {
              buyer_address: undefined,
            },
          }
        : {}),
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      `Square create payment link failed: ${err.errors?.[0]?.detail || res.statusText}`
    );
  }

  const data = await res.json();
  const link = data.payment_link;
  return {
    paymentLinkId: link.id,
    url: link.url,
    orderId: link.order_id,
  };
}

// --- Orders (check payment status) ---

export async function getSquarePaymentLinkOrder(
  config: SquareConfig,
  orderId: string
): Promise<{
  status: string; // OPEN, COMPLETED, CANCELED
  paymentId?: string;
  receiptUrl?: string;
}> {
  const res = await squareFetch(`/v2/orders/${orderId}`, config);

  if (!res.ok) {
    throw new Error(`Square get order failed: ${res.statusText}`);
  }

  const data = await res.json();
  const order = data.order;

  // Check tenders for payment IDs
  const tender = order.tenders?.[0];
  let paymentId: string | undefined;
  let receiptUrl: string | undefined;

  if (tender?.payment_id) {
    paymentId = tender.payment_id;
    // Fetch payment for receipt URL
    const pmtRes = await squareFetch(
      `/v2/payments/${paymentId}`,
      config
    );
    if (pmtRes.ok) {
      const pmtData = await pmtRes.json();
      receiptUrl = pmtData.payment?.receipt_url;
    }
  }

  return {
    status: order.state, // OPEN, COMPLETED, CANCELED, DRAFT
    paymentId,
    receiptUrl,
  };
}

// --- Payments (direct charge with stored card) ---

export async function chargeSquareStoredCard(params: {
  config: SquareConfig;
  customerId: string;
  cardId: string;
  amountCents: number;
  currency: string;
  note?: string;
  referenceId?: string;
}): Promise<{ paymentId: string; status: string; receiptUrl?: string }> {
  const res = await squareFetch("/v2/payments", params.config, {
    method: "POST",
    body: JSON.stringify({
      idempotency_key: idempotencyKey(),
      source_id: params.cardId,
      customer_id: params.customerId,
      amount_money: {
        amount: params.amountCents,
        currency: params.currency.toUpperCase(),
      },
      autocomplete: true,
      location_id: params.config.locationId,
      ...(params.note ? { note: params.note } : {}),
      ...(params.referenceId
        ? { reference_id: params.referenceId }
        : {}),
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      `Square charge failed: ${err.errors?.[0]?.detail || res.statusText}`
    );
  }

  const data = await res.json();
  return {
    paymentId: data.payment.id,
    status: data.payment.status,
    receiptUrl: data.payment.receipt_url,
  };
}

// --- Refunds ---

export async function refundSquarePayment(params: {
  config: SquareConfig;
  paymentId: string;
  amountCents: number;
  currency: string;
}): Promise<void> {
  const res = await squareFetch("/v2/refunds", params.config, {
    method: "POST",
    body: JSON.stringify({
      idempotency_key: idempotencyKey(),
      payment_id: params.paymentId,
      amount_money: {
        amount: params.amountCents,
        currency: params.currency.toUpperCase(),
      },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      `Square refund failed: ${err.errors?.[0]?.detail || res.statusText}`
    );
  }
}

// --- Customers ---

export async function getOrCreateSquareCustomer(params: {
  config: SquareConfig;
  memberId: string;
  email?: string;
  name: string;
}): Promise<string> {
  // Search by reference_id (memberId)
  const searchRes = await squareFetch(
    "/v2/customers/search",
    params.config,
    {
      method: "POST",
      body: JSON.stringify({
        query: {
          filter: {
            reference_id: { exact: params.memberId },
          },
        },
      }),
    }
  );

  if (searchRes.ok) {
    const searchData = await searchRes.json();
    if (searchData.customers?.length > 0) {
      return searchData.customers[0].id;
    }
  }

  // Create new customer
  const nameParts = params.name.split(" ");
  const createRes = await squareFetch(
    "/v2/customers",
    params.config,
    {
      method: "POST",
      body: JSON.stringify({
        idempotency_key: idempotencyKey(),
        given_name: nameParts[0] || "",
        family_name: nameParts.slice(1).join(" ") || "",
        ...(params.email ? { email_address: params.email } : {}),
        reference_id: params.memberId,
      }),
    }
  );

  if (!createRes.ok) {
    const err = await createRes.json().catch(() => ({}));
    throw new Error(
      `Square create customer failed: ${err.errors?.[0]?.detail || createRes.statusText}`
    );
  }

  const createData = await createRes.json();
  return createData.customer.id;
}

// --- Cards on File ---

export async function listSquareCards(
  config: SquareConfig,
  customerId: string
): Promise<
  Array<{
    id: string;
    last4: string;
    brand: string;
    expMonth: number;
    expYear: number;
  }>
> {
  const res = await squareFetch(
    `/v2/cards?customer_id=${encodeURIComponent(customerId)}`,
    config
  );

  if (!res.ok) return [];

  const data = await res.json();
  return (data.cards || []).map(
    (c: {
      id: string;
      last_4: string;
      card_brand: string;
      exp_month: number;
      exp_year: number;
    }) => ({
      id: c.id,
      last4: c.last_4,
      brand: c.card_brand,
      expMonth: c.exp_month,
      expYear: c.exp_year,
    })
  );
}

export async function deleteSquareCard(
  config: SquareConfig,
  cardId: string
): Promise<void> {
  const res = await squareFetch(`/v2/cards/${cardId}`, config, {
    method: "DELETE",
  });
  // 404 is ok (already deleted)
  if (!res.ok && res.status !== 404) {
    throw new Error(`Square delete card failed: ${res.statusText}`);
  }
}

// --- Webhook verification ---

export function verifySquareWebhook(params: {
  signatureKey: string;
  notificationUrl: string;
  body: string;
  signature: string;
}): boolean {
  const payload = params.notificationUrl + params.body;
  const expected = crypto
    .createHmac("sha256", params.signatureKey)
    .update(payload)
    .digest("base64");
  return expected === params.signature;
}
