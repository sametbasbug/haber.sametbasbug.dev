/* Yayından kaldırılmış haberler.
 *
 * `articles.is_draft` "şu an yayında mı" sorusunu cevaplıyor ve okuma
 * yollarının tamamı onu süzüyor. Burası ikinci bir soruyu cevaplıyor:
 * kaldırılmış bir adrese gelen okuyucuya ne diyeceğiz.
 */
import { getDatabase } from '#runtime-env';

export interface Withdrawal {
	slug: string;
	tarih: string;
}

/** Slug kaldırılmışsa son kaldırma olayını döndürür.
 *
 * Son olay `restore` ise `null`: haber geri alınmış ve şimdi yayında olmalı.
 * Bu durumda zaten buraya düşülmez, ama sıralamaya güvenmek yerine kontrol
 * ediliyor — "geri alındı ama hâlâ kaldırılmış görünüyor" sessiz bir yalan
 * olurdu. */
export async function getWithdrawal(slug: string): Promise<Withdrawal | null> {
	const db = getDatabase();
	if (!db) return null;

	/* Sıralama `id` üzerinden, `created_at` üzerinden DEĞİL.
	 *
	 * `created_at` bir TEXT sütunu ve sıralaması yazılan biçime bağlı. Yerel
	 * bir denemede elle `datetime('now')` ile satır ekledim ("2026-08-23
	 * 19:48"), uygulama ise ISO yazıyor ("2026-08-23T19:48Z"); metin
	 * karşılaştırmasında 'T' boşluktan büyük olduğu için ESKİ satır yeni
	 * satırın üstüne çıktı ve kaldırılmış bir haber "yayında" göründü.
	 * Uygulama içinde biçim tutarlı, ama bir gün biri elle satır ekleyecek ve
	 * o gün bu sessizce yanlış cevap verirdi. `id` monoton ve biçimden
	 * bağımsız. */
	const row = await db
		.prepare(
			`SELECT slug, action, created_at FROM article_withdrawals
			  WHERE slug = ? ORDER BY id DESC LIMIT 1`,
		)
		.bind(slug)
		.first<{ slug: string; action: string; created_at: string }>();

	if (!row || row.action !== 'withdraw') return null;
	return { slug: row.slug, tarih: row.created_at };
}

const escape = (value: string) =>
	value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');

/** Kaldırılan adreste gösterilen sayfa.
 *
 * Bağımsız ve minimum: `NewsLayout` bütün koleksiyonu okuyor (bir sayfa
 * isteği 4225 satır) ve burası önbelleğe girmiyor. Kaldırılmış bir adres için
 * o maliyeti ödemek, silinmiş içeriğin yayındakinden pahalı olması demekti. */
export function kaldirilanSayfasi(tarih: string): string {
	const gun = new Intl.DateTimeFormat('tr-TR', {
		day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Istanbul',
	}).format(new Date(tarih));

	return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Bu haber yayından kaldırıldı | Equinox Haber</title>
<style>
:root { color-scheme: dark; }
body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 2rem;
  background: #0b0b0f; color: #e8e8ee;
  font-family: Inter, system-ui, -apple-system, "Segoe UI", sans-serif; }
/* width gerekiyor, max-width tek basina yetmiyor: grid cocugu varsayilan
   olarak icerigine gore daraliyor ve metin 34rem yerine sigabildigi en dar
   sutuna sikisiyordu. Bu yorum bir sablon dizesinin ICINDE: ters tirnak
   kullanilamaz, dizeyi kapatir. */
main { width: min(34rem, 100%); text-align: center; }
h1 { font-size: 1.6rem; line-height: 1.3; margin: 0 0 1.25rem; letter-spacing: -.01em; }
p { line-height: 1.7; color: #b9b9c6; margin: 0 0 1rem; }
a { color: #a78bfa; }
</style>
</head>
<body>
<main>
<h1>Bu haber yayından kaldırıldı</h1>
<p>Bu adreste bir haber yayımlanmıştı ve ${escape(gun)} tarihinde yayından
kaldırıldı. Adres duruyor; paylaşılmış bir bağlantıyı sessizce boş bir sayfaya
düşürmek istemedik.</p>
<p>Düzeltme ve kaldırma yaklaşımımız
<a href="/duzeltme-politikasi/">düzeltme politikasında</a> yazılı.</p>
<p><a href="/">Equinox Haber ana sayfası</a></p>
</main>
</body>
</html>`;
}
