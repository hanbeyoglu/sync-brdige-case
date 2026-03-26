/**
 * Laravel sync_logs.metadata için güvenli okuyucular (null-safe).
 */

function safeMetadata(log) {
  const m = log?.metadata;
  if (m == null || typeof m !== "object") return null;
  return m;
}

export function getSyncMode(log) {
  const m = safeMetadata(log);
  const mode = m?.sync_mode;
  if (mode === "incremental" || mode === "full") return mode;
  return null;
}

/**
 * @returns {{ created: number|null, updated: number|null, archived: number|null, skipped: number|null, failed: number|null }}
 */
export function getCounts(log) {
  const c = safeMetadata(log)?.counts;
  if (!c || typeof c !== "object") {
    return {
      created: null,
      updated: null,
      archived: null,
      skipped: null,
      failed: null,
    };
  }
  const num = (v) =>
    typeof v === "number" && !Number.isNaN(v) ? v : null;
  return {
    created: num(c.created),
    updated: num(c.updated),
    archived: num(c.archived),
    skipped: num(c.skipped),
    failed: num(c.failed),
  };
}

/** Tablo için: counts yoksa failed → items_failed fallback */
export function getFailedCountDisplay(log) {
  const f = getCounts(log).failed;
  if (f !== null) return f;
  const legacy = log?.items_failed;
  if (typeof legacy === "number" && !Number.isNaN(legacy)) return legacy;
  return null;
}

export function getErrors(log) {
  const raw = safeMetadata(log)?.errors;
  if (!Array.isArray(raw)) return [];
  return raw.filter((e) => e && typeof e === "object");
}

export function getStocksSummary(log) {
  const s = safeMetadata(log)?.stocks;
  if (!s || typeof s !== "object") return null;
  return {
    processed: typeof s.processed === "number" ? s.processed : null,
    failed: typeof s.failed === "number" ? s.failed : null,
  };
}

export function getMetafieldsSummary(log) {
  const mf = safeMetadata(log)?.metafields;
  if (!mf || typeof mf !== "object") return null;
  return {
    processed: typeof mf.processed === "number" ? mf.processed : null,
    failed: typeof mf.failed === "number" ? mf.failed : null,
  };
}

export function getMappingAppliedOk(log) {
  const v = safeMetadata(log)?.mapping_applied_ok;
  if (typeof v === "boolean") return v;
  return null;
}

export function getMarkedProducts(log) {
  const n = safeMetadata(log)?.marked_products;
  if (typeof n === "number" && !Number.isNaN(n)) return n;
  return null;
}

export function formatCountCell(value) {
  if (value === null || value === undefined) return "—";
  return String(value);
}

export function formatSyncModeCell(log) {
  const mode = getSyncMode(log);
  if (mode === "incremental") return "Incremental";
  if (mode === "full") return "Tam";
  return "—";
}

export function truncateMessage(text, maxLen = 56) {
  if (text == null || text === "") return "—";
  const s = String(text);
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen - 1)}…`;
}

export function formatMetadataJson(meta) {
  if (meta == null || typeof meta !== "object") return "—";
  try {
    return JSON.stringify(meta, null, 2);
  } catch {
    return String(meta);
  }
}

export function logHasErrors(log) {
  return getErrors(log).length > 0;
}
