import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};

export default function Index() {
  return (
    <s-page heading="SyncBridge Dashboard">
      <s-section heading="B2B Sync & Inventory Orchestrator">
        <s-paragraph>
          SyncBridge, Laravel panelindeki ürün, stok ve fiyat verilerini Shopify
          ile senkronize eden bir entegrasyon uygulamasıdır.
        </s-paragraph>
      </s-section>

      <s-section heading="Available actions">
        <s-stack direction="block" gap="base">
          <s-link href="/app/sync">Go to manual sync</s-link>
          <s-link href="/app/logs">View sync logs</s-link>
        </s-stack>
      </s-section>
    </s-page>
  );
}
