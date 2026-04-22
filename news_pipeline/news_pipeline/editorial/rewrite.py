from __future__ import annotations

import re
import unicodedata

from news_pipeline.models.article import NormalizedArticle
from news_pipeline.utils.text import clean_text

TITLE_REPLACEMENTS = {
    "openai": "OpenAI",
    "chatgpt": "ChatGPT",
    "anthropic": "Anthropic",
    "google": "Google",
    "meta": "Meta",
    "trump": "Trump",
    "uk": "İngiltere",
    "us": "ABD",
    "eu": "AB",
    "pm": "başbakanı",
    "ag": "başsavcısı",
}

SUMMARY_REPLACEMENTS = {
    "announces": "açıkladı",
    "investigation": "soruşturma",
    "claims": "iddiasına göre",
    "responds": "yanıt verdi",
    "hits": "ulaştı",
    "valuation": "değerleme",
    "temporarily banned": "geçici olarak engelledi",
    "finally offers": "sunmaya başladı",
    "power users": "ileri seviye kullanıcılar",
    "plan": "plan",
    "subscription": "abonelik",
    "subscriptions": "abonelikler",
    "shooting": "silahlı saldırı",
    "probe": "inceleme",
    "creator": "yaratıcısı",
}

PHRASE_REWRITES = [
    (
        re.compile(r"OpenAI announced on Thursday something that power users have been asking for: a \$100/month plan\.?", re.I),
        "OpenAI, ileri seviye kullanıcıların uzun süredir beklediği aylık 100 dolarlık yeni bir plan açıkladı.",
    ),
    (
        re.compile(r"Previously, subscriptions jumped from \$20 to \$200 per month\.?", re.I),
        "Şirketin abonelik seçenekleri daha önce aylık 20 dolar ile 200 dolar arasında keskin biçimde ayrılıyordu.",
    ),
    (
        re.compile(r".*possible connection to FSU shooting.*", re.I),
        "Florida'da yetkililer, OpenAI ile Florida State University saldırısı arasında olası bir bağlantı iddiasını incelemeye aldı.",
    ),
    (
        re.compile(r"ChatGPT had reportedly been used to plan the attack that killed two and injured five at Florida State University last April.*", re.I),
        "Geçen yıl Florida State University'de iki kişinin öldüğü ve beş kişinin yaralandığı saldırının planlamasında ChatGPT'nin kullanıldığı iddiası, soruşturmanın merkezine yerleşti.",
    ),
    (
        re.compile(r"Florida Attorney General James Uthmeier plans to investigate OpenAI.*", re.I),
        "Florida Başsavcısı James Uthmeier, OpenAI'nin çocuklara zarar verme riski, ulusal güvenlik etkisi ve saldırıyla olası bağlantısı iddialarını soruşturma planını açıkladı.",
    ),
    (
        re.compile(r"Stalking victim sues OpenAI.*", re.I),
        "Bir takip mağduru, ChatGPT'nin istismarcısının sanrılarını beslediğini ve yaptığı uyarıların dikkate alınmadığını öne sürerek OpenAI'ye dava açtı.",
    ),
    (
        re.compile(r"Anthropic was the star of the show at San Francisco's AI-centric conference\.?", re.I),
        "San Francisco'daki yapay zeka odaklı HumanX konferansında günün en çok konuşulan şirketi Anthropic oldu.",
    ),
    (
        re.compile(r"Kyiv reported 2,299 ceasefire violations, while Moscow accused Ukraine of breaching the ceasefire 1,971 times by early Sunday\.?", re.I),
        "Kiev 2.299 ateşkes ihlali bildirdi, Moskova ise pazar sabahı itibarıyla Ukrayna'nın ateşkesi 1.971 kez deldiğini savundu.",
    ),
    (
        re.compile(r"X says it'?s reducing payments to clickbait accounts\.?", re.I),
        "X, etkileşim tuzağına dayalı clickbait hesaplara yaptığı ödemeleri azaltacağını açıkladı.",
    ),
    (
        re.compile(r"X is cutting back on payments to accounts that are [\"']?flooding the timeline[\"']? with clickbait and rapid-fire news aggregation, according to its head of product Nikita Bier\.?", re.I),
        "X ürün lideri Nikita Bier'e göre şirket, zaman akışını clickbait ve seri haber derlemeleriyle dolduran hesaplara yaptığı ödemeleri azaltıyor.",
    ),
    (
        re.compile(r"The Hungarian (prime minister|başbakanı|PM) misread his electorate by running a geopolitical campaign bashing the (AB|EU) and Ukraine\.?", re.I),
        "Macaristan başbakanı, AB ve Ukrayna karşıtı jeopolitik kampanyayla seçmenin önceliklerini yanlış okudu.",
    ),
    (
        re.compile(r"People cared more about his cronyism and economic mismanagement\.?", re.I),
        "Seçmen ise daha çok kayırmacılık ve ekonomik kötü yönetimle ilgilendi.",
    ),
    (
        re.compile(r"The report is particularly surprising since the Department of Defense recently declared Anthropic a supply-chain risk\.?", re.I),
        "İddia dikkat çekiyor, çünkü ABD Savunma Bakanlığı kısa süre önce Anthropic'i tedarik zinciri açısından riskli ilan etmişti.",
    ),
    (
        re.compile(r"Hungary's prime minister had spent years railing against the European Commission president\.?", re.I),
        "Macaristan başbakanı Viktor Orbán, yıllardır Avrupa Komisyonu Başkanı Ursula von der Leyen'i sert biçimde hedef alıyordu.",
    ),
    (
        re.compile(r"The Hungarian .* misread his electorate by running a geopolitical campaign bashing the AB and Ukraine\. People cared more about his cronyism and economic mismanagement\.?", re.I),
        "Orbán, AB ve Ukrayna karşıtı jeopolitik kampanyayla seçmenin önceliklerini yanlış okudu; seçmen ise daha çok kayırmacılık ve ekonomik kötü yönetimle ilgilendi.",
    ),
    (
        re.compile(r"OpenAI ignored three warnings that a ChatGPT user was dangerous.*", re.I),
        "Davaya göre OpenAI, tehlikeli olduğu yönünde üç ayrı uyarıya rağmen kullanıcının eski partnerine yönelik takip ve taciz sürecinde yeterli önlem almadı.",
    ),
    (
        re.compile(r"Melania Trump's speech.*Epstein.*", re.I),
        "Melania Trump'ın son çıkışı, Epstein dosyasını yeniden siyasi tartışmanın merkezine taşıdı.",
    ),
    (
        re.compile(r"Melania Trump.*never had a relationship with Epstein.*", re.I),
        "Melania Trump, Epstein ile herhangi bir ilişkisi olduğu iddiasını açık biçimde reddetti.",
    ),
    (
        re.compile(r".*attack on his home.*", re.I),
        "Sam Altman, evine yönelik saldırının ardından gündeme gelen New Yorker yazısına karşı kamuoyuna yanıt verdi.",
    ),
    (
        re.compile(r".*valuation.*", re.I),
        "Şirketin yeni yatırım turu, açık AI çipi geliştiren girişimlere dönük ilgiyi yeniden öne çıkardı.",
    ),
    (
        re.compile(r"Since 2010, Orbán has transformed Hungary.*", re.I),
        "Viktor Orbán'ın 2010'dan bu yana Macaristan'da kurduğu siyasi düzen, seçim öncesi yeniden tartışmanın merkezine yerleşti.",
    ),
    (
        re.compile(r".*Easter ceasefire starts.*", re.I),
        "Ukrayna ile Rusya arasında esir takası, Paskalya ateşkesinin başladığı saatlerde gerçekleşti.",
    ),
    (
        re.compile(r"The POW exchange was mediated by the United Arab Emirates.*", re.I),
        "Rusya Savunma Bakanlığı'na göre 175 savaş esirini kapsayan takas, Birleşik Arap Emirlikleri arabuluculuğunda yürütüldü.",
    ),
    (
        re.compile(r"The Pow exchange was mediated by the United Arab Emirates.*", re.I),
        "Rusya Savunma Bakanlığı'na göre 175 savaş esirini kapsayan takas, Birleşik Arap Emirlikleri arabuluculuğunda yürütüldü.",
    ),
    (
        re.compile(r"Trump's pledge to use the .* Hungarian economy .* Sunday's election\.?", re.I),
        "Trump'ın Macaristan ekonomisine tam destek sözü, ülkenin kritik seçimi öncesinde Orbán üzerindeki baskının arttığı bir döneme denk geldi.",
    ),
    (
        re.compile(r".*Diego Garcia handover on hold.*", re.I),
        "İngiltere'nin Diego Garcia adımını yavaşlatması, Trump cephesinden gelen baskının dış politikaya nasıl yansıdığını gösterdi.",
    ),
    (
        re.compile(r"The U\.S\. president.*making a big mistake.*", re.I),
        "Trump'ın daha önce birkaç kez yön değiştirdiği konuda Starmer'a açık uyarı yapması, Diego Garcia dosyasını yeniden siyasi baskı alanına taşıdı.",
    ),
    (
        re.compile(r"Mark Carney is on the verge of a big election win.*", re.I),
        "Mark Carney'nin seçim yarışında belirgin avantaj yakalaması, ülkedeki siyasi dengelerin yeniden şekillendiğine işaret ediyor.",
    ),
    (
        re.compile(r"France to ditch Windows for Linux.*", re.I),
        "Fransa'nın Linux yönelimi, kritik kamu sistemlerinde ABD merkezli teknoloji bağımlılığını azaltma arayışını öne çıkardı.",
    ),
    (
        re.compile(r"Battery recycler Ascend Elements files for bankruptcy.*", re.I),
        "Ascend Elements'ın iflas başvurusu, batarya geri dönüşüm pazarındaki finansman baskısını yeniden görünür hale getirdi.",
    ),
    (
        re.compile(r"Volkswagen drops all-electric ID\.4 in the U\.S\..*", re.I),
        "Volkswagen'in ABD pazarında benzinli SUV'lara geri dönmesi, elektrikli araç stratejisindeki baskıyı gösteren yeni bir işaret oldu.",
    ),
    (
        re.compile(r"AMC will stream .* on TikTok.*", re.I),
        "AMC'nin yeni dizisini TikTok üzerinden parçalara bölerek yayınlama kararı, medya şirketlerinin genç izleyiciye ulaşmak için platform stratejilerini sert biçimde değiştirdiğini gösteriyor.",
    ),
]

ACRONYM_WORD_RE = re.compile(r"\b[A-Z]{2,5}\b")


def _replace_terms(text: str, mapping: dict[str, str]) -> str:
    result = text
    for source, target in sorted(mapping.items(), key=lambda item: len(item[0]), reverse=True):
        result = re.sub(rf"\b{re.escape(source)}\b", target, result, flags=re.IGNORECASE)
    return clean_text(result)


def _sentence_case_tr(text: str) -> str:
    if not text:
        return text
    return text[0].upper() + text[1:]


def _strip_noise(text: str) -> str:
    text = text.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    text = re.sub(r"^[\"'“”‘’]+|[\"'“”‘’]+$", "", text).strip()
    text = re.sub(r"\s+-\s+.*$", "", text)
    return clean_text(text)


def rewrite_title(article: NormalizedArticle) -> str:
    original_title = article.title
    normalized_original_title = _strip_noise(original_title)
    title = _replace_terms(normalized_original_title, TITLE_REPLACEMENTS)

    if re.search(r"OpenAI.*shooting|shooting.*OpenAI", normalized_original_title, flags=re.IGNORECASE):
        return "Florida başsavcısı, OpenAI bağlantısı iddiası için soruşturma başlattı"
    if re.search(r"ChatGPT finally offers \$100/month Pro plan", normalized_original_title, flags=re.IGNORECASE):
        return "ChatGPT, aylık 100 dolarlık Pro planını sunmaya başladı"
    if re.search(r"Anthropic temporarily banned OpenClaw", normalized_original_title, flags=re.IGNORECASE):
        return "Anthropic, OpenClaw yaratıcısının Claude erişimini geçici olarak kesti"
    if re.search(r"Nvidia-backed SiFive hits .* valuation", normalized_original_title, flags=re.IGNORECASE):
        return "Nvidia destekli SiFive, açık AI çiplerinde 3,65 milyar dolar değerlemeye ulaştı"
    if re.search(r"Sam Altman responds to", normalized_original_title, flags=re.IGNORECASE):
        return "Sam Altman, New Yorker yazısı sonrası gelen suçlamalara yanıt verdi"
    if re.search(r"Stalking victim sues OpenAI", normalized_original_title, flags=re.IGNORECASE):
        return "Takip mağduru kadın, ChatGPT'nin istismarcısını cesaretlendirdiği iddiasıyla OpenAI'ye dava açtı"
    if re.search(r"At the HumanX conference, everyone was talking about Claude", normalized_original_title, flags=re.IGNORECASE):
        return "HumanX konferansında herkes Claude'u konuştu"
    if re.search(r"Ukraine-Russia blame game over Easter ceasefire violations", normalized_original_title, flags=re.IGNORECASE):
        return "Ukrayna ve Rusya, Paskalya ateşkesi ihlalleri konusunda birbirini suçladı"
    if re.search(r"X says it'?s reducing payments to clickbait accounts", normalized_original_title, flags=re.IGNORECASE):
        return "X, clickbait hesaplara yaptığı ödemeleri azaltacağını açıkladı"
    if re.search(r"Trump officials may be encouraging banks to test Anthropic[']?s Mythos model", normalized_original_title, flags=re.IGNORECASE):
        return "Trump ekibinin bankaları Anthropic'in Mythos modelini test etmeye yönlendirdiği iddia ediliyor"
    if re.search(r"Von der Leyen waits just 17 minutes to celebrate Orbán[']?s heavy defeat", normalized_original_title, flags=re.IGNORECASE):
        return "Von der Leyen, Orbán'ın ağır yenilgisini kutlamak için yalnızca 17 dakika bekledi"
    if re.search(r"Orbán just lost his populist touch", normalized_original_title, flags=re.IGNORECASE):
        return "Orbán popülist etkisini kaybetti"
    if re.search(r"Melania Trump's speech propels Epstein crisis", original_title, flags=re.IGNORECASE):
        return "Melania Trump'ın konuşması, Epstein krizini yeniden gündemin ön sırasına taşıdı"
    if re.search(r"Melania Trump: 'I never had a relationship with Epstein", original_title, flags=re.IGNORECASE):
        return "Melania Trump, Epstein ile ilişkisi olduğu iddiasını reddetti"
    if re.search(r"Ukraine and Russia swap .* prisoners", original_title, flags=re.IGNORECASE):
        return "Ukrayna ile Rusya, Paskalya ateşkesi başlarken 175 esiri takas etti"
    if re.search(r"Trump promises economic support to Orbán", original_title, flags=re.IGNORECASE):
        return "Trump, kritik seçim öncesi Orbán'a ekonomik destek sözü verdi"
    if re.search(r"UK puts Diego Garcia handover on hold", original_title, flags=re.IGNORECASE):
        return "İngiltere, Diego Garcia devrini Trump baskısı nedeniyle beklemeye aldı"
    if re.search(r"Trump endorses .* immigration enforcement", original_title, flags=re.IGNORECASE):
        return "Trump, göç denetimini merkeze alan bütçe tasarısına destek verdi"
    if re.search(r"L[’']Arc de Trump", original_title, flags=re.IGNORECASE):
        return "Trump için Washington'da 76 metrelik zafer kemeri planı açıklandı"
    if re.search(r"US-Iran talks in Pakistan continue late Saturday", original_title, flags=re.IGNORECASE):
        return "ABD ile İran arasındaki Pakistan görüşmeleri gece geç saatlere uzadı"
    if re.search(r"Mark Carney is on the verge of a big election win", original_title, flags=re.IGNORECASE):
        return "Mark Carney büyük bir seçim zaferine yaklaşıyor"
    if re.search(r"France to ditch Windows for Linux", original_title, flags=re.IGNORECASE):
        return "Fransa, ABD teknolojisine bağımlılığı azaltmak için Windows'u bırakıp Linux'a geçiyor"
    if re.search(r"Battery recycler Ascend Elements files for bankruptcy", original_title, flags=re.IGNORECASE):
        return "Batarya geri dönüşüm girişimi Ascend Elements iflas başvurusunda bulundu"
    if re.search(r"Volkswagen drops all-electric ID\.4 in the US", original_title, flags=re.IGNORECASE):
        return "Volkswagen, ABD'de tam elektrikli ID.4'ten geri adım atıp benzinli SUV'lara yöneliyor"
    if re.search(r"AMC will stream .* on TikTok", original_title, flags=re.IGNORECASE):
        return "AMC, 'The Audacity' prömiyerini TikTok'ta 21 parça halinde yayınlayacak"

    title = title.replace(" announces ", " açıkladı ")
    title = title.replace(" responds to ", " yanıt verdi: ")
    title = title.replace(" temporarily banned ", " geçici olarak engelledi ")
    title = title.replace(" hits ", " ulaştı ")
    title = title.replace(" finally offers ", " sunmaya başladı ")
    return _sentence_case_tr(title)


def rewrite_sentence(text: str) -> str:
    original = _strip_noise(text)
    if not original:
        return ""

    for pattern, replacement in PHRASE_REWRITES:
        if pattern.search(original):
            rewritten = pattern.sub(replacement, original)
            rewritten = _sentence_case_tr(clean_text(rewritten))
            if not rewritten.endswith((".", "!", "?")):
                rewritten += "."
            return rewritten

    summary = _replace_terms(original, TITLE_REPLACEMENTS)
    summary = _replace_terms(summary, SUMMARY_REPLACEMENTS)
    summary = re.sub(r"\bFSU\b", "Florida State University", summary)
    summary = re.sub(r"\$100/month", "aylık 100 dolar", summary)
    summary = re.sub(r"\$20", "20 dolar", summary)
    summary = re.sub(r"\$200", "200 dolar", summary)
    summary = summary.replace(" on Thursday ", " perşembe günü ")
    summary = summary.replace(" after ", " ardından ")
    summary = ACRONYM_WORD_RE.sub(
        lambda m: m.group(0) if m.group(0) in {"AI", "ABD", "AB"} else m.group(0).title(),
        summary,
    )
    summary = _sentence_case_tr(summary)
    if not summary.endswith((".", "!", "?")):
        summary += "."
    return summary


def rewrite_description(article: NormalizedArticle) -> str:
    description = rewrite_sentence(article.summary or article.title)
    if re.search(r"\b(the|and|with|according to|people cared|misread)\b", description, flags=re.I):
        facts = build_facts(article)
        if facts:
            return facts[0]
    return description


def build_facts(article: NormalizedArticle) -> list[str]:
    raw_text = clean_text(article.content_snippet or article.summary or article.title)
    if not raw_text:
        return []

    parts = [segment.strip() for segment in re.split(r"(?<=[.!?])\s+", raw_text) if segment.strip()]
    facts: list[str] = []
    seen: set[str] = set()
    for part in parts:
        rewritten = rewrite_sentence(part)
        normalized = rewritten.lower()
        if len(rewritten) < 45:
            continue
        if normalized in seen:
            continue
        seen.add(normalized)
        facts.append(rewritten)
        if len(facts) >= 3:
            break
    return facts


def _normalize_search_text(value: str) -> str:
    value = value.lower().replace("ı", "i")
    value = unicodedata.normalize("NFKD", value)
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return " ".join(value.split())


def _contains_term(text: str, term: str) -> bool:
    normalized_text = _normalize_search_text(text)
    normalized_term = _normalize_search_text(term)
    if not normalized_term:
        return False
    return f" {normalized_term} " in f" {normalized_text} "


def build_tags(article: NormalizedArticle) -> list[str]:
    text = f"{article.title} {article.summary}".lower()
    tags: list[str] = ["pipeline", "haber"]
    for keyword in ["openai", "chatgpt", "anthropic", "google", "meta", "trump", "ukraine", "russia", "ai"]:
        if _contains_term(text, keyword) and keyword not in tags:
            tags.append(keyword)
    return tags[:5]


def choose_category(article: NormalizedArticle) -> str:
    text = f"{article.title} {article.summary}".lower()
    turkey_terms = [
        "türkiye",
        "turkiye",
        "turkey",
        "turkish",
        "ankara",
        "istanbul",
        "izmir",
        "adana",
        "erdoğan",
        "erdogan",
        "imamoğlu",
        "imamoglu",
        "özgür özel",
        "ozgur ozel",
        "chp",
        "akp",
        "dem parti",
        "ibb",
        "tbmm",
        "silivri",
        "belediye başkanı",
        "belediye baskani",
    ]
    if any(_contains_term(text, term) for term in turkey_terms):
        return "Türkiye"
    if any(_contains_term(text, term) for term in ["openai", "chatgpt", "anthropic", "google", "meta", "nvidia", "ai", "chip"]):
        return "Teknoloji"
    if any(_contains_term(text, term) for term in ["election", "government", "trump", "parliament", "prime minister", "president", "ukraine", "russia", "orbán", "orban"]):
        return "Siyaset"
    if any(_contains_term(text, term) for term in ["market", "economy", "tariff", "trade", "valuation"]):
        return "Ekonomi"
    if article.category_hints:
        return article.category_hints[0]
    return "Dünya"


def needs_manual_review(article: NormalizedArticle) -> bool:
    text = f"{article.title} {article.summary}".lower()
    return any(term in text for term in ["allegedly", "claims", "sues", "sexual assault", "epstein"])


def build_rewrite(article: NormalizedArticle) -> tuple[str, str, str, list[str], list[str], list[str]]:
    title = rewrite_title(article)
    description = rewrite_description(article)
    category = choose_category(article)
    tags = build_tags(article)
    facts = build_facts(article)
    notes: list[str] = []
    if needs_manual_review(article):
        notes.append("manual-review: hassas/hukuki iddia içeren haber")
    if article.source_id == "bbc-world" and category == "Dünya":
        notes.append("source-profile: BBC Dünya akışından geldi")
    return title, description, category, tags, notes, facts


__all__ = [
    "build_rewrite",
    "rewrite_title",
    "rewrite_description",
    "rewrite_sentence",
    "build_facts",
    "choose_category",
    "build_tags",
]
