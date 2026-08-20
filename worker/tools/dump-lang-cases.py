"""Dil kapısının korpustaki gerçek ölçümlerini referans olarak basar."""
import json, sys
from pathlib import Path
from newsroom.lang import measure, body_is_turkish, looks_untranslated

root = Path(__file__).resolve().parents[2]
rows = [json.loads(l) for l in (root / "newsroom/tests/corpus/published.jsonl").open()]
cands = [json.loads(l) for l in (root / "newsroom/tests/corpus/candidates.jsonl").open()]

out = []
# 585 gerçek gövde: ölçümün asıl gördüğü metinler.
for r in rows:
    m = measure(r["body"])
    ok, reason = body_is_turkish(r["body"])
    out.append({"kind": "body", "text": r["body"],
                "wordCount": m.word_count, "englishDensity": m.english_density,
                "turkishEvidence": m.turkish_evidence, "ok": ok, "reason": reason})

# Başlık/description ile kaynak başlığı: çevrilmemişlik kapısı.
for r, c in zip(rows, cands):
    src = c.get("title", "")
    for field in ("title", "description"):
        un, detail = looks_untranslated(r[field], src)
        out.append({"kind": "untranslated", "text": r[field], "source": src,
                    "untranslated": un, "detail": detail})

# İngilizce metinler kapının reddetmesi gereken taraf.
for c in cands[:150]:
    body = c.get("article_text") or c.get("summary") or c.get("title") or ""
    if len(body) < 50:
        continue
    m = measure(body)
    ok, reason = body_is_turkish(body)
    out.append({"kind": "body", "text": body,
                "wordCount": m.word_count, "englishDensity": m.english_density,
                "turkishEvidence": m.turkish_evidence, "ok": ok, "reason": reason})

# Kenar durumlar: özel ad öbekleri, Türkçe karakter, boş.
for text in ["", "   ", "abc",
             "Institute for the Study of War raporuna göre cephe hattı değişmedi.",
             "Center for Strategic and International Studies ve The Guardian aktardı.",
             "Ürünün fiyatı arttı ve İstanbul'da satışlar düştü.",
             "Şirketin açıkladığı rakamlar geçen yılın aynı dönemine göre yükseldi."]:
    m = measure(text)
    ok, reason = body_is_turkish(text)
    out.append({"kind": "body", "text": text,
                "wordCount": m.word_count, "englishDensity": m.english_density,
                "turkishEvidence": m.turkish_evidence, "ok": ok, "reason": reason})

Path(sys.argv[1]).write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
print(f"{len(out)} vaka yazıldı")
