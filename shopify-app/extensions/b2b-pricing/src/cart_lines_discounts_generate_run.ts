/* eslint-disable @typescript-eslint/no-explicit-any */

export function cartLinesDiscountsGenerateRun(input: any) {
  const operations: any[] = [];

  const tier = input.cart?.buyerIdentity?.customer?.metafield?.value;

  for (const line of input.cart.lines) {
    const product = line.merchandise.product;

    let targetPrice: number | null = null;

    if (tier === "vip") {
      targetPrice = parseFloat(product.vip?.value || "0");
    } else if (tier === "wholesale") {
      targetPrice = parseFloat(product.wholesale?.value || "0");
    } else if (tier === "retail") {
      targetPrice = parseFloat(product.retail?.value || "0");
    }

    if (!targetPrice || targetPrice <= 0) continue;

    const original = parseFloat(line.cost.amountPerQuantity.amount);
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
                amount: discount.toString(),
              },
            },
          },
        ],
      },
    });
  }

  return { operations };
}