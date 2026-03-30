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
} from "../utils/syncLogMetadata";

function formatDateTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("tr-TR");
  } catch {
    return "—";
  }
}

function getStatusPillStyle(status) {
  const normalized = String(status ?? "").toLowerCase();

  if (normalized === "completed" || normalized === "success") {
    return {
      background: "#e8f7ee",
      color: "#166534",
      border: "1px solid #b7e4c7",
    };
  }

  if (normalized === "failed" || normalized === "error") {
    return {
      background: "#fdecec",
      color: "#991b1b",
      border: "1px solid #fecaca",
    };
  }

  return {
    background: "#eef2ff",
    color: "#3730a3",
    border: "1px solid #c7d2fe",
  };
}

function renderStatusPill(status) {
  const style = getStatusPillStyle(status);
  return (
    <span
      style={{
        ...style,
        padding: "3px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {status ?? "—"}
    </span>
  );
}

function renderSummaryCard(label, value, hint, tone) {
  return (
    <div
      style={{
        minWidth: 170,
        flex: "1 1 170px",
        padding: "14px 16px",
        borderRadius: 12,
        border: `1px solid ${tone.border}`,
        background: tone.bg,
      }}
    >
      <BlockStack gap="050">
        <Text variant="bodySm" tone="subdued">
          {label}
        </Text>
        <Text variant="headingMd" as="p">
          {value}
        </Text>
        {hint ? (
          <Text variant="bodySm" tone="subdued" as="p">
            {hint}
          </Text>
        ) : null}
      </BlockStack>
    </div>
  );
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
  } catch {
    logs = [];
  }

  return { logs };
};

const TABLE_HEADINGS = [
  "Log",
  "Tip",
  "Durum",
  "Sync modu",
  "Özet",
  "Başlangıç",
  "Bitiş",
  "",
];

const COLUMN_TYPES = [
  "text",
  "text",
  "text",
  "text",
  "text",
  "text",
  "text",
  "text",
];

const PAGE_SIZE = 6;

export default function LogsPage() {
  const { logs } = useLoaderData();
  const [selectedId, setSelectedId] = useState(null);
  const [rawJsonOpen, setRawJsonOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const list = useMemo(() => logs ?? [], [logs]);
  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const page = Math.max(1, Math.min(currentPage, totalPages));

  useEffect(() => {
    setCurrentPage((prev) => Math.max(1, Math.min(prev, totalPages)));
  }, [totalPages]);

  useEffect(() => {
    setSelectedId(null);
    setRawJsonOpen(false);
  }, [page]);

  const paginatedLogs = useMemo(
    () => list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [list, page],
  );

  const anyLogHasErrors = useMemo(
    () => list.some((log) => logHasErrors(log)),
    [list],
  );

  const selectedLog = useMemo(() => {
    if (selectedId == null) return null;
    const sid = String(selectedId);
    return list.find((log) => String(log.id) === sid) ?? null;
  }, [list, selectedId]);

  const detailCounts = selectedLog ? getCounts(selectedLog) : null;
  const detailStocks = selectedLog ? getStocksSummary(selectedLog) : null;
  const detailMetafields = selectedLog
    ? getMetafieldsSummary(selectedLog)
    : null;
  const detailMapOk = selectedLog ? getMappingAppliedOk(selectedLog) : null;
  const detailMarked = selectedLog ? getMarkedProducts(selectedLog) : null;
  const detailErrorsList = selectedLog ? getErrors(selectedLog) : [];

  const summary = useMemo(() => {
    const total = list.length;
    const errors = list.filter((log) => logHasErrors(log)).length;
    const completed = list.filter((log) => {
      const status = String(log.status ?? "").toLowerCase();
      return status === "completed" || status === "success";
    }).length;

    return {
      total,
      errors,
      completed,
      latestDate: total > 0 ? formatDateTime(list[0]?.started_at) : "—",
    };
  }, [list]);

  const rows = useMemo(() => {
    return paginatedLogs.map((log) => {
      const counts = getCounts(log);
      const failedDisplay = getFailedCountDisplay(log);
      const idStr = String(log.id);
      const isRowSelected = String(selectedId ?? "") === idStr;

      const compactSummary = [
        `Ol: ${formatCountCell(counts.created)}`,
        `Gn: ${formatCountCell(counts.updated)}`,
        `Ar: ${formatCountCell(counts.archived)}`,
        `Ht: ${formatCountCell(failedDisplay)}`,
      ].join(" · ");

      return [
        `#${log.id}`,
        log.sync_type ?? "—",
        renderStatusPill(log.status),
        formatSyncModeCell(log),
        compactSummary,
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

  const currentStart = (page - 1) * PAGE_SIZE + 1;
  const currentEnd = Math.min(page * PAGE_SIZE, list.length);

  return (
    <s-page heading="Sync Logs">
      <s-section heading="Senkronizasyon Geçmişi">
        {anyLogHasErrors && (
          <s-banner tone="warning">
            <s-paragraph>
              Bazı kayıtlar ürün bazlı hata içeriyor. İlgili satırdaki
              {` "Detay" `}
              ile hataları görebilirsin.
            </s-paragraph>
          </s-banner>
        )}

        <div style={{ marginTop: 16 }}>
          <PolarisAppProvider i18n={tr}>
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="300">
                  <BlockStack gap="100">
                    <Text variant="headingLg" as="h2">
                      Log Merkezi
                    </Text>
                    <Text tone="subdued" as="p">
                      Son senkron işlemlerini tek bakışta takip et, gerekirse
                      ilgili kaydın detayına in.
                    </Text>
                  </BlockStack>

                  <InlineStack gap="200" wrap>
                    {renderSummaryCard(
                      "Toplam kayıt",
                      summary.total,
                      `${PAGE_SIZE} kayıt / sayfa`,
                      { bg: "#f8fafc", border: "#dbe7f3" },
                    )}
                    {renderSummaryCard(
                      "Başarılı",
                      summary.completed,
                      "Tamamlanan senkronlar",
                      { bg: "#eefbf4", border: "#ccefd9" },
                    )}
                    {renderSummaryCard("Hatalı", summary.errors, "İnceleme gerektiren", {
                      bg: "#fff7f1",
                      border: "#ffd9bf",
                    })}
                    {renderSummaryCard(
                      "Son başlangıç",
                      summary.latestDate,
                      "En güncel log zamanı",
                      { bg: "#f4f3ff", border: "#d9d6ff" },
                    )}
                  </InlineStack>
                </BlockStack>
              </Card>

              {list.length === 0 ? (
                <Card>
                  <div
                    style={{
                      border: "1px dashed #d1d5db",
                      borderRadius: 12,
                      padding: 24,
                      textAlign: "center",
                    }}
                  >
                    <BlockStack gap="100">
                      <Text variant="headingMd" as="h3">
                        Henüz log kaydı yok
                      </Text>
                      <Text tone="subdued" as="p">
                        İlk senkron işlemi sonrasında kayıtlar burada listelenecek.
                      </Text>
                    </BlockStack>
                  </div>
                </Card>
              ) : (
                <>
                  <Card>
                    <BlockStack gap="300">
                      <InlineStack align="space-between" blockAlign="center">
                        <BlockStack gap="050">
                          <Text variant="headingMd" as="h3">
                            Senkronizasyon Listesi
                          </Text>
                          <Text tone="subdued" variant="bodySm" as="p">
                            {currentStart}-{currentEnd} / {list.length} kayıt gösteriliyor
                          </Text>
                        </BlockStack>
                      </InlineStack>

                      <div style={{ overflowX: "auto" }}>
                        <DataTable
                          columnContentTypes={COLUMN_TYPES}
                          headings={TABLE_HEADINGS}
                          rows={rows}
                        />
                      </div>
                    </BlockStack>
                  </Card>

                  <Card>
                    <InlineStack align="space-between" blockAlign="center">
                      <Text tone="subdued" variant="bodySm" as="p">
                        Sayfa {page} / {totalPages}
                      </Text>

                      <InlineStack gap="200">
                        <Button
                          size="slim"
                          disabled={page <= 1}
                          onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                        >
                          Önceki
                        </Button>
                        <Button
                          size="slim"
                          disabled={page >= totalPages}
                          onClick={() =>
                            setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                          }
                        >
                          Sonraki
                        </Button>
                      </InlineStack>
                    </InlineStack>
                  </Card>

                  {selectedLog && (
                    <Card>
                      <BlockStack gap="300">
                        <InlineStack align="space-between" blockAlign="center">
                          <BlockStack gap="050">
                            <Text variant="headingMd" as="h3">
                              Log #{selectedLog.id}
                            </Text>
                            <InlineStack gap="200" blockAlign="center">
                              <Text tone="subdued" variant="bodySm" as="p">
                                {selectedLog.sync_type ?? "—"}
                              </Text>
                              {renderStatusPill(selectedLog.status)}
                            </InlineStack>
                          </BlockStack>

                          <Button variant="plain" tone="critical" onClick={() => setSelectedId(null)}>
                            Kapat
                          </Button>
                        </InlineStack>

                        <div
                          style={{
                            border: "1px solid #eceff3",
                            borderRadius: 12,
                            padding: 12,
                            background: "#fbfcfd",
                          }}
                        >
                          <BlockStack gap="100">
                            <Text variant="bodySm" tone="subdued" as="p">
                              Mesaj
                            </Text>
                            <Text as="p">{selectedLog.message || "—"}</Text>
                          </BlockStack>
                        </div>

                        <InlineStack gap="200" wrap>
                          {renderSummaryCard(
                            "Oluşturulan",
                            formatCountCell(detailCounts?.created),
                            "Yeni ürün",
                            { bg: "#f8fafc", border: "#e2e8f0" },
                          )}
                          {renderSummaryCard(
                            "Güncellenen",
                            formatCountCell(detailCounts?.updated),
                            "Fiyat/alan güncelleme",
                            { bg: "#f8fafc", border: "#e2e8f0" },
                          )}
                          {renderSummaryCard(
                            "Arşivlenen",
                            formatCountCell(detailCounts?.archived),
                            "Yayından alınan",
                            { bg: "#f8fafc", border: "#e2e8f0" },
                          )}
                          {renderSummaryCard(
                            "Hatalı",
                            formatCountCell(getFailedCountDisplay(selectedLog)),
                            "İşlem başarısız",
                            { bg: "#fff7f1", border: "#ffd9bf" },
                          )}
                        </InlineStack>

                        <InlineStack gap="400" wrap>
                          <Text tone="subdued" as="p">
                            Zaman: {formatDateTime(selectedLog.started_at)} {"->"}{" "}
                            {formatDateTime(selectedLog.completed_at)}
                          </Text>
                          <Text tone="subdued" as="p">
                            Stok: {detailStocks?.processed ?? 0} başarılı / {" "}
                            {detailStocks?.failed ?? 0} hata
                          </Text>
                          <Text tone="subdued" as="p">
                            Metafield: {detailMetafields?.processed ?? 0} başarılı / {" "}
                            {detailMetafields?.failed ?? 0} hata
                          </Text>
                        </InlineStack>

                        {(detailMapOk !== null || detailMarked !== null) && (
                          <Text tone="subdued" as="p">
                            Mapping: {detailMapOk ? "ok" : "fail"}
                            {detailMarked !== null ? ` · İşaretlenen ürün: ${detailMarked}` : ""}
                          </Text>
                        )}

                        <BlockStack gap="200">
                          <Text as="p" fontWeight="semibold">
                            Hatalar ({detailErrorsList.length})
                          </Text>

                          {detailErrorsList.length === 0 ? (
                            <Text tone="subdued" as="p">
                              Bu kayıtta hata yok.
                            </Text>
                          ) : (
                            <div
                              style={{
                                maxHeight: 240,
                                overflow: "auto",
                                padding: 12,
                                border: "1px solid #f1d8d8",
                                borderRadius: 12,
                                background: "#fffafa",
                              }}
                            >
                              <BlockStack gap="100">
                                {detailErrorsList.map((err, index) => (
                                  <Text as="p" key={`${err.sku}-${err.step}-${index}`}>
                                    <b>{err.sku}</b> [{err.step}] - {err.message}
                                  </Text>
                                ))}
                              </BlockStack>
                            </div>
                          )}
                        </BlockStack>

                        <BlockStack gap="200">
                          <Button size="slim" onClick={() => setRawJsonOpen((open) => !open)}>
                            {rawJsonOpen ? "Ham Veriyi Gizle" : "Ham Veriyi Göster"}
                          </Button>

                          <Collapsible open={rawJsonOpen}>
                            <pre
                              style={{
                                padding: 12,
                                fontSize: 12,
                                background: "#f6f8fa",
                                borderRadius: 8,
                                border: "1px solid #e5e7eb",
                                overflowX: "auto",
                              }}
                            >
                              {formatMetadataJson(selectedLog.metadata)}
                            </pre>
                          </Collapsible>
                        </BlockStack>
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
