import { authenticate } from "../shopify.server";
import {
  forwardShopifyWebhookToLaravel,
  logWebhookReceived,
} from "../utils/forwardShopifyWebhook.server";

export const action = async ({ request }) => {
  const { topic, payload, shop } = await authenticate.webhook(request);

  logWebhookReceived("inventory_items_update_webhook_received", {
    topic,
    shop: shop ?? null,
    inventoryItemId: payload?.id ?? null,
  });

  if (topic !== "INVENTORY_ITEMS_UPDATE" && topic !== "inventory_items/update") {
    throw new Response("Bad Request", { status: 400 });
  }

  await forwardShopifyWebhookToLaravel({
    path: "/api/webhooks/shopify/inventory/update",
    payload,
    label: "inventory_items/update",
    shop,
  });

  return new Response(null, { status: 200 });
};
