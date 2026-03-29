import { useEffect, useMemo, useState } from "react";
import { useLoaderData } from "react-router";
import {
  AppProvider as PolarisAppProvider,
  BlockStack,
  Button,
  Card,
  Collapsible,
  DataTable,
  InlineStack,
  Text,
} from "@shopify/polaris";
import tr from "@shopify/polaris/locales/tr.json";
import { authenticate } from "../shopify.server";
import {
  formatCountCell,
  formatMetadataJson,
  formatSyncModeCell,
  getCounts,
  getErrors,
  getFailedCountDisplay,
  getMappingAppliedOk,
  getMarkedProducts,
  getMetafieldsSummary,
  getStocksSummary,
  logHasErrors,
  truncateMessage,
} from "../utils/syncLogMetadata";

function formatDateTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("tr-TR");
  } catch {
    return "—";
  }
}

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  // eslint-disable-next-line no-undef -- Node (Remix loader)
  const laravelUrl = process.env.LARAVEL_API_URL || "http://localhost:8000";
  // eslint-disable-next-line no-undef
  const apiSecret = process.env.API_SECRET_KEY || "";

  let logs = [];
  try {
    const res = await fetch(
      `${laravelUrl}/api/sync/logs?shop=${encodeURIComponent(session.shop)}`,
      {
        headers: { "X-API-Secret": apiSecret },
      },
    );

    if (res.ok) {
      const data = await res.json();
      logs = data.data || [];
    }
  } catch (e) {
    logs = [];
  }

  return { logs };
};

const TABLE_HEADINGS = [
  "ID",
  "Tip",
  "Durum",
  "Sync modu",
  "Oluşturuldu",
  "Güncellendi",
  "Arşiv",
  "Atlandı",
  "Başarısız",
  "İşlenen*",
  "Mesaj",
  "Başlangıç",
  "Bitiş",
  "",
];

const COLUMN_TYPES = [
  "numeric", // ID
  "text",
  "text",
  "text",
  "numeric", // created
  "numeric", // updated
  "numeric", // archived
  "numeric", // skipped
  "numeric", // failed
  "numeric", // items_processed
  "text", // message
  "text",
  "text",
  "text", // Detay button
];

const PAGE_SIZE = 5;

export default function LogsPage() {
  const { logs } = useLoaderData();
  const [selectedId, setSelectedId] = useState(null);
  const [rawJsonOpen, setRawJsonOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const list = logs ?? [];
  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const page = Math.max(1, Math.min(currentPage, totalPages));

  useEffect(() => {
    setCurrentPage((p) => Math.max(1, Math.min(p, totalPages)));
  }, [logs, totalPages]);

  useEffect(() => {
    setSelectedId(null);
  }, [page]);

  const paginatedLogs = useMemo(
    () => list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [list, page],
  );

  const anyLogHasErrors = useMemo(
    () => list.some((l) => logHasErrors(l)),
    [list],
  );

  const selectedLog = useMemo(() => {
    if (selectedId == null) return null;
    const sid = String(selectedId);
    return list.find((l) => String(l.id) === sid) ?? null;
  }, [list, selectedId]);

  const detailStocks = selectedLog ? getStocksSummary(selectedLog) : null;
  const detailMetafields = selectedLog
    ? getMetafieldsSummary(selectedLog)
    : null;
  const detailMapOk = selectedLog ? getMappingAppliedOk(selectedLog) : null;
  const detailMarked = selectedLog ? getMarkedProducts(selectedLog) : null;
  const detailErrorsList = selectedLog ? getErrors(selectedLog) : [];

  const rows = useMemo(() => {
    return paginatedLogs.map((log) => {
      const c = getCounts(log);
      const failedDisplay = getFailedCountDisplay(log);
      const idStr = String(log.id);
      const isRowSelected = String(selectedId ?? "") === idStr;
      return [
        String(log.id),
        log.sync_type ?? "—",
        log.status ?? "—",
        formatSyncModeCell(log),
        formatCountCell(c.created),
        formatCountCell(c.updated),
        formatCountCell(c.archived),
        formatCountCell(c.skipped),
        formatCountCell(failedDisplay),
        formatCountCell(
          typeof log.items_processed === "number"
            ? log.items_processed
            : null,
        ),
        truncateMessage(log.message),
        formatDateTime(log.started_at),
        formatDateTime(log.completed_at),
        <Button
          key={`detail-${log.id}`}
          size="slim"
          onClick={() => {
            setSelectedId((prev) =>
              String(prev ?? "") === idStr ? null : idStr,
            );
            setRawJsonOpen(false);
          }}
        >
          {isRowSelected ? "Gizle" : "Detay"}
        </Button>,
      ];
    });
  }, [paginatedLogs, selectedId]);

  return (
    <s-page heading="Sync Logs">
      <s-section heading="Son Senkronizasyon İşlemleri">
  
        {anyLogHasErrors && (
          <s-banner tone="warning">
            <s-paragraph>
              Bazı senkronlarda ürün bazlı hatalar var. Detay için satırdan “Detay” seç.
            </s-paragraph>
          </s-banner>
        )}
  
        <div style={{ marginTop: 16 }}>
          <PolarisAppProvider i18n={tr}>
            <BlockStack gap="400">
  
              {/* 🔹 ÖZET KARTLAR */}
              <InlineStack gap="300" wrap>
                <Card>
                  <BlockStack gap="100">
                    <Text variant="bodySm" tone="subdued">Toplam log</Text>
                    <Text variant="headingMd">{list.length}</Text>
                  </BlockStack>
                </Card>
  
                <Card>
                  <BlockStack gap="100">
                    <Text variant="bodySm" tone="subdued">Hatalı</Text>
                    <Text variant="headingMd">
                      {list.filter((l) => logHasErrors(l)).length}
                    </Text>
                  </BlockStack>
                </Card>
  
                <Card>
                  <BlockStack gap="100">
                    <Text variant="bodySm" tone="subdued">Son kayıt</Text>
                    <Text variant="bodyMd">
                      {list.length > 0 ? formatDateTime(list[0]?.started_at) : "—"}
                    </Text>
                  </BlockStack>
                </Card>
              </InlineStack>
  
              {/* 🔹 TABLO */}
              {list.length === 0 ? (
                <Card>
                  <Text>Henüz log kaydı yok.</Text>
                </Card>
              ) : (
                <>
                  <Card>
                    <BlockStack gap="300">
                      <Text variant="headingMd">Senkronizasyon Geçmişi</Text>
  
                      <div style={{ overflowX: "auto" }}>
                        <DataTable
                          columnContentTypes={COLUMN_TYPES}
                          headings={TABLE_HEADINGS}
                          rows={rows}
                        />
                      </div>
                    </BlockStack>
                  </Card>
  
                  {/* 🔹 PAGINATION */}
                  <Card>
                    <InlineStack align="space-between" blockAlign="center">
                      <Text tone="subdued">
                        Sayfa {page} / {totalPages}
                      </Text>
  
                      <InlineStack gap="200">
                        <Button
                          size="slim"
                          disabled={page <= 1}
                          onClick={() => setCurrentPage(page - 1)}
                        >
                          Önceki
                        </Button>
  
                        <Button
                          size="slim"
                          disabled={page >= totalPages}
                          onClick={() => setCurrentPage(page + 1)}
                        >
                          Sonraki
                        </Button>
                      </InlineStack>
                    </InlineStack>
                  </Card>
  
                  <Text tone="subdued" variant="bodySm">
                    * İşlenen: legacy alan (metadata.counts kullanılır)
                  </Text>
  
                  {/* 🔹 DETAY */}
                  {selectedLog && (
                    <Card>
                      <BlockStack gap="300">
  
                        {/* HEADER */}
                        <InlineStack align="space-between">
                          <BlockStack gap="050">
                            <Text variant="headingMd">
                              Log #{selectedLog.id}
                            </Text>
                            <Text tone="subdued" variant="bodySm">
                              {selectedLog.sync_type} · {selectedLog.status}
                            </Text>
                          </BlockStack>
  
                          <Button
                            tone="critical"
                            variant="plain"
                            onClick={() => setSelectedId(null)}
                          >
                            Kapat
                          </Button>
                        </InlineStack>
  
                        {/* MESAJ */}
                        <BlockStack gap="100">
                          <Text fontWeight="semibold">Mesaj</Text>
                          <Text>{selectedLog.message || "—"}</Text>
                        </BlockStack>
  
                        {/* ZAMAN */}
                        <Text tone="subdued">
                          {formatDateTime(selectedLog.started_at)} →{" "}
                          {formatDateTime(selectedLog.completed_at)}
                        </Text>
  
                        {/* EXTRA INFO */}
                        {(detailMapOk !== null || detailMarked !== null) && (
                          <Text tone="subdued">
                            {detailMapOk !== null &&
                              `Mapping: ${detailMapOk ? "ok" : "fail"}`}
                            {detailMarked !== null &&
                              ` · İşaretlenen: ${detailMarked}`}
                          </Text>
                        )}
  
                        {/* STOCK */}
                        <Text tone="subdued">
                          Stok → {detailStocks?.processed ?? 0} ok /{" "}
                          {detailStocks?.failed ?? 0} hata
                        </Text>
  
                        {/* META */}
                        <Text tone="subdued">
                          Metafield → {detailMetafields?.processed ?? 0} ok /{" "}
                          {detailMetafields?.failed ?? 0} hata
                        </Text>
  
                        {/* 🔴 HATALAR */}
                        <BlockStack gap="200">
                          <Text fontWeight="semibold">
                            Hatalar ({detailErrorsList.length})
                          </Text>
  
                          {detailErrorsList.length === 0 ? (
                            <Text tone="subdued">Hata yok</Text>
                          ) : (
                            <div
                              style={{
                                maxHeight: 220,
                                overflow: "auto",
                                padding: 12,
                                border: "1px solid #eee",
                                borderRadius: 12,
                                background: "#fafafa",
                              }}
                            >
                              {detailErrorsList.map((err, i) => (
                                <div key={i} style={{ marginBottom: 8 }}>
                                  <Text>
                                    <b>{err.sku}</b> [{err.step}] —{" "}
                                    {err.message}
                                  </Text>
                                </div>
                              ))}
                            </div>
                          )}
                        </BlockStack>
  
                        {/* RAW */}
                        <Button onClick={() => setRawJsonOpen((o) => !o)}>
                          {rawJsonOpen ? "Gizle" : "Ham veri"}
                        </Button>
  
                        <Collapsible open={rawJsonOpen}>
                          <pre
                            style={{
                              padding: 12,
                              fontSize: 12,
                              background: "#f6f6f6",
                              borderRadius: 8,
                            }}
                          >
                            {formatMetadataJson(selectedLog.metadata)}
                          </pre>
                        </Collapsible>
                      </BlockStack>
                    </Card>
                  )}
                </>
              )}
            </BlockStack>
          </PolarisAppProvider>
        </div>
      </s-section>
    </s-page>
  );
}
