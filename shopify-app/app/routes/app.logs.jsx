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
        {anyLogHasErrors ? (
          <s-banner tone="warning">
            <s-paragraph>
              Bazı senkronlarda ürün bazlı hatalar kaydedildi. Detayları görmek
              için ilgili satırda &quot;Detay&quot; seçin.
            </s-paragraph>
          </s-banner>
        ) : null}
        <div
          style={{
            marginTop: anyLogHasErrors ? 16 : 0,
          }}
        >
          <PolarisAppProvider i18n={tr}>
            <BlockStack gap="400">
            {list.length === 0 ? (
              <s-paragraph>Henüz log kaydı yok.</s-paragraph>
            ) : (
              <BlockStack gap="400">
                <div style={{ overflowX: "auto" }}>
                  <DataTable
                    columnContentTypes={COLUMN_TYPES}
                    headings={TABLE_HEADINGS}
                    rows={rows}
                  />
                </div>
                <InlineStack gap="300" blockAlign="center" wrap>
                  <Button
                    size="slim"
                    disabled={page <= 1}
                    onClick={() => setCurrentPage(page - 1)}
                  >
                    Önceki
                  </Button>
                  <Text as="span" variant="bodySm" tone="subdued">
                    Sayfa {page} / {totalPages}
                  </Text>
                  <Button
                    size="slim"
                    disabled={page >= totalPages}
                    onClick={() => setCurrentPage(page + 1)}
                  >
                    Sonraki
                  </Button>
                </InlineStack>
                <Text as="p" tone="subdued" variant="bodySm">
                  * İşlenen: sunucunun toplu işlenen kayıt sayısı (legacy
                  alan); sayaçlar için metadata.counts kullanılır.
                </Text>

                {selectedLog ? (
                  <Card>
                    <BlockStack gap="300">
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 12,
                          flexWrap: "wrap",
                        }}
                      >
                        <Text as="h3" variant="headingMd">
                          Log #{selectedLog.id}
                        </Text>
                        <Button
                          size="slim"
                          tone="critical"
                          variant="plain"
                          onClick={() => setSelectedId(null)}
                        >
                          Kapat
                        </Button>
                      </div>

                      <BlockStack gap="100">
                        <Text as="p" variant="bodyMd" fontWeight="semibold">
                          Mesaj
                        </Text>
                        <Text as="p" variant="bodyMd">
                          {selectedLog.message?.trim()
                            ? selectedLog.message
                            : "—"}
                        </Text>
                      </BlockStack>

                      <BlockStack gap="100">
                        <Text as="p" variant="bodyMd" fontWeight="semibold">
                          Zamanlar
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          Başlangıç:{" "}
                          {formatDateTime(selectedLog.started_at)} · Bitiş:{" "}
                          {formatDateTime(selectedLog.completed_at)}
                        </Text>
                      </BlockStack>

                      {(detailMapOk !== null || detailMarked !== null) && (
                        <BlockStack gap="100">
                          <Text as="p" variant="bodyMd" fontWeight="semibold">
                            Senkron ek bilgi
                          </Text>
                          <Text as="p" variant="bodySm" tone="subdued">
                            {detailMapOk !== null
                              ? `Mapping uygulandı: ${detailMapOk ? "evet" : "hayır"}`
                              : null}
                            {detailMapOk !== null && detailMarked !== null
                              ? " · "
                              : null}
                            {detailMarked !== null
                              ? `İşaretlenen ürün: ${detailMarked}`
                              : null}
                          </Text>
                        </BlockStack>
                      )}

                      <BlockStack gap="100">
                        <Text as="p" variant="bodyMd" fontWeight="semibold">
                          Stok özeti
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          {detailStocks
                            ? `Güncellenen: ${formatCountCell(detailStocks.processed)} · Hata: ${formatCountCell(detailStocks.failed)}`
                            : "—"}
                        </Text>
                      </BlockStack>

                      <BlockStack gap="100">
                        <Text as="p" variant="bodyMd" fontWeight="semibold">
                          Metafield (B2B) özeti
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          {detailMetafields
                            ? `İşlenen: ${formatCountCell(detailMetafields.processed)} · Hata: ${formatCountCell(detailMetafields.failed)}`
                            : "—"}
                        </Text>
                      </BlockStack>

                      <BlockStack gap="200">
                        <Text as="p" variant="bodyMd" fontWeight="semibold">
                          Hatalar ({detailErrorsList.length})
                        </Text>
                        {detailErrorsList.length === 0 ? (
                          <Text as="p" variant="bodySm" tone="subdued">
                            Bu kayıt için ürün hatası yok.
                          </Text>
                        ) : (
                          <BlockStack gap="150">
                            {detailErrorsList.map((err, i) => (
                              <div key={i}>
                                <Text as="p" variant="bodySm">
                                  <Text as="span" fontWeight="semibold">
                                    {err.sku ?? "?"}
                                  </Text>
                                  {err.step ? (
                                    <Text as="span" tone="subdued">
                                      {" "}
                                      [{err.step}]{` `}
                                    </Text>
                                  ) : null}
                                  <Text as="span">
                                    {err.message || err.error || "Hata"}
                                  </Text>
                                </Text>
                              </div>
                            ))}
                          </BlockStack>
                        )}
                      </BlockStack>

                      <Button
                        size="slim"
                        onClick={() => setRawJsonOpen((o) => !o)}
                      >
                        {rawJsonOpen
                          ? "Ham metadata gizle"
                          : "Ham metadata göster"}
                      </Button>

                      <Collapsible
                        open={rawJsonOpen}
                        id={`raw-json-${String(selectedLog.id)}`}
                        transition={{
                          duration: "200ms",
                          timingFunction: "ease-in-out",
                        }}
                      >
                        <BlockStack gap="100">
                          <Text as="p" variant="bodySm" tone="subdued">
                            Ham metadata
                          </Text>
                          <pre
                            style={{
                              margin: 0,
                              padding: 12,
                              overflow: "auto",
                              maxHeight: 280,
                              fontSize: 12,
                              background:
                                "var(--p-color-bg-surface-secondary)",
                              borderRadius: 8,
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-word",
                            }}
                          >
                            {selectedLog.metadata != null &&
                            typeof selectedLog.metadata === "object"
                              ? formatMetadataJson(selectedLog.metadata)
                              : "Metadata yok."}
                          </pre>
                        </BlockStack>
                      </Collapsible>
                    </BlockStack>
                  </Card>
                ) : null}
              </BlockStack>
            )}
            </BlockStack>
          </PolarisAppProvider>
        </div>
      </s-section>
    </s-page>
  );
}
