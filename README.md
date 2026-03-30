# SyncBridge Case Project

Shopify (Remix/React) + Laravel tabanlı B2B senkronizasyon platformu.

Bu proje, case kapsamında istenen Laravel paneli, Shopify embedded app, App Extension (Functions), SKU bazlı sync, webhook senkronizasyonu ve canlı deploy gereksinimlerini karşılamak için geliştirilmiştir.

## Live Environments

- Shopify development store: `syncbridge-b2b-case-dev`
- Laravel panel URL: `https://syncbridge-api.hanbeyoglu.com/`
- Shopify app URL: `https://syncbridge.hanbeyoglu.com`

Laravel Panel Giriş Bilgileri

```text
  Email: admin@syncbridge.local
  Password: password
```

## Tech Stack

- Backend: Laravel
- Shopify App UI: Remix/React
- Shopify: Admin GraphQL, Webhooks, Shopify Functions
- Infra: Docker, canlı HTTPS deploy
- Source Control: GitHub

## Architecture

```text
Shopify Admin / Storefront
  -> Shopify App (Remix)
  -> Laravel API
  -> Database

Shopify Webhooks
  -> Shopify App webhook endpoints (HMAC)
  -> Laravel webhook endpoints (internal secret)
```

## Case Requirement Coverage

| Requirement                              | Status | Notes                                                                  |
| ---------------------------------------- | ------ | ---------------------------------------------------------------------- |
| Laravel panel (ürün/stok/fiyat yönetimi) | Done   | CRUD + seed data                                                       |
| Shopify app (manual sync + logs)         | Done   | `/app/sync`, `/app/logs`                                               |
| SKU bazlı mapping                        | Done   | Laravel -> Shopify mapping flow                                        |
| Bulk mutation tabanlı sync               | Done   | `productVariantsBulkUpdate`, `inventorySetQuantities`, `metafieldsSet` |
| B2B tag bazlı fiyat                      | Done   | `wholesale`, `vip`, `retail`                                           |
| Sepette özel fiyat uygulama              | Done\* | `cart-transform` aktif store/plan gerektirir                           |
| Webhook sync                             | Done   | Orders/Product/Inventory webhook akışı                                 |
| HMAC + güvenlik                          | Done   | HMAC + internal secret                                                 |
| Canlı deploy                             | Done   | App + Backend canlı URL                                                |

## Core Features

- Full Sync (Laravel -> Shopify)
- Incremental Sync (değişen ürünler)
- SKU bazlı ürün/variant mapping
- Stok güncelleme ve çift yönlü stok akışı
- B2B tier fiyatlarının Shopify metafield olarak taşınması
- Senkron loglarının app içinde izlenmesi

## B2B Pricing Model

Müşteri segmentleri:

- `wholesale`
- `vip`
- `retail`

Shopify product metafield key'leri:

- `custom.wholesale`
- `custom.vip`
- `custom.retail`

Tier çözümleme önceliği:

- `wholesale > vip > retail`
- Tag yoksa `customer.metafields.custom.tier` fallback

## Shopify Functions

- `extensions/b2b-cart-transform`
- `extensions/b2b-pricing`

Davranış:

- `b2b-cart-transform`: cart line fiyatını tier unit price'a sabitler
- `b2b-pricing`: discount tabanlı alternatif fiyatlama

## Platform Limitation (Important)

`cart_transform` aktivasyonu store planına bağlıdır.

- Basic store'da `cartTransformCreate` kısıtına takılabilir.
- Bu case `syncbridge-b2b-case-dev` development store üzerinde yürütülmüştür.

## Security

- Shopify webhook doğrulama: HMAC
- App -> Laravel güvenli istek: `x-internal-secret`
- Idempotency ve duplicate koruması
- Transaction/locking ile race-condition azaltımı

## Sync Modes

- Manual Sync: `/app/sync`
- Incremental Sync: `/app/sync` (mode)
- Webhook Sync: order/product/inventory events

## Setup

1. Repo clone

```bash
git clone <repo-url>
cd SyncBridge
```

2. Servisleri başlat

```bash
docker compose up -d --build
```

3. Laravel migrate/seed

```bash
cd backend
php artisan migrate --seed
```

4. Shopify app build/start

```bash
cd ../shopify-app
npm install
npm run build
npm run start
```

5. Shopify app deploy

```bash
shopify app deploy
```

## Environment Variables

`shopify-app/.env`:

- `SHOPIFY_API_KEY`
- `SHOPIFY_API_SECRET`
- `SHOPIFY_APP_URL=https://syncbridge.hanbeyoglu.com`
- `SCOPES=read_products,write_products,read_inventory,write_inventory,read_orders,write_orders,read_customers,write_customers,read_cart_transforms,write_cart_transforms,write_discounts`
- `LARAVEL_API_URL=https://syncbridge-api.hanbeyoglu.com`
- `API_SECRET_KEY=...`
- `INTERNAL_SECRET=...`
- `B2B_CART_TRANSFORM_FUNCTION_ID=...`
- `B2B_PRICING_FUNCTION_ID=...`

`backend/.env`:

- `INTERNAL_SECRET` (Shopify app ile aynı olmalı)
- DB/APP konfigürasyonları

## Function Activation

- Cart transform setup: `/app/setup-cart-transform`
- Discount setup: `/app/setup-discount`

Beklenen:

- `ok: true` veya `alreadyExists: true`

## QA / Demo Checklist

1. Laravel panelde ürünü pasif yap, sync çalıştır -> Shopify'da arşivlensin.
2. Aynı ürünü aktif yap, sync çalıştır -> Shopify'da yeniden ACTIVE olsun.
3. Üründe `custom.wholesale/vip/retail` değerlerini doğrula.
4. Tag'li müşteriyle giriş yapıp cart'a ürün ekle.
5. Cart line fiyatının tier fiyatına göre güncellendiğini doğrula.
6. Sipariş oluştur, webhook akışında 200 loglarını doğrula.

## Known Limitations

- PDP (ürün detay sayfası) fiyat görünümü için tema Liquid entegrasyonu gerekir.
- Function deploy edilmesi tek başına PDP render'ını değiştirmez.
- Store planına göre `cart_transform` aktivasyonu değişebilir.

## Deliverables

- Laravel backend (canlı)
- Shopify embedded app (canlı)
- Shopify Functions (discount + cart transform)
- GitHub kaynak kodu
- Bu README
