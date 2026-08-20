/* `rapidfuzz.fuzz.token_set_ratio` ve `ratio` çevirisi.
 *
 * Bu dosya bir yaklaşım değil, bire bir karşılık olmak zorunda. İki kapı
 * doğrudan buradaki sayıya bakıyor — çevrilmemiş başlık (80) ve tekrar yayın
 * (82) — ve o eşikler `newsroom/tests/corpus` üzerindeki gerçek dağılımdan
 * seçildi. Kendi uydurduğum bir benzerlik ölçüsü eşikleri sessizce kaydırır:
 * kapı durur ama artık ölçtüğü şey ölçüldüğü sanılan şey değildir.
 *
 * Bu yüzden burada tahmin yok: `tools/parity-fuzz.mjs` bu kodu Python'daki
 * rapidfuzz ile aynı girdiler üzerinde karşılaştırır ve tek bir sapma bile
 * testi düşürür.
 *
 * `ratio` rapidfuzz'da normalize edilmiş Indel benzerliğidir. Indel mesafesi
 * yalnız ekleme ve silmeye izin verir (yer değiştirme yok), dolayısıyla
 *
 *     indel(a, b) = |a| + |b| - 2 · LCS(a, b)
 *     ratio(a, b) = (1 - indel / (|a| + |b|)) · 100 = 200 · LCS / (|a| + |b|)
 *
 * Not: bu difflib'in `SequenceMatcher.ratio()`'su DEĞİLDİR. difflib eşleşen
 * blokları kullanır ve LCS'ten farklı sonuç verebilir; rapidfuzz'ı taklit
 * ediyoruz, fuzzywuzzy'yi değil.
 */

/** En uzun ortak alt dizi uzunluğu. Yalnız uzunluk gerektiği için tek satırlık
 *  gezen tampon yeterli — başlıklar kısa, ama gövde de gelse bellek O(min). */
function lcsLength(a: string, b: string): number {
  if (a.length === 0 || b.length === 0) return 0;

  // Kısa olanı sütuna alıyoruz ki tampon her zaman ikisinin küçüğü kadar olsun.
  if (a.length < b.length) [a, b] = [b, a];

  const previous = new Uint32Array(b.length + 1);
  const current = new Uint32Array(b.length + 1);

  for (let i = 0; i < a.length; i += 1) {
    const ai = a.charCodeAt(i);
    for (let j = 0; j < b.length; j += 1) {
      current[j + 1] =
        ai === b.charCodeAt(j)
          ? previous[j] + 1
          : Math.max(current[j], previous[j + 1]);
    }
    previous.set(current);
  }

  return previous[b.length];
}

/** rapidfuzz `fuzz.ratio`: normalize edilmiş Indel benzerliği, 0–100. */
export function ratio(a: string, b: string): number {
  const total = a.length + b.length;
  if (total === 0) return 100;
  return (200 * lcsLength(a, b)) / total;
}

/** Boşluğa göre böler ve boş parçaları atar — Python `str.split()` davranışı. */
function tokenSet(value: string): Set<string> {
  const tokens = new Set<string>();
  for (const token of value.split(/\s+/u)) {
    if (token.length > 0) tokens.add(token);
  }
  return tokens;
}

function sortedJoin(tokens: Iterable<string>): string {
  // Python `sorted()` kod noktasına göre sıralar; JS'in varsayılan dizi
  // sıralaması UTF-16 kod birimine göre sıralar. BMP dışı karakterlerde bu iki
  // sıra ayrışır, ama sıralama yalnız birleştirme öncesi belirlenimcilik için
  // gerekli ve iki taraf da aynı diziyi üretmek zorunda — bu yüzden kod
  // noktası karşılaştırması açıkça isteniyor.
  return [...tokens].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0)).join(" ");
}

/** rapidfuzz `fuzz.token_set_ratio`. Ön işleme yok: çağıran taraf zaten
 *  küçük harfe çeviriyor (`accept.py`, `live.py`) ve buradaki sessiz bir
 *  normalizasyon o taraftaki niyeti gizlerdi. */
export function tokenSetRatio(a: string, b: string): number {
  const tokensA = tokenSet(a);
  const tokensB = tokenSet(b);

  // rapidfuzz boş belirteç kümesinde 0 döner — `ratio`'nun boş/boş için 100
  // dönmesinden farklı olarak. İki işlevin boşluk sözleşmesi aynı değil ve bu
  // fark uydurma değil, ölçülerek bulundu (`tools/parity-fuzz.mjs`). Kısayol
  // olmadan sect/combined üçlüsü boş dizgilere düşüyor ve 100 üretiyordu.
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  const intersection: string[] = [];
  const onlyA: string[] = [];
  for (const token of tokensA) {
    (tokensB.has(token) ? intersection : onlyA).push(token);
  }
  const onlyB: string[] = [];
  for (const token of tokensB) {
    if (!tokensA.has(token)) onlyB.push(token);
  }

  // Biri diğerinin alt kümesiyse ortak parça tek başına her iki birleşimi de
  // kapsar ve sonuç tanım gereği 100'dür. rapidfuzz bunu kısayol olarak ele
  // alır; hesaplayarak da aynı sayı çıkar, ama kısayol olmadan boş dizgilerde
  // 0/0 durumuna girilir.
  if (intersection.length > 0 && (onlyA.length === 0 || onlyB.length === 0)) {
    return 100;
  }

  const sect = sortedJoin(intersection);
  const combinedA = (sect + " " + sortedJoin(onlyA)).trim();
  const combinedB = (sect + " " + sortedJoin(onlyB)).trim();

  return Math.max(
    ratio(sect, combinedA),
    ratio(sect, combinedB),
    ratio(combinedA, combinedB),
  );
}
