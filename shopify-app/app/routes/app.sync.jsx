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

  const laravelUrl = process.env.LARAVEL_API_URL || "https://syncbridge-api.hanbeyoglu.com";
  const internalSecret = process.env.INTERNAL_SECRET_KEY || "";

  const response = await fetch(`${laravelUrl}/api/sync/trigger`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": internalSecret,
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
    internalSecret,
    syncMode,
  );

  const errorDetails = (syncResult.errors ?? []).slice(0, 100);

  if (data.sync_log_id) {
    await fetch(`${laravelUrl}/api/sync/logs/${data.sync_log_id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": internalSecret,
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

async function runSyncToShopify(admin, laravelUrl, internalSecret, syncMode = "full") {
  const products = await fetchProductsFromLaravel(
    laravelUrl,
    internalSecret,
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
          "x-internal-secret": internalSecret,
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
          "x-internal-secret": internalSecret,
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
      <div
        style={{
          maxWidth: "900px",
          margin: "0 auto",
          padding: "8px 0 24px 0",
        }}
      >
        <s-section heading="Laravel → Shopify Sync">
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "16px",
              padding: "8px 4px",
            }}
          >
            <div
              style={{
                padding: "16px",
                border: "1px solid #e5e7eb",
                borderRadius: "14px",
                background: "#ffffff",
              }}
            >
              <s-paragraph>
                Laravel panelindeki ürün, stok ve fiyat verilerini Shopify mağazasına aktarır.
              </s-paragraph>
              <div style={{ marginTop: "10px", opacity: 0.8 }}>
                <s-paragraph>Store: {shop}</s-paragraph>
              </div>
            </div>
  
            {fetcher.data?.success ? (
              <div
                style={{
                  padding: "16px",
                  borderRadius: "14px",
                  border:
                    (fetcher.data.failed ?? 0) > 0 ||
                    (fetcher.data.errors?.length ?? 0) > 0
                      ? "1px solid #f59e0b"
                      : "1px solid #22c55e",
                  background:
                    (fetcher.data.failed ?? 0) > 0 ||
                    (fetcher.data.errors?.length ?? 0) > 0
                      ? "#fff7ed"
                      : "#f0fdf4",
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: "8px" }}>
                  Senkronizasyon Sonucu
                </div>
  
                <s-paragraph>{fetcher.data.message}</s-paragraph>
  
                {fetcher.data.created != null ? (
                  <div
                    style={{
                      marginTop: "12px",
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                      gap: "10px",
                    }}
                  >
                    <div
                      style={{
                        padding: "10px 12px",
                        borderRadius: "10px",
                        background: "#fff",
                        border: "1px solid #e5e7eb",
                      }}
                    >
                      <div style={{ fontSize: "12px", opacity: 0.7 }}>Oluşturuldu</div>
                      <div style={{ fontWeight: 700, fontSize: "18px" }}>
                        {fetcher.data.created}
                      </div>
                    </div>
  
                    <div
                      style={{
                        padding: "10px 12px",
                        borderRadius: "10px",
                        background: "#fff",
                        border: "1px solid #e5e7eb",
                      }}
                    >
                      <div style={{ fontSize: "12px", opacity: 0.7 }}>Güncellendi</div>
                      <div style={{ fontWeight: 700, fontSize: "18px" }}>
                        {fetcher.data.updated}
                      </div>
                    </div>
  
                    <div
                      style={{
                        padding: "10px 12px",
                        borderRadius: "10px",
                        background: "#fff",
                        border: "1px solid #e5e7eb",
                      }}
                    >
                      <div style={{ fontSize: "12px", opacity: 0.7 }}>Atlandı</div>
                      <div style={{ fontWeight: 700, fontSize: "18px" }}>
                        {fetcher.data.skipped}
                      </div>
                    </div>
  
                    <div
                      style={{
                        padding: "10px 12px",
                        borderRadius: "10px",
                        background: "#fff",
                        border: "1px solid #e5e7eb",
                      }}
                    >
                      <div style={{ fontSize: "12px", opacity: 0.7 }}>Arşivlendi</div>
                      <div style={{ fontWeight: 700, fontSize: "18px" }}>
                        {fetcher.data.archived}
                      </div>
                    </div>
  
                    <div
                      style={{
                        padding: "10px 12px",
                        borderRadius: "10px",
                        background: "#fff",
                        border: "1px solid #e5e7eb",
                      }}
                    >
                      <div style={{ fontSize: "12px", opacity: 0.7 }}>Hata</div>
                      <div style={{ fontWeight: 700, fontSize: "18px" }}>
                        {fetcher.data.failed}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
  
            {fetcher.data?.error ? (
              <div
                style={{
                  padding: "16px",
                  borderRadius: "14px",
                  border: "1px solid #ef4444",
                  background: "#fef2f2",
                  color: "#991b1b",
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: "6px" }}>Hata</div>
                <div>{fetcher.data.error}</div>
              </div>
            ) : null}
  
            {fetcher.data?.errors && fetcher.data.errors.length > 0 ? (
              <div
                style={{
                  padding: "16px",
                  borderRadius: "14px",
                  border: "1px solid #ef4444",
                  background: "#fff",
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: "10px" }}>
                  Hata Detayları ({fetcher.data.errors.length})
                </div>
  
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                    maxHeight: "260px",
                    overflowY: "auto",
                  }}
                >
                  {fetcher.data.errors.map((error, index) => (
                    <div
                      key={index}
                      style={{
                        padding: "10px 12px",
                        borderRadius: "10px",
                        background: "#f9fafb",
                        border: "1px solid #e5e7eb",
                      }}
                    >
                      <strong>{error.sku}</strong> [{error.step}] - {error.message}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
  
            <div
              style={{
                padding: "16px",
                border: "1px solid #e5e7eb",
                borderRadius: "14px",
                background: "#ffffff",
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: "12px" }}>
                Senkronizasyon İşlemleri
              </div>
  
              <fetcher.Form method="post">
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "12px",
                  }}
                >
                  <button
                    type="submit"
                    name="sync_mode"
                    value="full"
                    disabled={isSyncing}
                    style={{
                      border: "none",
                      borderRadius: "12px",
                      padding: "12px 18px",
                      fontWeight: 600,
                      cursor: isSyncing ? "not-allowed" : "pointer",
                      background: isSyncing ? "#cbd5e1" : "#111827",
                      color: "#fff",
                      minWidth: "220px",
                      transition: "0.2s ease",
                    }}
                  >
                    {isSyncing ? "Senkronize ediliyor..." : "Tam senkron (tüm ürünler)"}
                  </button>
  
                  <button
                    type="submit"
                    name="sync_mode"
                    value="incremental"
                    disabled={isSyncing}
                    style={{
                      border: "1px solid #d1d5db",
                      borderRadius: "12px",
                      padding: "12px 18px",
                      fontWeight: 600,
                      cursor: isSyncing ? "not-allowed" : "pointer",
                      background: isSyncing ? "#f3f4f6" : "#ffffff",
                      color: "#111827",
                      minWidth: "220px",
                      transition: "0.2s ease",
                    }}
                  >
                    Incremental (değişenler)
                  </button>
                </div>
              </fetcher.Form>
            </div>
          </div>
        </s-section>
      </div>
    </s-page>
  );
}
