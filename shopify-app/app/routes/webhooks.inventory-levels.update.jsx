import { authenticate } from "../shopify.server";
import {
  forwardShopifyWebhookToLaravel,
  logWebhookReceived,
} from "../utils/forwardShopifyWebhook.server";

export const action = async ({ request }) => {
  const { topic, payload, shop } = await authenticate.webhook(request);

  logWebhookReceived("inventory_levels_update_webhook_received", {
    topic,
    shop: shop ?? null,
    inventoryItemId: payload?.inventory_item_id ?? null,
  });

  if (topic !== "INVENTORY_LEVELS_UPDATE" && topic !== "inventory_levels/update") {
    throw new Response("Bad Request", { status: 400 });
  }

  await forwardShopifyWebhookToLaravel({
    path: "/api/webhooks/shopify/inventory-levels/update",
    payload,
    label: "inventory_levels/update",
    shop,
  });

  return new Response(null, { status: 200 });
};
