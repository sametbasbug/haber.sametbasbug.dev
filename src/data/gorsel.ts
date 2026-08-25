/* Kart ve manşet görselleri için `srcset` üretir.
 *
 * Sorun ölçülmüştü: kart görselleri 1200×675 iniyordu, kutu 218×148'di.
 * Retina ekranda bile 436×296 yetiyor. Arşiv sayfasının ilk açılışının
 * %82'si (814 KB / 995 KB) görseldi.
 *
 * İki kaynak var ve ikisi de farklı yoldan küçülüyor:
 *
 * - YERELDE üretilmiş görseller (`/images/generated/equinox-haber/...`):
 *   varyantları derleme sırasında `scripts/kucuk-gorsel.mjs` üretiyor.
 * - UZAK görseller (Unsplash, Pexels): adreslerinin hepsi `w=1200&h=675`
 *   taşıyor ve iki servis de bu parametreleri okuyor, yani varyant adres
 *   yazılarak elde ediliyor. İndirip yeniden boyutlandırmaya gerek yok.
 *
 * Tanımadığı bir adres gelirse `srcset` üretmiyor — bozuk bir varyant
 * adresi vermektense tek boy görsel vermek doğru. */

const YEREL_KOK = '/images/generated/equinox-haber/';
const UZAK_SUNUCULAR = ['images.unsplash.com', 'images.pexels.com'];
const GENISLIKLER = [440, 880];
const ASIL_GENISLIK = 1200;

export interface GorselKaynagi {
  src: string;
  srcset?: string;
  sizes?: string;
}

function yerelVaryant(heroImage: string, genislik: number) {
  const ad = heroImage.slice(YEREL_KOK.length).replace(/\.webp$/u, '');
  return `${YEREL_KOK}kucuk/${ad}-${genislik}.webp`;
}

function uzakVaryant(adres: URL, genislik: number) {
  const kopya = new URL(adres);
  const asilGenislik = Number(kopya.searchParams.get('w'));
  const asilYukseklik = Number(kopya.searchParams.get('h'));
  kopya.searchParams.set('w', String(genislik));
  if (asilGenislik > 0 && asilYukseklik > 0) {
    kopya.searchParams.set('h', String(Math.round((asilYukseklik * genislik) / asilGenislik)));
  }
  return kopya.toString();
}

/**
 * @param sizes Tarayıcıya "bu görsel sayfada kaç piksel yer kaplayacak"
 * bilgisi. Bunu vermezsek tarayıcı görselin görüntü genişliği kadar yer
 * kapladığını varsayar ve her zaman en büyüğünü seçer — yani `srcset`
 * hiçbir işe yaramaz.
 */
export function gorselKaynagi(heroImage: string, sizes: string): GorselKaynagi {
  if (!heroImage) return { src: heroImage };

  if (heroImage.startsWith(YEREL_KOK) && heroImage.endsWith('.webp')) {
    const parcalar = GENISLIKLER.map((g) => `${yerelVaryant(heroImage, g)} ${g}w`);
    return {
      src: heroImage,
      srcset: [...parcalar, `${heroImage} ${ASIL_GENISLIK}w`].join(', '),
      sizes,
    };
  }

  if (heroImage.startsWith('https://')) {
    let adres: URL;
    try {
      adres = new URL(heroImage);
    } catch {
      return { src: heroImage };
    }
    if (!UZAK_SUNUCULAR.includes(adres.hostname) || !adres.searchParams.get('w')) {
      return { src: heroImage };
    }
    const asilGenislik = Number(adres.searchParams.get('w')) || ASIL_GENISLIK;
    const parcalar = GENISLIKLER.filter((g) => g < asilGenislik).map((g) => `${uzakVaryant(adres, g)} ${g}w`);
    if (parcalar.length === 0) return { src: heroImage };
    return {
      src: heroImage,
      srcset: [...parcalar, `${heroImage} ${asilGenislik}w`].join(', '),
      sizes,
    };
  }

  return { src: heroImage };
}

/* Kart görseli: mobilde kartın tam genişliği, masaüstünde sabit 220px kutu.
 * Kırılma noktası `NewsCard.astro`daki 760px ile aynı olmak zorunda. */
export const KART_SIZES = '(max-width: 760px) 100vw, 220px';

/* Manşet: her zaman içerik sütununun tamamı, en fazla 1240px. */
export const MANSET_SIZES = '(max-width: 1280px) 100vw, 1240px';
