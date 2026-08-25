#!/usr/bin/env node
/* Kart görselleri için küçük varyant üretir.
 *
 * NEDEN: kart görselleri 1200×675 geliyordu, kartın içindeki kutu ise
 * 218×148. Retina ekranda bile 436×296 yetiyor, yani gereğinden altı kat
 * fazla piksel gönderiyorduk. Ölçüldüğünde arşiv sayfasının ilk açılışı
 * 995 KB'ti ve bunun 814 KB'ı (%82) görseldi. Arşivi baştan sona okuyan
 * biri kabaca 52 MB indiriyordu.
 *
 * NEDEN DEPOYA KONMUYOR: çıktı `.gitignore`da. Bir haber yayımlandığında
 * varyantının da üretilip commit'lenmesi gereken bir düzen kurmak, o adımın
 * bir gün atlanacağı ve haberin sessizce bozuk bir `srcset` ile yayına
 * gireceği anlamına gelir. Derleme sırasında üretmek, iki tarafın her zaman
 * eşleşmesini garanti eder.
 *
 * Uzak görseller (Unsplash, Pexels) buradan geçmiyor; onların adresi zaten
 * `w=` parametresi taşıyor ve varyant adres yazılarak elde ediliyor
 * (bkz. `src/data/gorsel.ts`).
 */
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const KAYNAK = 'public/images/generated/equinox-haber';
const HEDEF = path.join(KAYNAK, 'kucuk');
/* Defter `public/` DIŞINDA: oradaki her dosya olduğu gibi yayına kopyalanıyor
 * ve bir önbellek dosyasının sitede adresi olmasının anlamı yok. */
const DEFTER = '.cache/kucuk-gorsel.json';
const GENISLIKLER = [440, 880];
const KALITE = 78;

/* Kaynak dosya değişmediyse yeniden üretilmiyor. Karşılaştırma zaman damgası
 * değil İÇERİK özeti üzerinden: `git clone` bütün dosyalara aynı anı yazar,
 * yani temiz bir checkout'ta zaman damgası hiçbir şey söylemez. */
async function ozetiOku(dosya) {
  try {
    return JSON.parse(await readFile(dosya, 'utf8'));
  } catch {
    return {};
  }
}

async function main() {
  const kuru = process.argv.includes('--kuru');
  await mkdir(HEDEF, { recursive: true });

  await mkdir(path.dirname(DEFTER), { recursive: true });
  const defterYolu = DEFTER;
  const eskiDefter = await ozetiOku(defterYolu);
  const yeniDefter = {};

  const dosyalar = (await readdir(KAYNAK)).filter((ad) => ad.endsWith('.webp')).sort();
  let uretilen = 0;
  let atlanan = 0;
  let kaynakBayt = 0;
  let hedefBayt = 0;

  for (const ad of dosyalar) {
    const kaynakYolu = path.join(KAYNAK, ad);
    const veri = await readFile(kaynakYolu);
    const ozet = createHash('sha256').update(veri).digest('hex').slice(0, 16);
    yeniDefter[ad] = ozet;
    kaynakBayt += veri.length;

    const cikislar = GENISLIKLER.map((g) => ({
      genislik: g,
      yol: path.join(HEDEF, `${ad.replace(/\.webp$/u, '')}-${g}.webp`),
    }));

    let hepsiVar = eskiDefter[ad] === ozet;
    if (hepsiVar) {
      for (const cikis of cikislar) {
        try {
          const bilgi = await stat(cikis.yol);
          hedefBayt += bilgi.size;
        } catch {
          hepsiVar = false;
          break;
        }
      }
    }

    if (hepsiVar) {
      atlanan += 1;
      continue;
    }

    for (const cikis of cikislar) {
      const tampon = await sharp(veri).resize(cikis.genislik).webp({ quality: KALITE }).toBuffer();
      hedefBayt += tampon.length;
      if (!kuru) await writeFile(cikis.yol, tampon);
    }
    uretilen += 1;
  }

  if (!kuru) await writeFile(defterYolu, JSON.stringify(yeniDefter, null, '\t'));

  const mb = (b) => (b / 1048576).toFixed(1);
  console.log(
    `Küçük görsel: ${uretilen} üretildi, ${atlanan} atlandı (değişmemiş).\n` +
      `  kaynak ${mb(kaynakBayt)} MB → varyantlar ${mb(hedefBayt)} MB`,
  );
}

main().catch((hata) => {
  console.error('Küçük görsel üretilemedi:', hata);
  process.exit(1);
});
