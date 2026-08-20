/* `newsroom/newsroom/lang.py` çevirisi.
 *
 * Eşikler korpustan ampirik seçildi ve orijinal dosyada gerekçeleriyle yazılı.
 * Buradaki iş onları yeniden düşünmek değil, aynı sayıyı üretmek.
 *
 * Düzenli ifadelerde bire bir çeviri yapılamıyor ve bunun nedeni önemli:
 * Python'da `\w` ve `\b` Unicode farkındadır, JavaScript'te ASCII'dir. `\b[A-Z…]`
 * kalıbı JS'e olduğu gibi taşınsaydı "Ürün" gibi bir sözcükte sınır hiç
 * eşleşmezdi, çünkü JS'e göre `Ü` zaten sözcük karakteri değil. Türkçe bir
 * haber sitesinde bu sessizce yanlış ölçüm demek.
 *
 * Bu yüzden `\w` → `[\p{L}\p{N}_]` ve `\b` → geriye bakış ile açıkça yazıldı.
 * Çevirinin tuttuğu `tools/parity-lang.mjs` ile korpusun tamamında ölçülüyor.
 */

import { tokenSetRatio } from "./fuzz.ts";

export const BODY_MIN_TURKISH_EVIDENCE = 0.15;
export const BODY_MAX_ENGLISH_DENSITY = 0.06;
export const MIN_MEASURABLE_WORDS = 25;
export const UNTRANSLATED_SIMILARITY = 80;

/* Python: `[^\W\d_]+` (re.UNICODE) — sözcük karakteri ama rakam ve alt çizgi
 * değil, yani harf. JS karşılığı `\p{L}`; `u` bayrağı olmadan Türkçe harfler
 * dışarıda kalır. */
const WORD_RE = /\p{L}+/gu;

const TURKISH_CHARS = new Set("çğıöşüÇĞİÖŞÜ");

const ENGLISH_FUNCTION_WORDS = new Set([
  "the", "and", "of", "to", "in", "for", "on", "with", "at", "by", "from",
  "as", "is", "are", "was", "were", "be", "been", "has", "have", "had",
  "will", "would", "can", "could", "that", "this", "these", "those", "it",
  "its", "he", "she", "they", "their", "his", "her", "but", "not", "after",
  "before", "over", "into", "about", "than", "then", "who", "what", "which",
  "said", "says", "more", "most", "new", "up", "out", "if", "how", "why",
]);

const PROPER_NOUN_CONNECTORS =
  "of|for|the|and|de|del|la|le|van|von|der|des|du|di|da";

/* Çok sözcüklü özel ad öbekleri. `\b` yerine geriye bakış, `\w` yerine
 * `[\p{L}\p{N}_]` — gerekçesi dosya başında. */
const PROPER_NOUN_SPAN_RE = new RegExp(
  "(?<![\\p{L}\\p{N}_])[A-ZÇĞİÖŞÜ][\\p{L}\\p{N}_’']*" +
    `(?:\\s+(?:${PROPER_NOUN_CONNECTORS})(?![\\p{L}\\p{N}_])` +
    "|\\s+[A-ZÇĞİÖŞÜ][\\p{L}\\p{N}_’']*)+",
  "gu",
);

const TURKISH_SUFFIX_RE = new RegExp(
  "(?:" +
    "lar[ıi]n|leri[n]?|lar[ıi]|ler[ei]?|" +
    "[dt]a[kn]i|[dt]e[kn]i|" +
    "n[ıiuü]n|[ıiuü]n[ıiuü]|" +
    "[ıiuü]yor|[ae]cak|[ae]ce[gğ]i|" +
    "m[ae]k|m[ae]y[ıi]|" +
    "[ıiuü]ld[ıiuü]|[dt][ıiuü]|[dt][ıiuü]r|" +
    "[ae]r[ae]k|[ıiuü]nc[ae]|" +
    "l[ıiuü][gğ][ıiuü]|l[ıiuü]k" +
    ")$",
  "u",
);

export interface LanguageMeasurement {
  wordCount: number;
  englishDensity: number;
  turkishEvidence: number;
}

export function measurable(reading: LanguageMeasurement): boolean {
  return reading.wordCount >= MIN_MEASURABLE_WORDS;
}

function words(text: string): string[] {
  return text.match(WORD_RE) ?? [];
}

/** Türkçe sinyali tam metinden, İngilizce sinyali özel ad öbekleri
 *  çıkarılmış metinden ölçülür. */
export function measure(text: string): LanguageMeasurement {
  const lowered = words(text).map((w) => w.toLowerCase());
  if (lowered.length === 0) {
    return { wordCount: 0, englishDensity: 0, turkishEvidence: 0 };
  }

  const total = lowered.length;
  const withoutNames = text.replace(PROPER_NOUN_SPAN_RE, " ");

  let english = 0;
  for (const word of words(withoutNames)) {
    if (ENGLISH_FUNCTION_WORDS.has(word.toLowerCase())) english += 1;
  }

  let turkishChars = 0;
  let turkishSuffix = 0;
  for (const word of lowered) {
    for (const ch of word) {
      if (TURKISH_CHARS.has(ch)) { turkishChars += 1; break; }
    }
    if (TURKISH_SUFFIX_RE.test(word)) turkishSuffix += 1;
  }

  return {
    wordCount: total,
    englishDensity: english / total,
    turkishEvidence: (turkishChars + turkishSuffix) / total,
  };
}

export function bodyIsTurkish(body: string): { ok: boolean; reason: string | null } {
  const reading = measure(body);

  if (!measurable(reading)) {
    return { ok: false, reason: `gövde ölçülemeyecek kadar kısa (${reading.wordCount} sözcük)` };
  }
  if (reading.englishDensity > BODY_MAX_ENGLISH_DENSITY) {
    return {
      ok: false,
      reason: `İngilizce yoğunluğu yüksek (${reading.englishDensity.toFixed(3)} > ${BODY_MAX_ENGLISH_DENSITY})`,
    };
  }
  if (reading.turkishEvidence < BODY_MIN_TURKISH_EVIDENCE) {
    return {
      ok: false,
      reason: `Türkçe sinyali zayıf (${reading.turkishEvidence.toFixed(3)} < ${BODY_MIN_TURKISH_EVIDENCE})`,
    };
  }
  return { ok: true, reason: null };
}

/** Kısa metinde asıl risk "Türkçe değil" değil, "kaynak başlığı aynen kalmış". */
export function looksUntranslated(
  text: string,
  sourceText: string,
): { untranslated: boolean; detail: string | null } {
  if (!text.trim() || !sourceText.trim()) return { untranslated: false, detail: null };

  const similarity = tokenSetRatio(text.toLowerCase(), sourceText.toLowerCase());
  if (similarity >= UNTRANSLATED_SIMILARITY) {
    return {
      untranslated: true,
      detail: `kaynak metnine çok benzer (benzerlik ${similarity.toFixed(0)} >= ${UNTRANSLATED_SIMILARITY})`,
    };
  }
  return { untranslated: false, detail: null };
}
