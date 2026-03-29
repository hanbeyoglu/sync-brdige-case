/**
 * Shopify webhook payload'ını (Node'da HMAC doğrulandıktan sonra) Laravel'e JSON ile iletir.
 * Başarısız olursa loglar ve 502 döner (Shopify yeniden denemeleri tetiklenebilir).
 */

function logStructured(event, data) {
  console.log(
    JSON.stringify({
      level: "info",
      component: "syncbridge-webhook-forward",
      event,
      timestamp: new Date().toISOString(),
      ...data,
    }),
  );
}

/** Webhook route dosyalarında “alındı” logları için */
export function logWebhookReceived(event, data) {
  logStructured(event, data);
}

function logError(event, data) {
  console.error(
    JSON.stringify({
      level: "error",
      component: "syncbridge-webhook-forward",
      event,
      timestamp: new Date().toISOString(),
      ...data,
    }),
  );
}

/**
 * @param {object} options
 * @param {string} options.path - Örn. "/api/webhooks/shopify/orders/create"
 * @param {Record<string, unknown>} options.payload - authenticate.webhook payload
 * @param {string} [options.label] - Log etiketi
 * @param {string} [options.shop] - Opsiyonel mağaza alanı
 */
export async function forwardShopifyWebhookToLaravel({
  path,
  payload,
  label = "webhook",
  shop,
}) {
  const internalSecret = process.env.INTERNAL_SECRET;
  if (!internalSecret) {
    logError("forward_missing_internal_secret", { label, path });
    throw new Response("Internal configuration error", { status: 500 });
  }

  const laravelUrl = process.env.LARAVEL_API_URL || "http://localhost:8000";
  const url = `${laravelUrl}${path}`;

  logStructured("forward_to_laravel_start", {
    label,
    path,
    shop: shop ?? null,
  });

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": internalSecret,
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    logError("forward_fetch_failed", {
      label,
      path,
      message: err instanceof Error ? err.message : String(err),
    });
    throw new Response("Laravel unreachable", {
      status: 502,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const snippet = text.length > 800 ? `${text.slice(0, 800)}…` : text;
    logError("forward_laravel_error", {
      label,
      path,
      status: res.status,
      statusText: res.statusText,
      bodySnippet: snippet || "(empty body)",
    });
    throw new Response(snippet || "Laravel webhook forward failed", {
      status: 502,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  logStructured("forward_to_laravel_ok", {
    label,
    path,
    status: res.status,
  });
}
