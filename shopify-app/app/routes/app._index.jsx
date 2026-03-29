import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};

export default function Index() {
  return (
    <s-page heading="SyncBridge Dashboard">
      <div
        style={{
          maxWidth: "900px",
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: "20px",
        }}
      >
        {/* Intro */}
        <s-section heading="B2B Sync & Inventory Orchestrator">
          <div
            style={{
              padding: "16px",
              borderRadius: "14px",
              border: "1px solid #e5e7eb",
              background: "#ffffff",
            }}
          >
            <s-paragraph>
              SyncBridge, Laravel panelindeki ürün, stok ve B2B fiyat verilerini
              Shopify ile senkronize eden bir entegrasyon platformudur.
            </s-paragraph>

            <div style={{ marginTop: "10px", opacity: 0.8 }}>
              <s-paragraph>
                ✔ Gerçek zamanlı stok senkronizasyonu
              </s-paragraph>
              <s-paragraph>
                ✔ B2B müşteri bazlı fiyatlandırma (metafield + function)
              </s-paragraph>
              <s-paragraph>
                ✔ Full & incremental senkron desteği
              </s-paragraph>
            </div>
          </div>
        </s-section>

        {/* Actions */}
        <s-section heading="Hızlı İşlemler">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: "16px",
            }}
          >
            {/* Sync Card */}
            <a href="/app/sync" style={{ textDecoration: "none" }}>
              <div
                style={{
                  padding: "18px",
                  borderRadius: "14px",
                  border: "1px solid #e5e7eb",
                  background: "#ffffff",
                  transition: "0.2s ease",
                  cursor: "pointer",
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: "6px" }}>
                  Manual Sync
                </div>
                <div style={{ fontSize: "13px", opacity: 0.7 }}>
                  Laravel → Shopify veri senkronizasyonunu başlat
                </div>
              </div>
            </a>

            {/* Logs Card */}
            <a href="/app/logs" style={{ textDecoration: "none" }}>
              <div
                style={{
                  padding: "18px",
                  borderRadius: "14px",
                  border: "1px solid #e5e7eb",
                  background: "#ffffff",
                  transition: "0.2s ease",
                  cursor: "pointer",
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: "6px" }}>
                  Sync Logs
                </div>
                <div style={{ fontSize: "13px", opacity: 0.7 }}>
                  Senkron geçmişini ve hata kayıtlarını görüntüle
                </div>
              </div>
            </a>
          </div>
        </s-section>

        {/* Status */}
        <s-section heading="Sistem Durumu">
          <div
            style={{
              padding: "16px",
              borderRadius: "14px",
              border: "1px solid #e5e7eb",
              background: "#ffffff",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontWeight: 600 }}>Sistem aktif</div>
              <div style={{ fontSize: "13px", opacity: 0.7 }}>
                Shopify bağlantısı ve API erişimi hazır
              </div>
            </div>

            <div
              style={{
                padding: "6px 12px",
                borderRadius: "999px",
                background: "#dcfce7",
                color: "#166534",
                fontSize: "12px",
                fontWeight: 600,
              }}
            >
              ONLINE
            </div>
          </div>
        </s-section>
      </div>
    </s-page>
  );
}