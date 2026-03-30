import { redirect, Form, useLoaderData } from "react-router";
import { login } from "../../shopify.server";
import styles from "./styles.module.css";

export const loader = async ({ request }) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <div className={styles.hero}>
          <p className={styles.kicker}>SyncBridge</p>
          <h1 className={styles.heading}>
            Shopify ve Laravel arasinda B2B senkronu tek panelden yonetin
          </h1>
          <p className={styles.text}>
            Urun, stok ve musteri segmentine ozel fiyatlarinizi guvenli sekilde
            senkronize edin. Manual, incremental ve webhook akislari tek yapida
            birlesir.
          </p>
          <ul className={styles.list}>
            <li>SKU bazli urun esleme ve hizli fiyat/stok guncelleme</li>
            <li>Tag bazli B2B fiyatlandirma ve cart function entegrasyonu</li>
            <li>Detayli loglar, webhook dogrulama ve guvenli API koprusu</li>
          </ul>
        </div>

        {showForm && (
          <div className={styles.loginCard}>
            <h2 className={styles.cardTitle}>Magaza baglantisi</h2>
            <p className={styles.cardText}>
              Shopify magaza domaininizi girin ve uygulamaya guvenli giris
              yapin.
            </p>
            <Form className={styles.form} method="post" action="/auth/login">
              <label className={styles.label}>
                <span>Shop domain</span>
                <input
                  className={styles.input}
                  type="text"
                  name="shop"
                  placeholder="ornek-magaza.myshopify.com"
                />
              </label>
              <button className={styles.button} type="submit">
                Uygulamaya Gir
              </button>
            </Form>
          </div>
        )}
      </div>
    </div>
  );
}
