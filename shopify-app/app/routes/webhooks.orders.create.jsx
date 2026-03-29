import { authenticate } from "../shopify.server";
import {
  forwardShopifyWebhookToLaravel,
  logWebhookReceived,
} from "../utils/forwardShopifyWebhook.server";

export const action = async ({ request }) => {
  const { topic, payload, shop } = await authenticate.webhook(request);

  logWebhookReceived("orders_create_webhook_received", {
    topic,
    shop: shop ?? null,
    orderId: payload?.id ?? null,
  });

  if (topic !== "ORDERS_CREATE" && topic !== "orders/create") {
    throw new Response("Bad Request", { status: 400 });
  }

  await forwardShopifyWebhookToLaravel({
    path: "/api/webhooks/shopify/orders/create",
    payload,
    label: "orders/create",
    shop,
  });

  return new Response(null, { status: 200 });
};
