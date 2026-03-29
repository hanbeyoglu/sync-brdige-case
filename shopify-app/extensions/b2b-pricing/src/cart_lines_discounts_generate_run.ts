/* eslint-disable @typescript-eslint/no-explicit-any */

const TAG_PRIORITY = ["wholesale", "vip", "retail"] as const;

type TierTag = (typeof TAG_PRIORITY)[number];

function normalizeTag(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const value = String(raw).trim().toLowerCase();
  return value.length > 0 ? value : null;
}

function resolveTier(customer: any): TierTag | null {
  if (!customer) return null;

  const present = new Set<string>();
  for (const row of customer.tierTags ?? []) {
    if (!row?.hasTag) continue;
    const normalized = normalizeTag(row.tag);
    if (normalized) present.add(normalized);
  }

  for (const tier of TAG_PRIORITY) {
    if (present.has(tier)) return tier;
  }

  const metafieldTier = normalizeTag(customer.tierMetafield?.value);
  if (metafieldTier && TAG_PRIORITY.some((t) => t === metafieldTier)) {
    return metafieldTier as TierTag;
  }

  return null;
}

function parsePrice(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const num = Number(String(raw).trim());
  return Number.isFinite(num) && num > 0 ? num : null;
}

function pickTierPrice(product: any, tier: TierTag): number | null {
  if (!product) return null;
  if (tier === "wholesale") return parsePrice(product.wholesale?.value);
  if (tier === "vip") return parsePrice(product.vip?.value);
  return parsePrice(product.retail?.value);
}

function formatAmount(amount: number): string {
  return amount.toFixed(2);
}

export function cartLinesDiscountsGenerateRun(input: any) {
  const operations: any[] = [];
  const tier = resolveTier(input?.cart?.buyerIdentity?.customer);

  // Giriş yapmamış ya da tier bulunamayan kullanıcı: normal fiyat.
  if (!tier) {
    return { operations };
  }

  for (const line of input?.cart?.lines ?? []) {
    const product = line?.merchandise?.product;
    const targetPrice = pickTierPrice(product, tier);
    if (targetPrice == null) continue;

    const original = Number(line?.cost?.amountPerQuantity?.amount ?? NaN);
    if (!Number.isFinite(original)) continue;

    const discount = original - targetPrice;
    if (discount <= 0) continue;

    operations.push({
      productDiscountsAdd: {
        candidates: [
          {
            message: "B2B Price",
            targets: [{ cartLine: { id: line.id } }],
            value: {
              fixedAmount: {
                amount: formatAmount(discount),
              },
            },
          },
        ],
      },
    });
  }

  return { operations };
}
