import { prisma } from "@/lib/prisma";

export type PayPalConfig = {
  clientId: string;
  clientSecret: string;
  sandbox: boolean;
};

// Module-level token cache
let cachedToken: { token: string; expiresAt: number } | null = null;

function getBaseUrl(sandbox: boolean): string {
  return sandbox
    ? "https://api-m.sandbox.paypal.com"
    : "https://api-m.paypal.com";
}

export async function getPayPalConfig(): Promise<PayPalConfig | null> {
  const rows = await prisma.settings.findMany({
    where: {
      key: {
        in: [
          "payment_paypal_client_id",
          "payment_paypal_client_secret",
          "payment_paypal_sandbox",
        ],
      },
    },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const clientId = map.get("payment_paypal_client_id");
  const clientSecret = map.get("payment_paypal_client_secret");
  if (!clientId || !clientSecret) return null;
  return {
    clientId,
    clientSecret,
    sandbox: map.get("payment_paypal_sandbox") === "true",
  };
}

export async function getPayPalAccessToken(
  config: PayPalConfig
): Promise<string> {
  // Return cached token if still valid (with 5-minute buffer)
  if (cachedToken && cachedToken.expiresAt > Date.now() + 300_000) {
    return cachedToken.token;
  }

  const base = getBaseUrl(config.sandbox);
  const res = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      `PayPal auth failed: ${err.error_description || res.statusText}`
    );
  }

  const data = await res.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

async function paypalFetch(
  path: string,
  config: PayPalConfig,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getPayPalAccessToken(config);
  const base = getBaseUrl(config.sandbox);
  return fetch(`${base}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
}

// --- Orders API ---

export async function createPayPalOrder(params: {
  config: PayPalConfig;
  amountCents: number;
  currency: string;
  description: string;
  returnUrl: string;
  cancelUrl: string;
  customId?: string; // JSON metadata (max 127 chars)
  referenceId?: string; // additional reference
}): Promise<{ orderId: string; approvalUrl: string }> {
  const amount = (params.amountCents / 100).toFixed(2);
  const res = await paypalFetch("/v2/checkout/orders", params.config, {
    method: "POST",
    headers: { "PayPal-Request-Id": `order_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: {
            currency_code: params.currency.toUpperCase(),
            value: amount,
          },
          description: params.description,
          ...(params.customId ? { custom_id: params.customId } : {}),
          ...(params.referenceId
            ? { reference_id: params.referenceId }
            : {}),
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            return_url: params.returnUrl,
            cancel_url: params.cancelUrl,
            user_action: "PAY_NOW",
            landing_page: "LOGIN",
          },
        },
      },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      `PayPal create order failed: ${err.details?.[0]?.description || err.message || res.statusText}`
    );
  }

  const data = await res.json();
  const approvalLink = data.links?.find(
    (l: { rel: string }) => l.rel === "payer-action"
  );
  if (!approvalLink) {
    throw new Error("PayPal order created but no approval URL returned");
  }

  return { orderId: data.id, approvalUrl: approvalLink.href };
}

export async function capturePayPalOrder(
  config: PayPalConfig,
  orderId: string
): Promise<{
  captureId: string;
  status: string;
  payerEmail?: string;
  payerId?: string;
}> {
  const res = await paypalFetch(
    `/v2/checkout/orders/${orderId}/capture`,
    config,
    { method: "POST" }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      `PayPal capture failed: ${err.details?.[0]?.description || err.message || res.statusText}`
    );
  }

  const data = await res.json();
  const capture =
    data.purchase_units?.[0]?.payments?.captures?.[0];

  return {
    captureId: capture?.id || orderId,
    status: data.status,
    payerEmail: data.payer?.email_address,
    payerId: data.payer?.payer_id,
  };
}

export async function getPayPalOrderStatus(
  config: PayPalConfig,
  orderId: string
): Promise<{
  status: string; // CREATED, APPROVED, COMPLETED, VOIDED
  captureId?: string;
  customId?: string;
}> {
  const res = await paypalFetch(
    `/v2/checkout/orders/${orderId}`,
    config
  );

  if (!res.ok) {
    throw new Error(`PayPal get order failed: ${res.statusText}`);
  }

  const data = await res.json();
  const capture =
    data.purchase_units?.[0]?.payments?.captures?.[0];
  const customId = data.purchase_units?.[0]?.custom_id;

  return {
    status: data.status,
    captureId: capture?.id,
    customId,
  };
}

// --- Refunds ---

export async function refundPayPalCapture(
  config: PayPalConfig,
  captureId: string,
  amountCents?: number,
  currency?: string
): Promise<void> {
  const body: Record<string, unknown> = {};
  if (amountCents !== undefined && currency) {
    body.amount = {
      value: (amountCents / 100).toFixed(2),
      currency_code: currency.toUpperCase(),
    };
  }

  const res = await paypalFetch(
    `/v2/payments/captures/${captureId}/refund`,
    config,
    {
      method: "POST",
      headers: { "PayPal-Request-Id": `refund_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      `PayPal refund failed: ${err.details?.[0]?.description || err.message || res.statusText}`
    );
  }
}

// --- Vault (stored payment methods for off-session charges) ---

export async function createPayPalVaultSetupToken(params: {
  config: PayPalConfig;
  returnUrl: string;
  cancelUrl: string;
  customerId?: string;
}): Promise<{ setupTokenId: string; approvalUrl: string }> {
  const res = await paypalFetch("/v3/vault/setup-tokens", params.config, {
    method: "POST",
    body: JSON.stringify({
      payment_source: {
        paypal: {
          usage_type: "MERCHANT",
          experience_context: {
            return_url: params.returnUrl,
            cancel_url: params.cancelUrl,
          },
          ...(params.customerId
            ? { customer_id: params.customerId }
            : {}),
        },
      },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      `PayPal vault setup failed: ${err.details?.[0]?.description || err.message || res.statusText}`
    );
  }

  const data = await res.json();
  const approvalLink = data.links?.find(
    (l: { rel: string }) => l.rel === "approve"
  );
  return {
    setupTokenId: data.id,
    approvalUrl: approvalLink?.href || "",
  };
}

export async function confirmPayPalVaultSetupToken(
  config: PayPalConfig,
  setupTokenId: string
): Promise<{ paymentTokenId: string; payerEmail?: string }> {
  const res = await paypalFetch("/v3/vault/payment-tokens", config, {
    method: "POST",
    body: JSON.stringify({ setup_token: setupTokenId }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      `PayPal vault confirm failed: ${err.details?.[0]?.description || err.message || res.statusText}`
    );
  }

  const data = await res.json();
  return {
    paymentTokenId: data.id,
    payerEmail: data.payment_source?.paypal?.email_address,
  };
}

export async function chargePayPalVaultedToken(params: {
  config: PayPalConfig;
  paymentTokenId: string;
  amountCents: number;
  currency: string;
  description: string;
  customId?: string;
}): Promise<{ orderId: string; captureId: string; status: string }> {
  const amount = (params.amountCents / 100).toFixed(2);

  // Create order with vaulted token
  const res = await paypalFetch("/v2/checkout/orders", params.config, {
    method: "POST",
    headers: { "PayPal-Request-Id": `vault_charge_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: {
            currency_code: params.currency.toUpperCase(),
            value: amount,
          },
          description: params.description,
          ...(params.customId ? { custom_id: params.customId } : {}),
        },
      ],
      payment_source: {
        paypal: {
          vault_id: params.paymentTokenId,
        },
      },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      `PayPal vault charge failed: ${err.details?.[0]?.description || err.message || res.statusText}`
    );
  }

  const orderData = await res.json();

  // If COMPLETED, extract capture ID directly
  if (orderData.status === "COMPLETED") {
    const capture =
      orderData.purchase_units?.[0]?.payments?.captures?.[0];
    return {
      orderId: orderData.id,
      captureId: capture?.id || orderData.id,
      status: "COMPLETED",
    };
  }

  // Otherwise, capture it
  const captureResult = await capturePayPalOrder(
    params.config,
    orderData.id
  );
  return {
    orderId: orderData.id,
    captureId: captureResult.captureId,
    status: captureResult.status,
  };
}

export async function listPayPalVaultedTokens(
  config: PayPalConfig,
  customerId: string
): Promise<Array<{ id: string; payerEmail?: string }>> {
  const res = await paypalFetch(
    `/v3/vault/payment-tokens?customer_id=${encodeURIComponent(customerId)}`,
    config
  );

  if (!res.ok) return [];

  const data = await res.json();
  return (data.payment_tokens || []).map(
    (t: { id: string; payment_source?: { paypal?: { email_address?: string } } }) => ({
      id: t.id,
      payerEmail: t.payment_source?.paypal?.email_address,
    })
  );
}

export async function deletePayPalVaultedToken(
  config: PayPalConfig,
  tokenId: string
): Promise<void> {
  const res = await paypalFetch(
    `/v3/vault/payment-tokens/${tokenId}`,
    config,
    { method: "DELETE" }
  );
  if (!res.ok && res.status !== 204) {
    throw new Error(`PayPal delete vault token failed: ${res.statusText}`);
  }
}

// --- Webhook verification ---

export async function verifyPayPalWebhook(params: {
  config: PayPalConfig;
  webhookId: string;
  headers: Record<string, string>;
  body: string;
}): Promise<boolean> {
  const res = await paypalFetch(
    "/v1/notifications/verify-webhook-signature",
    params.config,
    {
      method: "POST",
      body: JSON.stringify({
        webhook_id: params.webhookId,
        transmission_id: params.headers["paypal-transmission-id"],
        transmission_time: params.headers["paypal-transmission-time"],
        cert_url: params.headers["paypal-cert-url"],
        auth_algo: params.headers["paypal-auth-algo"],
        transmission_sig: params.headers["paypal-transmission-sig"],
        webhook_event: JSON.parse(params.body),
      }),
    }
  );

  if (!res.ok) return false;
  const data = await res.json();
  return data.verification_status === "SUCCESS";
}
