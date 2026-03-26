import { useLoaderData, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import {
  fetchProductsFromLaravel,
  getShopifyProductsBySku,
  runBulkSync,
} from "../services/bulkSync.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  return { shop: session.shop };
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const syncMode =
    formData.get("sync_mode") === "incremental" ? "incremental" : "full";
  const syncType =
    syncMode === "incremental" ? "manual_incremental" : "manual";

  const laravelUrl = process.env.LARAVEL_API_URL || "http://localhost:8000";
  const apiSecret = process.env.API_SECRET_KEY || "";

  const response = await fetch(`${laravelUrl}/api/sync/trigger`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Secret": apiSecret,
    },
    body: JSON.stringify({
      shop_domain: session.shop,
      sync_type: syncType,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    return {
      success: false,
      error: data.error || "Senkronizasyon tetiklenemedi",
    };
  }

  const syncResult = await runSyncToShopify(
    admin,
    laravelUrl,
    apiSecret,
    syncMode,
  );

  const errorDetails = (syncResult.errors ?? []).slice(0, 100);

  if (data.sync_log_id) {
    await fetch(`${laravelUrl}/api/sync/logs/${data.sync_log_id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-API-Secret": apiSecret,
      },
      body: JSON.stringify({
        status: "completed",
        message: syncResult.message,
        items_processed: syncResult.itemsProcessed,
        items_failed: syncResult.itemsFailed,
        metadata: {
          sync_mode: syncMode,
          marked_products: syncResult.markedProducts ?? 0,
          mapping_applied_ok: syncResult.mappingAppliedOk !== false,
          counts: {
            created: syncResult.created ?? 0,
            updated: syncResult.updated ?? 0,
            skipped: syncResult.skipped ?? 0,
            archived: syncResult.archived ?? 0,
            failed: syncResult.failed ?? 0,
          },
          stocks: {
            processed: syncResult.stocksProcessed,
            failed: syncResult.stocksFailed,
          },
          metafields: {
            processed: syncResult.metafieldsProcessed ?? 0,
            failed: syncResult.metafieldsFailed ?? 0,
          },
          errors: errorDetails,
        },
      }),
    });
  }

  return {
    success: true,
    syncLogId: data.sync_log_id,
    message: syncResult.message,
    itemsProcessed: syncResult.itemsProcessed,
    itemsFailed: syncResult.itemsFailed,
    stocksProcessed: syncResult.stocksProcessed,
    stocksFailed: syncResult.stocksFailed,
    metafieldsProcessed: syncResult.metafieldsProcessed ?? 0,
    metafieldsFailed: syncResult.metafieldsFailed ?? 0,
    created: syncResult.created ?? 0,
    updated: syncResult.updated ?? 0,
    skipped: syncResult.skipped ?? 0,
    archived: syncResult.archived ?? 0,
    failed: syncResult.failed ?? 0,
    errors: errorDetails,
  };
};

async function runSyncToShopify(admin, laravelUrl, apiSecret, syncMode = "full") {
  const products = await fetchProductsFromLaravel(
    laravelUrl,
    apiSecret,
    syncMode,
  );

  if (!products || products.length === 0) {
    return {
      message:
        syncMode === "incremental"
          ? "Incremental: senkron gerektiren ürün yok."
          : "Laravel API'den ürün bulunamadı",
      created: 0,
      updated: 0,
      skipped: 0,
      archived: 0,
      itemsProcessed: 0,
      itemsFailed: 0,
      stocksProcessed: 0,
      stocksFailed: 0,
      metafieldsProcessed: 0,
      metafieldsFailed: 0,
      errors: [],
      syncedSkus: [],
      markedProducts: 0,
      mappingAppliedOk: true,
    };
  }

  const skuMap = await getShopifyProductsBySku(admin);
  const {
    created,
    updated,
    skipped,
    archived,
    failed,
    errors,
    processed,
    stocksProcessed,
    stocksFailed,
    metafieldsProcessed,
    metafieldsFailed,
    mapping,
    archiveMappings,
    syncedSkus,
  } = await runBulkSync(admin, products, skuMap);

  const mappingPayload = [
    ...(mapping ?? []),
    ...(archiveMappings ?? []),
  ];

  let mappingAppliedOk = true;
  if (mappingPayload.length > 0) {
    try {
      const mapRes = await fetch(`${laravelUrl}/api/sync/apply-mapping`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Secret": apiSecret,
        },
        body: JSON.stringify(mappingPayload),
      });
      mappingAppliedOk = mapRes.ok;
      if (!mapRes.ok) {
        const t = await mapRes.text().catch(() => "");
        console.error(
          "[SyncBridge] apply-mapping failed:",
          mapRes.status,
          t?.slice?.(0, 500),
        );
      }
    } catch (e) {
      mappingAppliedOk = false;
      console.warn("Mapping endpoint hatası:", e);
    }
  }

  let markedProducts = 0;
  if (
    mappingAppliedOk &&
    Array.isArray(syncedSkus) &&
    syncedSkus.length > 0
  ) {
    try {
      const markRes = await fetch(`${laravelUrl}/api/sync/mark-synced`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Secret": apiSecret,
        },
        body: JSON.stringify({ skus: syncedSkus }),
      });
      if (markRes.ok) {
        const markJson = await markRes.json().catch(() => ({}));
        markedProducts = markJson.marked ?? syncedSkus.length;
      } else {
        const t = await markRes.text().catch(() => "");
        console.error(
          "[SyncBridge] mark-synced failed:",
          markRes.status,
          t?.slice?.(0, 500),
        );
      }
    } catch (e) {
      console.warn("mark-synced hatası:", e);
    }
  }

  const parts = [];

  if ((created ?? 0) > 0) {
    parts.push(`Ürün: ${created} oluşturuldu`);
  }
  if ((updated ?? 0) > 0) {
    parts.push(`Fiyat: ${updated} güncellendi`);
  }
  if ((skipped ?? 0) > 0) {
    parts.push(`Atlanan: ${skipped}`);
  }
  if ((archived ?? 0) > 0) {
    parts.push(`Arşivlendi: ${archived}`);
  }
  if ((failed ?? 0) > 0) {
    parts.push(`Hata: ${failed}`);
  }
  if ((stocksProcessed ?? 0) > 0 || (stocksFailed ?? 0) > 0) {
    parts.push(
      `Stok: ${stocksProcessed ?? 0} güncellendi, ${stocksFailed ?? 0} hata`,
    );
  }
  if ((metafieldsProcessed ?? 0) > 0 || (metafieldsFailed ?? 0) > 0) {
    parts.push(
      `B2B metafield: ${metafieldsProcessed ?? 0} güncellendi, ${metafieldsFailed ?? 0} hata`,
    );
  }

  return {
    message:
      parts.length > 0
        ? `Senkronizasyon tamamlandı. ${parts.join(" | ")}`
        : "Senkronizasyon tamamlandı.",
    created: created ?? 0,
    updated: updated ?? 0,
    skipped: skipped ?? 0,
    archived: archived ?? 0,
    failed: failed ?? 0,
    errors: errors ?? [],
    itemsProcessed: processed ?? (created ?? 0) + (updated ?? 0) + (archived ?? 0),
    itemsFailed: failed ?? 0,

    stocksProcessed: stocksProcessed ?? 0,
    stocksFailed: stocksFailed ?? 0,
    metafieldsProcessed: metafieldsProcessed ?? 0,
    metafieldsFailed: metafieldsFailed ?? 0,
    syncedSkus: syncedSkus ?? [],
    markedProducts,
    mappingAppliedOk,
  };
}

export default function SyncPage() {
  const { shop } = useLoaderData();
  const fetcher = useFetcher();
  const isSyncing = fetcher.state !== "idle";
  return (
    <s-page heading="Manual Sync">
      <s-section heading="Laravel → Shopify Sync">
        <s-paragraph>
          Laravel panelindeki ürün, stok ve fiyat verilerini Shopify mağazasına
          aktarır.
        </s-paragraph>
        <s-paragraph>Store: {shop}</s-paragraph>

        {fetcher.data?.success ? (
          <s-banner
            tone={
              (fetcher.data.failed ?? 0) > 0 ||
              (fetcher.data.errors?.length ?? 0) > 0
                ? "warning"
                : "success"
            }
          >
            <s-paragraph>{fetcher.data.message}</s-paragraph>
            {fetcher.data.created != null ? (
              <s-paragraph style={{ marginTop: 8 }}>
                Özet: oluşturuldu {fetcher.data.created} · güncellendi{" "}
                {fetcher.data.updated} · atlandı {fetcher.data.skipped} ·
                arşivlendi {fetcher.data.archived} · hata {fetcher.data.failed}
              </s-paragraph>
            ) : null}
          </s-banner>
        ) : null}

        {fetcher.data?.error ? (
          <s-banner tone="critical">{fetcher.data.error}</s-banner>
        ) : null}

        {fetcher.data?.errors && fetcher.data.errors.length > 0 ? (
          <div style={{ marginTop: "16px" }}>
            <s-banner tone="critical">
              <s-paragraph>
                {fetcher.data.errors.length} adet hata oluştu:
              </s-paragraph>

              {fetcher.data.errors.map((error, index) => (
                <s-paragraph key={index}>
                  <strong>{error.sku}</strong> [{error.step}] - {error.message}
                </s-paragraph>
              ))}
            </s-banner>
          </div>
        ) : null}

        <fetcher.Form method="post">
          <div
            style={{
              marginTop: "16px",
              display: "flex",
              flexWrap: "wrap",
              gap: "8px",
            }}
          >
            <s-button
              type="submit"
              name="sync_mode"
              value="full"
              {...(isSyncing ? { loading: true } : {})}
            >
              {isSyncing ? "Senkronize ediliyor..." : "Tam senkron (tüm ürünler)"}
            </s-button>
            <s-button
              type="submit"
              name="sync_mode"
              value="incremental"
              variant="secondary"
              {...(isSyncing ? { loading: true } : {})}
            >
              Incremental (değişenler)
            </s-button>
          </div>
        </fetcher.Form>
      </s-section>
    </s-page>
  );
}
