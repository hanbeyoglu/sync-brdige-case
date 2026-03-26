import { authenticate } from "../shopify.server";
import { forwardShopifyWebhookToLaravel } from "../utils/forwardShopifyWebhook.server";

export const action = async ({ request }) => {
  const { topic } = await authenticate.webhook(request);
  if (topic !== "INVENTORY_ITEMS_UPDATE" && topic !== "inventory_items/update") {
    throw new Response("Bad Request", { status: 400 });
  }

  const body = await request.text();
  const hmac = request.headers.get("X-Shopify-Hmac-Sha256");

  await forwardShopifyWebhookToLaravel({
    path: "/api/webhooks/shopify/inventory/update",
    body,
    hmacHeader: hmac,
    label: "inventory_items/update",
  });

  return new Response(null, { status: 200 });
};
