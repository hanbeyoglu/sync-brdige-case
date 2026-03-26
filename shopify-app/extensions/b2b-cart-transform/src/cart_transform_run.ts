import type {
  CartTransformRunInput,
  CartTransformRunResult,
} from "../generated/api";

const TAG_PRIORITY = ["wholesale", "retail", "vip"] as const;

const NO_CHANGES: CartTransformRunResult = {
  operations: [],
};

function normalizeTag(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = String(raw).trim().toLowerCase();
  return t.length > 0 ? t : null;
}

/**
 * Deterministic tier: first match in TAG_PRIORITY among customer's active tags (normalized).
 */
function resolveChosenTierTag(
  customer: CartTransformRunInput["cart"]["buyerIdentity"]["customer"],
): (typeof TAG_PRIORITY)[number] | null {
  if (!customer?.tierTags?.length) {
    return null;
  }
  const present = new Set<string>();
  for (const row of customer.tierTags) {
    if (!row?.hasTag) {
      continue;
    }
    const n = normalizeTag(row.tag);
    if (n) {
      present.add(n);
    }
  }
  for (const t of TAG_PRIORITY) {
    if (present.has(t)) {
      return t;
    }
  }
  return null;
}

/**
 * Safe JSON parse for metafield `value` (JSON type stored as string).
 * Keys are normalized (trim + lowercase); values coerced to finite numbers.
 */
function parseTierPercentMap(
  value: string | null | undefined,
): Record<string, number> | null {
  if (value == null) {
    return null;
  }
  const trimmed = String(value).trim();
  if (trimmed.length === 0) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    const nk = normalizeTag(k);
    if (!nk) {
      continue;
    }
    const num = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(num)) {
      continue;
    }
    out[nk] = num;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function formatDecimalAmount(n: number): string {
  return n.toFixed(2);
}

export function cartTransformRun(
  input: CartTransformRunInput,
): CartTransformRunResult {
  const chosen = resolveChosenTierTag(input.cart?.buyerIdentity?.customer);
  if (!chosen) {
    return NO_CHANGES;
  }

  const operations: CartTransformRunResult["operations"] = [];

  for (const line of input.cart?.lines ?? []) {
    const m = line.merchandise;
    if (!m || m.__typename !== "ProductVariant") {
      continue;
    }
    const raw = m.b2bPriceTiers?.value;
    if (raw == null || String(raw).trim() === "") {
      continue;
    }
    const map = parseTierPercentMap(raw);
    if (!map) {
      continue;
    }
    const pct = map[chosen];
    if (pct == null || !Number.isFinite(pct) || pct <= 0 || pct > 100) {
      continue;
    }

    const baseStr = line.cost?.amountPerQuantity?.amount;
    if (baseStr == null) {
      continue;
    }
    const base = Number(baseStr);
    if (!Number.isFinite(base) || base < 0) {
      continue;
    }

    const newUnit = (base * pct) / 100;
    if (!Number.isFinite(newUnit) || newUnit < 0) {
      continue;
    }

    operations.push({
      lineUpdate: {
        cartLineId: line.id,
        price: {
          adjustment: {
            fixedPricePerUnit: {
              amount: formatDecimalAmount(newUnit),
            },
          },
        },
      },
    });
  }

  return { operations };
}
