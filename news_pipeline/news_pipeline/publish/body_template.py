from __future__ import annotations

from news_pipeline.models.queue import QueueItem


PLACEHOLDER_BODY_MARKERS = {
    "Bu taslak, hızlı yayın hazırlığı için oluşturuldu.",
    "Son yayına alınmadan önce başlık tonu, bağlam ve gerekiyorsa ikinci kaynak kontrolü yapılmalıdır.",
    "Mevcut metin, yayın öncesi hazırlık katmanıdır; nihai sürüm değildir.",
}


def _clean_facts(item: QueueItem) -> list[str]:
    facts = [fact.strip() for fact in item.draft_facts if fact and fact.strip()]
    if not facts:
        return ["İlk çerçeve ve temel ayrıntılar mevcut kaynaklardan derlendi."]
    return facts[:6]


def _topic_context(item: QueueItem) -> str:
    text = f"{item.draft_title} {item.draft_description} {' '.join(item.draft_facts)}".lower()
    if any(term in text for term in ["openai", "anthropic", "google", "adobe", "chrome", "yapay zeka", "llm", "model", "veri merkezi"]):
        return (
            "Gelişme, yapay zeka ve yazılım pazarında ürün, dağıtım ya da altyapı tercihlerinin nereye kaydığını göstermesi bakımından izleniyor."
        )
    if any(term in text for term in ["seçim", "trump", "iran", "ukrayna", "rusya", "britain", "hükümet", "ab", "europe", "avrupa"]):
        return (
            "Dosyanın bundan sonraki yönü, taraflardan gelecek resmi açıklamalarla ve sahadaki siyasi takvimin nasıl şekilleneceğiyle netleşecek."
        )
    if any(term in text for term in ["yatırım", "değerleme", "seed", "tohum", "funding", "finans", "tarife", "ticaret", "market", "economy"]):
        return (
            "Şirketler ve yatırımcılar açısından haber, sermayenin hangi alanlarda yoğunlaştığına dair güncel bir işaret sunuyor."
        )
    if any(term in text for term in ["açık", "güvenlik", "hack", "zararlı", "backdoor", "siber", "vulnerability", "patch"]):
        return (
            "Konu, kullanıcılar ve kurumlar için doğrudan güvenlik etkisi doğurabileceğinden yeni güncellemeler ve resmi teknik açıklamalar önem taşıyor."
        )
    return (
        "Başlıktaki gelişmenin etkisi, ilgili kurumların atacağı sonraki adımlarla birlikte daha net görülecek."
    )


def build_body(item: QueueItem) -> str:
    lead = item.draft_description.strip()
    source_name = item.draft_sources[0].name if item.draft_sources else "ilk kaynak"
    source_url = item.draft_sources[0].url if item.draft_sources else "https://example.com"

    facts = _clean_facts(item)

    opening = lead or "Gelişmeye ilişkin ilk çerçeve mevcut kaynaklardan derlendi."

    if facts:
        first_fact = facts[0]
        fact_text = first_fact[0].lower() + first_fact[1:] if len(first_fact) > 1 else first_fact.lower()
        nutgraf = f"{source_name}'ın aktardığı ilk bilgilere göre gelişme, {fact_text}"
    else:
        nutgraf = f"{source_name} kaynaklı ilk çerçeveye göre bu gelişme, ilgili başlıkta somut bir değişime işaret ediyor"
    if not nutgraf.endswith((".", "!", "?")):
        nutgraf += "."

    detail_facts = facts[1:5]
    detail_paragraphs: list[str] = []
    if detail_facts:
        chunk_size = 2
        for index in range(0, len(detail_facts), chunk_size):
            chunk = detail_facts[index:index + chunk_size]
            sentences = []
            for fact in chunk:
                sentence = fact if fact.endswith((".", "!", "?")) else f"{fact}."
                sentences.append(sentence)
            detail_paragraphs.append(" ".join(sentences))
    else:
        detail_paragraphs.append(
            "Mevcut bilgiler haberin temel çerçevesini kuruyor; yeni resmi açıklamalar geldikçe ayrıntılar netleşebilir."
        )

    context_paragraph = _topic_context(item)
    if not context_paragraph.endswith((".", "!", "?")):
        context_paragraph += "."

    review_note = ""
    public_notes = [
        note for note in item.notes[:3] if not note.startswith("autopublish-withdrawn:") and not note.startswith("manual-publish:")
    ]
    if public_notes:
        review_note = "\n## Editoryal not\n\n- " + "\n- ".join(public_notes) + "\n"

    supporting_sources_block = ""
    if item.supporting_sources:
        supporting_lines = "\n".join([f"- [{source.name}]({source.url})" for source in item.supporting_sources[:5]])
        supporting_sources_block = f"\n## Ek kaynaklar\n\n{supporting_lines}\n"

    body_parts = [opening, "", nutgraf]
    for paragraph in detail_paragraphs:
        body_parts.extend(["", paragraph])
    body_parts.extend(["", context_paragraph])

    body = "\n".join(body_parts)

    return f"""{body}
{review_note}## Kaynaklar

- Ana kaynak: [{source_name}]({source_url})
{supporting_sources_block}"""
