import { authenticate } from "../shopify.server";
import { forwardShopifyWebhookToLaravel } from "../utils/forwardShopifyWebhook.server";

export const action = async ({ request }) => {
  const { topic } = await authenticate.webhook(request);
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/5ac70a81-aa07-4a21-ba92-0e8fb13b3adf',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:'initial',hypothesisId:'H1',location:'webhooks.orders.create.jsx:6',message:'orders webhook authenticated',data:{topic},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  if (topic !== "ORDERS_CREATE" && topic !== "orders/create") {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/5ac70a81-aa07-4a21-ba92-0e8fb13b3adf',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:'initial',hypothesisId:'H1',location:'webhooks.orders.create.jsx:9',message:'orders webhook rejected by topic guard',data:{topic},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    throw new Response("Bad Request", { status: 400 });
  }

  const body = await request.text();
  const hmac = request.headers.get("X-Shopify-Hmac-Sha256");
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/5ac70a81-aa07-4a21-ba92-0e8fb13b3adf',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:'initial',hypothesisId:'H2',location:'webhooks.orders.create.jsx:17',message:'forwarding orders webhook to laravel',data:{hasHmac:Boolean(hmac),bodyLength:body.length,path:'/api/webhooks/shopify/orders/create'},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

  await forwardShopifyWebhookToLaravel({
    path: "/api/webhooks/shopify/orders/create",
    body,
    hmacHeader: hmac,
    label: "orders/create",
  });

  return new Response(null, { status: 200 });
};
