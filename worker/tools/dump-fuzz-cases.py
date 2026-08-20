"""rapidfuzz'ın gerçek çıktısını referans olarak diske basar.

Girdi uydurulmuyor: korpustaki 585 gerçek başlık ve bunların kaynak
başlıklarıyla eşleşmeleri kullanılıyor. Kapıların fiilen gördüğü dağılım budur.
"""
import json, random, sys
from pathlib import Path
from rapidfuzz.fuzz import token_set_ratio, ratio

root = Path(__file__).resolve().parents[2]
rows = [json.loads(line) for line in (root / "newsroom/tests/corpus/published.jsonl").open()]
cands = [json.loads(line) for line in (root / "newsroom/tests/corpus/candidates.jsonl").open()]

titles = [r["title"] for r in rows]
cand_titles = [c.get("title", "") for c in cands if c.get("title")]

rng = random.Random(20260801)
pairs = []

# 1. Yayımlanmış başlıklar birbirine karşı — tekrar yayın kapısının sorduğu soru.
for _ in range(4000):
    pairs.append((rng.choice(titles).lower(), rng.choice(titles).lower()))

# 2. Yayımlanmış başlık ile aday kaynak başlığı — çevrilmemişlik kapısı.
for _ in range(4000):
    pairs.append((rng.choice(titles).lower(), rng.choice(cand_titles).lower()))

# 3. Aynı başlık kendisiyle, ve alt küme durumları — kısayolun sınırları.
for t in titles[:200]:
    pairs.append((t.lower(), t.lower()))
    words = t.lower().split()
    if len(words) > 3:
        pairs.append((" ".join(words[:3]), t.lower()))
        pairs.append((t.lower(), " ".join(words[2:])))

# 4. Kenar durumlar: boş, tek sözcük, tekrar eden sözcük, Türkçe karakter.
pairs += [
    ("", ""), ("", "abc"), ("abc", ""),
    ("a", "a"), ("a", "b"),
    ("aynı aynı aynı", "aynı"),
    ("çğıöşü", "çğıöşü"), ("İstanbul", "istanbul"),
    ("  bosluk   test  ", "bosluk test"),
]

out = [{"a": a, "b": b, "tsr": token_set_ratio(a, b), "ratio": ratio(a, b)} for a, b in pairs]
Path(sys.argv[1]).write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
print(f"{len(out)} vaka yazıldı")
