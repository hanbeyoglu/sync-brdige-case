# SyncBridge – Shopify ↔ Laravel B2B Senkronizasyon Platformu

## 🚀 Genel Bakış

SyncBridge, Laravel backend ile Shopify arasında ürün, stok ve B2B fiyat verilerini senkronize eden full-stack bir entegrasyon platformudur.

Sistem **ölçeklenebilir, güvenli ve production-ready mimari** ile geliştirilmiştir.

Desteklenen özellikler:

- Tam ve incremental ürün senkronizasyonu
- Çok katmanlı B2B fiyat sistemi (wholesale, retail, VIP)
- Webhook tabanlı gerçek zamanlı güncellemeler
- Shopify Functions (Discount & Cart Transform)
- Idempotent ve eşzamanlılığa dayanıklı stok yönetimi

---

## 🧱 Mimari

```text
Shopify
   ↓ (Webhook - HMAC doğrulama)
Node.js Shopify App (Gateway)
   ↓ (Internal Secret ile güvenli istek)
Laravel Backend (İş Mantığı)
```

---

## 🔐 Güvenlik Modeli

- Shopify webhook’ları Node.js katmanında **HMAC ile doğrulanır**
- Laravel sadece güvenilir iç istekleri kabul eder:
  - `x-internal-secret`

- Bu sayede:
  - Sahte istekler engellenir
  - Tekrarlı doğrulama önlenir
  - Sistem katmanlı güvenliğe sahip olur

---

## 🛍️ Özellikler

### ✅ Laravel Yönetim Paneli

- Admin login sistemi
- Ürün CRUD işlemleri
- Seed ile oluşturulmuş 25 ürün:
  - 15’i Shopify ile senkron
  - 10’u yalnızca harici

---

### 📦 Stok Yönetimi

- Stoklar `product_inventories.quantity` alanında tutulur
- Çift yönlü senkronizasyon:
  - Laravel → Shopify
  - Shopify → Laravel (webhook ile)

---

### 💰 B2B Fiyatlandırma

- Katmanlı fiyat sistemi:
  - wholesale
  - retail
  - VIP

- `ProductPriceTier` tablosunda saklanır
- Shopify’a **metafield (JSON)** olarak gönderilir

---

### 🔁 Senkronizasyon Sistemi

#### 🔹 Full Sync

Tüm ürünler Shopify’a gönderilir

#### 🔹 Incremental Sync

Sadece değişen ürünler senkronize edilir:

- hash kontrolü
- `needsIncrementalSync` flag

---

### ⚡ Toplu Güncelleme (Bulk)

Bu projede Shopify’ın async Bulk Operation API’si yerine:

- `productVariantsBulkUpdate`
- `inventorySetQuantities`
- `metafieldsSet`

kullanılmıştır.

#### Neden?

- Daha hızlı geri bildirim
- Daha kolay hata yönetimi
- Orta ölçekli veri için daha kontrol edilebilir yapı

---

### 🔌 Shopify App (React Router)

Özellikler:

- Manuel senkron ekranı
- Senkron logları görüntüleme
- Laravel API ile güvenli iletişim

Route’lar:

- `/app/sync`
- `/app/logs`

---

### 🔔 Webhook Sistemi

#### Akış:

```text
Shopify → Node → Laravel
```

#### Desteklenen Webhook’lar:

- `orders/create`
- `products/update`
- `inventory/update`
- `inventory-levels/update`

---

### 🧠 Idempotency & Eşzamanlılık Yönetimi

Çift stok düşmesini engellemek için:

- `shopify_webhook_logs` tablosu (unique order_id)
- `insertOrIgnore()` ile atomic claim
- `DB::transaction()` ile güvenli işlem
- `lockForUpdate()` ile race condition önleme

---

### 🧾 Sipariş İşleme

Sipariş geldiğinde:

- line_items parse edilir
- Shopify `variant_id` → Laravel ürün eşleşmesi yapılır
- stok güvenli şekilde düşürülür

---

### 🧩 Shopify Functions (Extension)

Projede bulunan extension’lar:

- `b2b-pricing` → indirim hesaplama
- `b2b-cart-transform` → sepet manipülasyonu

---

## ⚠️ Ürün Sayfası Fiyat Gösterimi (PDP)

B2B fiyatlar:

- metafield olarak Shopify’a gönderilir
- Shopify Functions ile uygulanır

⚠️ Ürün sayfasında (PDP) gösterim için:

- Shopify tema (Liquid) düzenlemesi gerekir

---

## 🔐 Ortam Değişkenleri

### Node (Shopify App)

```env
INTERNAL_SECRET=super_secure_key
SHOPIFY_API_KEY=...
SHOPIFY_API_SECRET=...
```

---

### Laravel

```env
INTERNAL_SECRET=super_secure_key
DB_CONNECTION=...
```

---

## 🧪 Kurulum

### 1. Repo klonla

```bash
git clone https://github.com/your-repo/syncbridge.git
cd syncbridge
```

---

### 2. Docker başlat

```bash
docker compose up -d --build
```

---

### 3. Laravel kurulum

```bash
php artisan migrate
php artisan db:seed
```

---

### 4. Shopify App başlat

```bash
npm run build
npm run start
```

---

## 🌐 Deployment

Sistem production ortamında çalışacak şekilde tasarlanmıştır:

- HTTPS aktif
- Shopify app kurulmuş
- Webhook endpoint’leri public
- .env doğru yapılandırılmış

---

## 📊 Loglama

Sistem şu olayları loglar:

- webhook alındı
- duplicate tespit edildi
- stok güncellendi
- senkron işlemleri

---

## 🧠 Mimari Kararlar

- HMAC doğrulama sistem girişinde (Node)
- Laravel’da internal güvenlik katmanı
- DB seviyesinde idempotency
- Senkron GraphQL kullanımı

---

## 📌 Özet

Bu proje case’in temel gereksinimlerini büyük ölçüde karşılar:

- Laravel panel ✔️
- Ürün + stok senkron ✔️
- B2B fiyat sistemi ✔️
- Shopify entegrasyonu ✔️
- Webhook sistemi ✔️
- Güvenli mimari ✔️
- Idempotent işlem ✔️

---

## 👨‍💻 Geliştirici

Bu proje teknik case çalışması kapsamında geliştirilmiştir.

---
