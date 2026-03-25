# SyncBridge - B2B SaaS & Inventory Orchestrator

Shopify mağazasını harici Laravel paneliyle senkronize çalışan B2B odaklı entegrasyon iskeleti.

## Proje Yapısı

```
SyncBridge/
├── backend/          # Laravel API & Admin Panel
├── shopify-app/      # Shopify Remix App (React)
├── docs/             # Opsiyonel kurulum notları (ör. checkout function taslağı)
└── README.md
```

## Teknoloji Stack

- **Backend:** Laravel 11, PHP 8.2+
- **Shopify App:** Remix, React, Polaris web components
- **Veritabanı:** SQLite (geliştirme) / MySQL (production)
- **Depolama:** GitHub

## Kurulum

### 1. Laravel Backend

```bash
cd backend
composer install
cp .env.example .env
php artisan key:generate
touch database/database.sqlite
php artisan migrate
php artisan db:seed
php artisan serve
```

**Varsayılan giriş:** admin@syncbridge.local / password

### 2. Shopify App

```bash
cd shopify-app
npm install
cp .env.example .env
```

Shopify Partner Dashboard'da yeni app oluşturun ve `shopify app config link` ile bağlayın. `.env` dosyası otomatik doldurulacaktır.

```bash
shopify app dev
```

### 3. Ortam Değişkenleri

**Backend (.env):**
```
SHOPIFY_WEBHOOK_SECRET=    # Shopify App API Secret ile aynı (Laravel HMAC doğrulaması)
API_SECRET_KEY=            # Shopify App ile paylaşılacak güvenli anahtar
```

**Shopify App (.env):**
```
LARAVEL_API_URL=http://localhost:8000   # Laravel backend URL
API_SECRET_KEY=                         # Backend ile aynı
```

## Özellikler (mevcut kod)

### Laravel Panel
- Ayrı kullanıcı girişi ile ürün CRUD
- Örnek seed: 25 SKU (15 `in_shopify=true`, 10 `in_shopify=false`)
- Stok ve B2B fiyat katmanları (wholesale, retail, vip)
- SKU bazlı Shopify ID eşlemesi; senkron sonrası `apply-mapping` ile güncelleme
- HMAC doğrulamalı webhook endpoint'leri (`X-Shopify-Hmac-Sha256`)

### Shopify App
- Admin’de manuel **Laravel → Shopify** senkronizasyonu: **Tam senkron** (tüm aktif ürünler) ve **Incremental** (yalnızca değişen / eşlenmemiş kayıtlar)
- Incremental seçimi: `GET /api/products?sync_mode=incremental` — Laravel `last_synced_at` / `last_synced_hash` ve `needsIncrementalSync()` ile kirli ürünleri filtreler (fiyat, stok toplamı, `in_shopify`, tier’lar, Shopify mapping)
- Başarılı koşulda `POST /api/sync/mark-synced` ile ürünler işaretlenir; `apply-mapping` başarısızsa bu çalıştırmada hiçbiri işaretlenmez (güvenli varsayılan)
- `in_shopify` yaşam döngüsü: mağazada yoksa oluştur, varsa güncelle, panelde kapalıysa ve mağazada aktif ürün varsa **arşivle**, mağazada zaten yoksa atla
- Ürün başına GraphQL: `productCreate` / `productUpdate` (fiyat) / `inventorySetQuantities` / `metafieldsSet` (B2B tier JSON)
- Senkron logları Laravel’de; uygulamada özet + metadata (sayaçlar, hata özeti)
- Shopify webhook’larını Laravel’e iletir; Laravel yanıtı başarısızsa **502** döner (konsolda detay logu)

### Checkout / App Extension
- Bu repoda **hazır bir Shopify App Extension veya Discount Function paketi yok**. Checkout tarafı için `docs/B2B_CHECKOUT_KURULUM.md` yalnızca hedef mimari notu olarak durur; üretimde kullanmak için ayrıca extension oluşturup deploy etmeniz gerekir.

## API Endpoints

### Laravel API (X-API-Secret header gerekli)

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| GET | /api/products | Tüm ürünler; `?sync_mode=full` (varsayılan) veya `incremental` |
| GET | /api/products/{sku} | Tek ürün |
| POST | /api/sync/trigger | Senkronizasyon başlat (log kaydı) |
| POST | /api/sync/apply-mapping | Sync sonrası mapping veya `archived_from_sync` ile Shopify ID temizliği |
| POST | /api/sync/mark-synced | `{ "skus": [...] }` — başarılı senkron sonrası `last_synced_*` güncelle |
| PATCH | /api/sync/logs/{id} | Sync log güncelle |
| GET | /api/sync/logs | Sync logları listele |

### Webhooks (HMAC doğrulamalı)

| Method | Endpoint | Topic |
|--------|----------|-------|
| POST | /api/webhooks/shopify/products/update | products/update |
| POST | /api/webhooks/shopify/inventory/update | inventory_items/update |
| POST | /api/webhooks/shopify/inventory-levels/update | inventory_levels/update |
| POST | /api/webhooks/shopify/orders/create | orders/create |

## Deploy

### Laravel (Railway, Render, Forge vb.)
- `composer install --no-dev`
- `.env` production değerleri
- `php artisan migrate --force`
- Web sunucusu `public/` dizinine işaret etmeli

### Shopify App (Shopify Hosting)
```bash
shopify app deploy
```

`backend/Dockerfile` ve `shopify-app/Dockerfile` ile konteyner denemeleri yapılabilir.

## Güvenlik

- API istekleri `X-API-Secret` ile doğrulanır (`VerifyApiSecret`)
- Webhook gövdesi Laravel’de `X-Shopify-Hmac-Sha256` ile doğrulanır
- Laravel panel `auth` middleware ile korunur

## Lisans

MIT
