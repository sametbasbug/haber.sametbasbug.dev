"""Python slugify'ın 587 gerçek başlıktaki çıktısını referans olarak basar."""
import json, sys
from pathlib import Path
from newsroom.publish import slugify

root = Path(__file__).resolve().parents[2]
content = root / "src/content/equinoxHaber"

cases = []
for md in sorted(content.glob("*.md")):
    text = md.read_text(encoding="utf-8")
    # Frontmatter'daki başlık satırı; YAML ayrıştırıcısına gerek yok.
    for line in text.split("\n"):
        if line.startswith("title:"):
            title = line[6:].strip()
            if title[:1] in "\"'" and title[-1:] == title[:1]:
                title = title[1:-1]
            cases.append({"title": title, "slug": slugify(title), "filename": md.stem})
            break

# Kenar durumlar: kesme işareti, uzun başlık, sadece Türkçe karakter, boş.
for t in ["2026’nın ilk yarısı", "İzmir'de İŞÇİ ÇIKIŞI", "Ürün “tırnak” içinde",
          "Çok " + "uzun " * 40 + "başlık", "ÇĞIİÖŞÜ", "---", "", "  ",
          "Îmân ve Âlem û Şûra"]:
    cases.append({"title": t, "slug": slugify(t), "filename": None})

Path(sys.argv[1]).write_text(json.dumps(cases, ensure_ascii=False), encoding="utf-8")
matching = sum(1 for c in cases if c["filename"] and c["slug"] == c["filename"])
print(f"{len(cases)} vaka · dosya adıyla uyuşan: {matching}")
