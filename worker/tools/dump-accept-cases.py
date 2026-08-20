"""Kabul kapısının gerçek ve bozulmuş girdilerdeki kararlarını basar.

Yalnız geçen vakalar yazılmıyor: her kapı en az bir kez bilerek düşürülüyor.
Bir çeviri "hep kabul et" diyerek de bütün olumlu vakaları geçebilir.
"""
import json, sys, copy
from pathlib import Path
from dataclasses import asdict
from newsroom.accept import validate

root = Path(__file__).resolve().parents[2]
rows = [json.loads(l) for l in (root / "newsroom/tests/corpus/published.jsonl").open()]
cands = [json.loads(l) for l in (root / "newsroom/tests/corpus/candidates.jsonl").open()]

def selection_of(row, cid="c1"):
    return {
        "candidateId": cid, "title": row["title"], "description": row["description"],
        "category": row["category"], "body": row["body"], "tags": row["tags"],
        "heroPrompt": "görsel yönergesi", "heroAlt": row.get("hero_alt") or "alt metin",
        "heroQuery": "abstract stock terms",
    }

def brief_of(source_title, cid="c1", select_count=1):
    return {"task": {"selectCount": select_count},
            "board": [{"id": cid, "title": source_title, "url": "https://example.com/a"}]}

cases = []
def add(label, payload, brief):
    r = validate(payload, brief)
    cases.append({"label": label, "payload": payload, "brief": brief,
                  "accepted": len(r.accepted), "declinedReason": r.declined_reason,
                  "errors": [asdict(e) for e in r.errors]})

# 1. Gerçek yayınlar — kapıdan geçmesi gerekenler.
for i, row in enumerate(rows):
    src = cands[i].get("title", "") if i < len(cands) else ""
    add(f"gercek-{i}", {"selections": [selection_of(row)]}, brief_of(src))

base = rows[0]
src0 = cands[0].get("title", "")

# 2. Her kapıyı tek tek düşür.
def mutate(label, fn):
    sel = selection_of(base)
    fn(sel)
    add(label, {"selections": [sel]}, brief_of(src0))

mutate("eksik-baslik",      lambda s: s.update(title=""))
mutate("eksik-etiket",      lambda s: s.update(tags=[]))
mutate("eksik-heroQuery",   lambda s: s.pop("heroQuery"))
mutate("kotu-kategori",     lambda s: s.update(category="Magazin"))
mutate("kisa-govde",        lambda s: s.update(body="Kısa bir gövde.\n\nİki.\n\nÜç."))
mutate("tek-paragraf",      lambda s: s.update(body=base["body"].replace("\n\n", " ")))
mutate("madde-isareti",     lambda s: s.update(body=base["body"] + "\n\n- birinci madde\n- ikinci madde"))
mutate("ingilizce-govde",   lambda s: s.update(body=(
    "The company said that it would be expanding into new markets after the "
    "report was published by the institute. This is the second time that the "
    "firm has been forced to change its plans, and analysts say the move will "
    "have a lasting effect on how these products are sold in the region. "
    "The chief executive said the decision was not taken lightly and that more "
    "details about the transition would be shared with investors before the end "
    "of the quarter, when the new structure is expected to be in place.")))
mutate("kisa-description",  lambda s: s.update(description="Çok kısa."))
mutate("description-baslik", lambda s: s.update(description=base["title"]))
mutate("az-etiket",         lambda s: s.update(tags=["tek"]))
mutate("cok-etiket",        lambda s: s.update(tags=[f"e{i}" for i in range(7)]))
mutate("ic-not-sizinti",    lambda s: s.update(body=base["body"] + "\n\nEditoryal not: bu kısım silinecek."))
mutate("ic-not-heroAlt",    lambda s: s.update(heroAlt="manual-review bekliyor"))

# Çevrilmemiş başlık: kaynak başlığı aynen kullanılmış.
sel = selection_of(base); sel["title"] = src0 or "Untranslated Source Headline Here"
add("cevrilmemis-baslik", {"selections": [sel]}, brief_of(sel["title"]))

# 3. Payload seviyesi.
add("panoda-olmayan-aday", {"selections": [selection_of(base, "yok")]}, brief_of(src0))
add("secim-yok",          {"selections": [], "note": "yayımlanabilir aday yok"}, brief_of(src0))
add("secim-yok-notsuz",   {"selections": []}, brief_of(src0))
add("selections-eksik",   {"note": "hiç alan yok"}, brief_of(src0))
add("selections-liste-degil", {"selections": {"a": 1}}, brief_of(src0))
add("payload-nesne-degil", ["liste"], brief_of(src0))
add("secim-nesne-degil",  {"selections": ["dizgi"]}, brief_of(src0))
add("fazla-secim",        {"selections": [selection_of(base), selection_of(rows[1])]}, brief_of(src0))
add("ayni-aday-iki-kez",  {"selections": [selection_of(base), selection_of(rows[1])]},
                          brief_of(src0, select_count=2))

Path(sys.argv[1]).write_text(json.dumps(cases, ensure_ascii=False), encoding="utf-8")
print(f"{len(cases)} vaka · hata üreten: {sum(1 for c in cases if c['errors'])}")
