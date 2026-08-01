"""Dil kapısı (M14).

Asteria'nın ürettiği metnin gerçekten Türkçe olduğunu ve kaynak başlığının
olduğu gibi kopyalanmadığını doğrular.

Tasarım notu — neden ölçüm, neden kelime listesi değil:

Eski sistem üç el yapımı kelime listesine (`ENGLISH_MARKERS`, `TURKISH_MARKERS`,
`TURKISH_MORPHOLOGY_RE`) ve İngilizce işaret *sayısına* dayanıyordu. Sayı
uzunluğa bağlı olduğu için uzun Türkçe gövdeler yanlışlıkla reddediliyor, her
yanlış rette koda yeni bir istisna fonksiyonu ekleniyordu
(`body_looks_too_english`, `fact_looks_too_english`).

Buradaki kapı sayı değil **yoğunluk** kullanır; yoğunluk uzunluktan bağımsızdır.
Uzun bir Türkçe metinde geçen "Institute for the Study of War" istisna
gerektirmez, çünkü dört sözcük 150 sözcüklük bir metinde zaten düşük yoğunluktur.

Kısa metne (başlık, description) dil sınıflandırması uygulanmaz. Özel ad yoğun
Türkçe başlıklar — "LinkedIn'in başına Dan Shapero geçti" — hiçbir eşikte
güvenilir sınıflanmaz. Kısa metinde asıl risk zaten farklıdır: kaynak başlığının
çevrilmeden geçmesi. O risk `looks_untranslated()` ile doğrudan ölçülür.

Eşikler `newsroom/tests/corpus` üzerinde ampirik seçildi; gözlenen paylar için
`tests/test_lang.py`.
"""

from __future__ import annotations

from dataclasses import dataclass
import re

from rapidfuzz.fuzz import token_set_ratio

# Gövde kapısı eşikleri.
# Korpusta gözlenen: Türkçe gövdelerde en_density p99=0.029, tr_evidence p01=0.51;
# İngilizce metinlerde en_density p01=0.118, tr_evidence p99≈0.00.
# Aradaki boşluk geniş; eşikler boşluğun ortasına değil, Türkçe tarafa güvenli
# mesafede konuldu (yanlış ret, yanlış kabulden pahalıdır).
BODY_MIN_TURKISH_EVIDENCE = 0.15
BODY_MAX_ENGLISH_DENSITY = 0.06

# Ölçüm için gereken en az sözcük sayısı. Altında karar verilmez.
MIN_MEASURABLE_WORDS = 25

# Kaynak metninden kopyalanmışlık eşiği.
# Korpusta 584 yayının Türkçe başlığı ile İngilizce kaynak başlığı arasındaki
# token_set_ratio: medyan 40, p99 62, gözlenen maksimum 68.
UNTRANSLATED_SIMILARITY = 80

_WORD_RE = re.compile(r"[^\W\d_]+", re.UNICODE)

_TURKISH_CHARS = frozenset("çğıöşüÇĞİÖŞÜ")

# İngilizce fonksiyon sözcükleri. İçerik sözcüğü değil yapı sözcüğü oldukları
# için konu ne olursa olsun İngilizce metinde yüksek, Türkçe metinde özel ad
# öbekleri dışında sıfıra yakın yoğunlukta bulunurlar.
_ENGLISH_FUNCTION_WORDS = frozenset({
    "the", "and", "of", "to", "in", "for", "on", "with", "at", "by", "from",
    "as", "is", "are", "was", "were", "be", "been", "has", "have", "had",
    "will", "would", "can", "could", "that", "this", "these", "those", "it",
    "its", "he", "she", "they", "their", "his", "her", "but", "not", "after",
    "before", "over", "into", "about", "than", "then", "who", "what", "which",
    "said", "says", "more", "most", "new", "up", "out", "if", "how", "why",
})

# Türkçe çekim ve yapım ekleri. Kapsayıcı bir morfoloji çözümlemesi değil,
# yoğunluk sinyali üretmeye yeten bir örneklem.
_PROPER_NOUN_CONNECTORS = r"of|for|the|and|de|del|la|le|van|von|der|des|du|di|da"

# Çok sözcüklü özel ad öbekleri: "Institute for the Study of War",
# "Center for Strategic and International Studies", "The Guardian".
#
# Bu öbeklerin içindeki "for", "the", "of" birer İngilizce yapı sözcüğü değil,
# adın parçasıdır. Ölçümden önce çıkarılmazlarsa, iki kurum adı anan temiz bir
# Türkçe gövde İngilizce sayılabilir. Eski sistem bu durumu ayrı bir istisna
# fonksiyonuyla çözüyordu; burada ölçümün kendisi düzeltiliyor.
_PROPER_NOUN_SPAN_RE = re.compile(
    r"\b[A-ZÇĞİÖŞÜ][\w’']*"
    rf"(?:\s+(?:{_PROPER_NOUN_CONNECTORS})\b|\s+[A-ZÇĞİÖŞÜ][\w’']*)+"
)

_TURKISH_SUFFIX_RE = re.compile(
    r"(?:"
    r"lar[ıi]n|leri[n]?|lar[ıi]|ler[ei]?|"
    r"[dt]a[kn]i|[dt]e[kn]i|"
    r"n[ıiuü]n|[ıiuü]n[ıiuü]|"
    r"[ıiuü]yor|[ae]cak|[ae]ce[gğ]i|"
    r"m[ae]k|m[ae]y[ıi]|"
    r"[ıiuü]ld[ıiuü]|[dt][ıiuü]|[dt][ıiuü]r|"
    r"[ae]r[ae]k|[ıiuü]nc[ae]|"
    r"l[ıiuü][gğ][ıiuü]|l[ıiuü]k"
    r")$"
)


@dataclass(frozen=True, slots=True)
class LanguageMeasurement:
    """Bir metnin ham dil ölçümü. Karar değil, girdi."""

    word_count: int
    english_density: float
    turkish_evidence: float

    @property
    def measurable(self) -> bool:
        return self.word_count >= MIN_MEASURABLE_WORDS


def measure(text: str) -> LanguageMeasurement:
    """Metnin Türkçe ve İngilizce sinyal yoğunluklarını ölçer.

    Türkçe sinyali tam metin üzerinden, İngilizce sinyali ise özel ad öbekleri
    çıkarılmış metin üzerinden hesaplanır.
    """
    words = [word.lower() for word in _WORD_RE.findall(text)]
    if not words:
        return LanguageMeasurement(0, 0.0, 0.0)

    total = len(words)
    without_names = _PROPER_NOUN_SPAN_RE.sub(" ", text)
    english = sum(
        1
        for word in _WORD_RE.findall(without_names.lower())
        if word in _ENGLISH_FUNCTION_WORDS
    )
    turkish_chars = sum(1 for word in words if _TURKISH_CHARS.intersection(word))
    turkish_suffix = sum(1 for word in words if _TURKISH_SUFFIX_RE.search(word))

    return LanguageMeasurement(
        word_count=total,
        english_density=english / total,
        turkish_evidence=(turkish_chars + turkish_suffix) / total,
    )


def body_is_turkish(body: str) -> tuple[bool, str | None]:
    """Haber gövdesinin Türkçe olup olmadığına karar verir.

    Yalnız gövde gibi ölçülebilir uzunluktaki metinler için kullanılır.
    """
    reading = measure(body)

    if not reading.measurable:
        return False, f"gövde ölçülemeyecek kadar kısa ({reading.word_count} sözcük)"

    if reading.english_density > BODY_MAX_ENGLISH_DENSITY:
        return False, (
            f"İngilizce yoğunluğu yüksek "
            f"({reading.english_density:.3f} > {BODY_MAX_ENGLISH_DENSITY})"
        )

    if reading.turkish_evidence < BODY_MIN_TURKISH_EVIDENCE:
        return False, (
            f"Türkçe sinyali zayıf "
            f"({reading.turkish_evidence:.3f} < {BODY_MIN_TURKISH_EVIDENCE})"
        )

    return True, None


def looks_untranslated(text: str, source_text: str) -> tuple[bool, str | None]:
    """Metnin kaynağından çevrilmeden geçirilip geçirilmediğini ölçer.

    Başlık ve description için dil sınıflandırması yerine bu kullanılır:
    kısa metinde asıl risk "Türkçe değil" değil, "kaynak başlığı aynen kalmış".
    """
    if not text.strip() or not source_text.strip():
        return False, None

    similarity = token_set_ratio(text.lower(), source_text.lower())
    if similarity >= UNTRANSLATED_SIMILARITY:
        return True, (
            f"kaynak metnine çok benzer (benzerlik {similarity:.0f} "
            f">= {UNTRANSLATED_SIMILARITY})"
        )
    return False, None
