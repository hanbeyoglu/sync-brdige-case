/**
 * SyncBridge - Laravel → Shopify senkronizasyonu
 * Ürün başına productVariantsBulkUpdate (fiyat), inventorySetQuantities (stok), metafieldsSet (B2B tier)
 */

const PRODUCT_ARCHIVE_MUTATION = `
mutation productArchive($input: ProductInput!) {
  productUpdate(input: $input) {
    product { id status }
    userErrors { field message }
  }
}
`;

const PRODUCT_CREATE_MUTATION = `
mutation productCreate($product: ProductCreateInput!) {
  productCreate(product: $product) {
    product {
      id
      title
      variants(first: 1) {
        edges {
          node {
            id
            inventoryItem {
              id
            }
          }
        }
      }
    }
    userErrors {
      field
      message
    }
  }
}
`;

/**
 * Laravel API'den ürünleri al
 * @param {string} syncMode - "full" | "incremental"
 */
export async function fetchProductsFromLaravel(
  laravelUrl,
  apiSecret,
  syncMode = "full",
) {
  const mode = syncMode === "incremental" ? "incremental" : "full";
  const res = await fetch(
    `${laravelUrl}/api/products?sync_mode=${encodeURIComponent(mode)}`,
    {
      headers: { "X-API-Secret": apiSecret },
    },
  );
  const data = await res.json();
  return data.success ? data.data : [];
}

/**
 * Shopify'da SKU ile variant ID, inventory item ve location eşlemesi yap
 * Mapping Laravel'e geri yazılmak üzere inventory_item_id ve location_id içerir
 */
export async function getShopifyProductsBySku(admin) {
  const response = await admin.graphql(
    `#graphql
    query {
      products(first: 250, query: "status:active") {
        edges {
          node {
            id
            variants(first: 10) {
              edges {
                node {
                  id
                  sku
                  inventoryItem {
                    id
                    inventoryLevels(first: 1) {
                      edges {
                        node {
                          id
                          location {
                            id
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }`,
  );
  const json = await response.json();
  const products = json.data?.products?.edges || [];
  const skuToVariant = {};
  for (const { node } of products) {
    for (const v of node.variants?.edges || []) {
      if (v.node.sku) {
        const invItem = v.node.inventoryItem;
        const invLevel = invItem?.inventoryLevels?.edges?.[0]?.node;
        skuToVariant[v.node.sku] = {
          productId: node.id,
          variantId: v.node.id,
          inventoryItemId: invItem?.id || null,
          locationId: invLevel?.location?.id || null,
        };
      }
    }
  }
  return skuToVariant;
}

const METAFIELDS_SET_MUTATION = `
mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) {
    metafields { key namespace value }
    userErrors { field message code }
  }
}
`;

/**
 * Laravel price_tiers'ı B2B metafield JSON'a çevir
 * Örn: { wholesale: 75, retail: 90, vip: 65 } (base_price'a göre yüzde)
 */
function priceTiersToB2bJson(priceTiers, basePrice) {
  if (
    !priceTiers ||
    !Array.isArray(priceTiers) ||
    priceTiers.length === 0 ||
    !basePrice ||
    basePrice <= 0
  ) {
    return null;
  }
  const obj = {};
  for (const tier of priceTiers) {
    const tag = (tier.customer_tag || "").toLowerCase();
    if (!tag) continue;
    const pct = Math.round(((tier.price || 0) / basePrice) * 100);
    obj[tag] = Math.min(100, Math.max(0, pct));
  }
  return Object.keys(obj).length > 0 ? obj : null;
}

/**
 * B2B price tiers metafield sync - variant'a syncbridge.b2b_price_tiers yaz
 */
async function runB2bMetafieldSync(admin, products, mappingItems, errors) {
  const skuToProduct = Object.fromEntries(products.map((p) => [p.sku, p]));
  /** @type {{ sku: string, fields: object }[]} */
  const entries = [];

  for (const m of mappingItems) {
    if (!m.shopify_variant_id) continue;
    const product = skuToProduct[m.sku];
    if (!product || !product.price_tiers) continue;
    const b2bJson = priceTiersToB2bJson(
      product.price_tiers,
      product.base_price,
    );
    if (!b2bJson) continue;
    entries.push({
      sku: m.sku,
      fields: {
        namespace: "syncbridge",
        key: "b2b_price_tiers",
        ownerId: m.shopify_variant_id,
        type: "json",
        value: JSON.stringify(b2bJson),
      },
    });
  }

  if (entries.length === 0)
    return { metafieldsProcessed: 0, metafieldsFailed: 0 };

  const batchSize = 25;
  let processed = 0;
  let failed = 0;

  for (let i = 0; i < entries.length; i += batchSize) {
    const slice = entries.slice(i, i + batchSize);
    const batch = slice.map((e) => e.fields);
    try {
      const res = await admin.graphql(METAFIELDS_SET_MUTATION, {
        variables: { metafields: batch },
      });
      const json = await res.json();
      const errs = json.data?.metafieldsSet?.userErrors || [];
      if (errs.length > 0) {
        failed += slice.length;
        const msg = errs.map((e) => e.message).join(", ");
        for (const e of slice) {
          errors.push({
            sku: e.sku,
            step: "metafield",
            status: "error",
            error: msg,
            message: msg || "metafieldsSet userErrors",
            timestamp: Date.now(),
          });
        }
      } else {
        processed += slice.length;
      }
    } catch (e) {
      failed += slice.length;
      const msg = e?.message || e || "metafieldsSet hatası";
      for (const ent of slice) {
        errors.push({
          sku: ent.sku,
          step: "metafield",
          status: "error",
          error: msg,
          message: msg,
          timestamp: Date.now(),
        });
      }
    }
  }

  return { metafieldsProcessed: processed, metafieldsFailed: failed };
}

const INVENTORY_SET_QUANTITIES_MUTATION = `
mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) {
  inventorySetQuantities(input: $input) {
    inventoryAdjustmentGroup {
      reason
      changes { name delta }
    }
    userErrors { code field message }
  }
}
`;

/**
 * Stok senkronizasyonu - inventorySetQuantities ile Laravel quantity → Shopify
 * Skip: inventoryItemId veya locationId yoksa
 * Fallback: Batch başarısız olursa tek tek güncelleme dene
 */
async function runInventorySync(admin, products, mappingItems, errors) {
  const skuToProduct = Object.fromEntries(products.map((p) => [p.sku, p]));
  const quantities = [];

  for (const m of mappingItems) {
    if (!m.shopify_inventory_item_id || !m.shopify_location_id) continue;
    const product = skuToProduct[m.sku];
    if (!product) continue;
    const qty =
      typeof product.inventory === "number"
        ? product.inventory
        : parseInt(product.inventory, 10) || 0;
    quantities.push({
      sku: m.sku,
      inventoryItemId: m.shopify_inventory_item_id,
      locationId: m.shopify_location_id,
      quantity: Math.max(0, qty),
    });
  }

  if (quantities.length === 0) {
    return { stocksProcessed: 0, stocksFailed: 0 };
  }

  const stripSku = (items) =>
    items.map(({ inventoryItemId, locationId, quantity }) => ({
      inventoryItemId,
      locationId,
      quantity,
    }));

  const runBatch = async (items) => {
    const res = await admin.graphql(INVENTORY_SET_QUANTITIES_MUTATION, {
      variables: {
        input: {
          name: "available",
          reason: "correction",
          referenceDocumentUri: "syncbridge://laravel-sync/" + Date.now(),
          ignoreCompareQuantity: true,
          quantities: stripSku(items),
        },
      },
    });
    const json = await res.json();
    const payload = json.data?.inventorySetQuantities;
    return { errs: payload?.userErrors || [], payload };
  };

  try {
    const { errs } = await runBatch(quantities);
    if (errs.length === 0) {
      return { stocksProcessed: quantities.length, stocksFailed: 0 };
    }
  } catch (e) {
    console.warn(
      "inventorySetQuantities batch error, trying one-by-one:",
      e?.message,
    );
  }

  let stocksProcessed = 0;
  let stocksFailed = 0;
  for (const q of quantities) {
    try {
      const { errs } = await runBatch([q]);
      if (errs.length === 0) {
        stocksProcessed++;
      } else {
        stocksFailed++;
        const msg = errs.map((e) => e.message).join(", ");
        errors.push({
          sku: q.sku,
          step: "inventory",
          status: "error",
          error: msg,
          message: msg || "inventorySetQuantities userErrors",
          timestamp: Date.now(),
        });
      }
    } catch (e) {
      stocksFailed++;
      const msg = e?.message || e || "inventorySetQuantities hatası";
      errors.push({
        sku: q.sku,
        step: "inventory",
        status: "error",
        error: msg,
        message: msg,
        timestamp: Date.now(),
      });
    }
  }
  return { stocksProcessed, stocksFailed };
}

/**
 * Fiyat + stok + B2B metafield senkronu; mapping ve arşiv temizliği Laravel'e yazılır.
 */
export async function runBulkSync(admin, products, skuMap) {
  const updates = [];
  const mappingItems = [];
  const archiveMappings = [];
  const errors = [];

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let archived = 0;
  let failed = 0;

  for (const p of products) {
    // in_shopify=false: Shopify'da aktif eşleşme varsa arşivle, yoksa atla
    if (!p.in_shopify) {
      const mappedOff = skuMap[p.sku];
      if (!mappedOff?.productId) {
        skipped++;
        continue;
      }
      try {
        const archRes = await admin.graphql(PRODUCT_ARCHIVE_MUTATION, {
          variables: {
            input: {
              id: mappedOff.productId,
              status: "ARCHIVED",
            },
          },
        });
        const archJson = await archRes.json();
        const archErrs = archJson.data?.productUpdate?.userErrors || [];
        if (archErrs.length > 0) {
          errors.push({
            sku: p.sku,
            step: "archive",
            status: "error",
            error: archErrs.map((e) => e.message).join(", "),
            message: archErrs.map((e) => e.message).join(", "),
            timestamp: Date.now(),
          });
          failed++;
        } else {
          archived++;
          delete skuMap[p.sku];
          archiveMappings.push({ sku: p.sku, archived_from_sync: true });
        }
      } catch (e) {
        errors.push({
          sku: p.sku,
          step: "archive",
          status: "error",
          error: e?.message || e || "Bilinmeyen hata",
          message: e?.message || e || "Bilinmeyen hata",
          timestamp: Date.now(),
        });
        failed++;
      }
      continue;
    }

    let mapped = skuMap[p.sku];
    let wasCreatedNow = false;

    // Shopify'da yoksa oluştur
    if (!mapped) {
      try {
        const createRes = await admin.graphql(PRODUCT_CREATE_MUTATION, {
          variables: {
            product: {
              title: p.name,
              status: "ACTIVE",
            },
          },
        });

        const createJson = await createRes.json();
        const createErrors = createJson.data?.productCreate?.userErrors || [];
        const createdProduct = createJson.data?.productCreate?.product;

        if (createErrors.length > 0 || !createdProduct) {
          console.log("CREATE RESPONSE:", JSON.stringify(createJson, null, 2));
          errors.push({
            sku: p.sku,
            step: "create",
            status: "error",
            error: createErrors.map((e) => e.message).join(", "),
            message:
              createErrors.map((e) => e.message).join(", ") ||
              "Ürün oluşturulamadı",
            timestamp: Date.now(),
          });
          failed++;
          continue;
        }

        const createdVariant = createdProduct.variants?.edges?.[0]?.node;

        mapped = {
          productId: createdProduct.id,
          variantId: createdVariant?.id || null,
          inventoryItemId: createdVariant?.inventoryItem?.id || null,
          locationId: null,
        };

        skuMap[p.sku] = mapped;
        wasCreatedNow = true;
        created++;
      } catch (e) {
        errors.push({
          sku: p.sku,
          step: "create",
          status: "error",
          error: e?.message || e || "Bilinmeyen hata",
          message: e?.message || e || "Bilinmeyen hata",
          timestamp: Date.now(),
        });
        failed++;
        continue;
      }
    }

    // mapping bulunduysa update listesine al
    if (mapped?.productId && mapped?.variantId) {
      p.shopify_product_id = mapped.productId;
      p.shopify_variant_id = mapped.variantId;

      // Create sonrası: fiyat + SKU’yu bulk update ile netleştir (şemada SKU = inventoryItem.sku).
      const variantInput = {
        id: mapped.variantId,
        price: String(p.base_price),
      };
      if (wasCreatedNow) {
        variantInput.inventoryItem = { sku: p.sku };
      }
      updates.push({
        sku: p.sku,
        wasCreatedNow,
        productId: mapped.productId,
        variants: [variantInput],
      });

      mappingItems.push({
        sku: p.sku,
        shopify_product_id: mapped.productId,
        shopify_variant_id: mapped.variantId,
        shopify_inventory_item_id: mapped.inventoryItemId || null,
        shopify_location_id: mapped.locationId || null,
      });
    } else {
      failed++;
      errors.push({
        sku: p.sku,
        step: "mapping",
        status: "error",
        error: "Shopify variant veya product id eksik",
        message: "Shopify variant veya product id eksik",
        timestamp: Date.now(),
      });
    }
  }

  // 1. Fiyat sync — productId başına tek productVariantsBulkUpdate (N+1 önleme)
  const updatesByProductId = new Map();
  for (const update of updates) {
    const pid = update.productId;
    if (!updatesByProductId.has(pid)) {
      updatesByProductId.set(pid, []);
    }
    updatesByProductId.get(pid).push({
      sku: update.sku,
      wasCreatedNow: update.wasCreatedNow,
      variantInput: update.variants[0],
    });
  }

  for (const [productId, rows] of updatesByProductId) {
    const variants = rows.map((r) => r.variantInput);
    try {
      const res = await admin.graphql(
        `#graphql
        mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(productId: $productId, variants: $variants) {
            productVariants { id }
            userErrors { field message }
          }
        }`,
        {
          variables: {
            productId,
            variants,
          },
        },
      );

      const json = await res.json();
      const errs = json.data?.productVariantsBulkUpdate?.userErrors || [];

      if (errs.length > 0) {
        console.log("UPDATE RESPONSE:", JSON.stringify(json, null, 2));
        const msg = errs.map((e) => e.message).join(", ");
        for (const row of rows) {
          errors.push({
            sku: row.sku,
            step: "update",
            status: "error",
            error: msg,
            message: msg,
            timestamp: Date.now(),
          });
          failed++;
        }
      } else {
        for (const row of rows) {
          if (!row.wasCreatedNow) {
            updated++;
          }
        }
      }
    } catch (e) {
      const msg =
        e?.message ||
        e ||
        "Bilinmeyen hata" ||
        "productVariantsBulkUpdate hatası";
      for (const row of rows) {
        errors.push({
          sku: row.sku,
          step: "update",
          status: "error",
          error: msg,
          message: msg,
          timestamp: Date.now(),
        });
        failed++;
      }
    }
  }

  // 2. Stok sync
  const { stocksProcessed, stocksFailed } = await runInventorySync(
    admin,
    products,
    mappingItems,
    errors,
  );

  // 3. B2B metafield sync
  const { metafieldsProcessed, metafieldsFailed } = await runB2bMetafieldSync(
    admin,
    products,
    mappingItems,
    errors,
  );

  const errorSkus = new Set(errors.map((e) => e.sku).filter(Boolean));
  const syncedSkus = products
    .map((p) => p.sku)
    .filter((sku) => !errorSkus.has(sku));

  return {
    created,
    updated,
    skipped,
    archived,
    failed,
    errors,
    /** Başarılı Shopify işlemleri: oluştur + güncelle + arşiv */
    processed: created + updated + archived,
    stocksProcessed,
    stocksFailed,
    metafieldsProcessed,
    metafieldsFailed,
    mapping: mappingItems,
    archiveMappings,
    syncedSkus,
  };
}
