/**
 * Shopify webhook gövdesini Laravel'e iletir. Başarısız olursa loglar ve 502 döner
 * (Shopify yeniden denemeleri tetiklenebilir).
 */
export async function forwardShopifyWebhookToLaravel({
  path,
  body,
  hmacHeader,
  label = "webhook",
}) {
  const laravelUrl = process.env.LARAVEL_API_URL || "http://localhost:8000";
  const res = await fetch(`${laravelUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Hmac-Sha256": hmacHeader || "",
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const snippet = text.length > 800 ? `${text.slice(0, 800)}…` : text;
    console.error(
      `[SyncBridge] Laravel webhook forward failed (${label}): ${res.status} ${res.statusText}`,
      snippet || "(empty body)",
    );
    throw new Response(snippet || "Laravel webhook forward failed", {
      status: 502,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
