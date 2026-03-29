import { authenticate } from "../shopify.server";
import {
  forwardShopifyWebhookToLaravel,
  logWebhookReceived,
} from "../utils/forwardShopifyWebhook.server";

export const action = async ({ request }) => {
  const { topic, payload, shop } = await authenticate.webhook(request);

  logWebhookReceived("products_update_webhook_received", {
    topic,
    shop: shop ?? null,
    productId: payload?.id ?? null,
  });

  if (!topic || (topic !== "PRODUCTS_UPDATE" && topic !== "products/update")) {
    throw new Response("Bad Request", { status: 400 });
  }

  await forwardShopifyWebhookToLaravel({
    path: "/api/webhooks/shopify/products/update",
    payload,
    label: "products/update",
    shop,
  });

  return new Response(null, { status: 200 });
};
