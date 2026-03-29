import type {
  CartTransformRunInput,
  CartTransformRunResult,
} from "../generated/api";

const TAG_PRIORITY = ["wholesale", "vip", "retail"] as const;

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
  if (!customer) return null;

  const present = new Set<string>();

  if (customer.tierTags?.length) {
    for (const row of customer.tierTags) {
      if (!row?.hasTag) {
        continue;
      }
      const n = normalizeTag(row.tag);
      if (n) {
        present.add(n);
      }
    }
  }

  for (const t of TAG_PRIORITY) {
    if (present.has(t)) {
      return t;
    }
  }

  const fromMetafield = normalizeTag(
    (customer as { tierMetafield?: { value?: string | null } | null })
      .tierMetafield?.value,
  );
  if (
    fromMetafield &&
    TAG_PRIORITY.some((tag) => tag === fromMetafield)
  ) {
    return fromMetafield as (typeof TAG_PRIORITY)[number];
  }

  return null;
}

function parseDecimalMetafield(
  value: string | null | undefined,
): number | null {
  if (value == null) {
    return null;
  }
  const trimmed = String(value).trim();
  if (trimmed.length === 0) {
    return null;
  }
  const num = Number(trimmed);
  return Number.isFinite(num) && num >= 0 ? num : null;
}

type TierProductMetafields = {
  retail?: { value?: string | null } | null;
  vip?: { value?: string | null } | null;
  wholesale?: { value?: string | null } | null;
};

function tierUnitPriceFromProductMetafields(
  product: TierProductMetafields | null | undefined,
  chosen: (typeof TAG_PRIORITY)[number],
): number | null {
  if (!product) {
    return null;
  }
  const mf =
    chosen === "retail"
      ? product.retail
      : chosen === "vip"
        ? product.vip
        : product.wholesale;
  return parseDecimalMetafield(mf?.value ?? null);
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

    const newUnit = tierUnitPriceFromProductMetafields(m.product, chosen);
    if (newUnit == null) {
      continue;
    }

    const currentUnit = Number(line.cost?.amountPerQuantity?.amount ?? NaN);
    if (!Number.isFinite(currentUnit)) {
      continue;
    }

    // No-op operasyon üretme.
    if (Math.abs(currentUnit - newUnit) < 0.00001) {
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
