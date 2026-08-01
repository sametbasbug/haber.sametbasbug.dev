"""Markdown üretimi ve yazımı.

Kabul sözleşmesini geçmiş bir seçimi, Astro içerik koleksiyonunun beklediği
dosyaya dönüştürür. Frontmatter alanları ve sıralaması `src/content.config.ts`
şemasıyla ve mevcut 585 yayının biçimiyle hizalıdır.

Bu katman editoryal karar vermez ve metni değiştirmez. Asteria'nın yazdığı gövde
neyse o yazılır; burada yalnız çerçeve kurulur.
"""

from __future__ import annotations

from datetime import datetime
import json
from pathlib import Path
import re
from zoneinfo import ZoneInfo

DEFAULT_CONTENT_DIR = (
    Path(__file__).resolve().parents[2] / "src" / "content" / "equinoxHaber"
)

# Yayın saati Türkiye saatiyle yazılır; mevcut arşivin tamamı bu biçimde.
PUBLISH_TZ = ZoneInfo("Europe/Istanbul")

AUTHOR = "Asteria AI"
HERO_DIR = "/images/generated/equinox-haber"

# Türkçe harfler ASCII karşılıklarına eşlenir. `str.lower()` "İ" için birleşik
# noktalı bir karakter ürettiğinden dönüşüm küçültmeden ÖNCE yapılır.
_TURKISH_MAP = str.maketrans(
    {
        "ç": "c", "Ç": "c",
        "ğ": "g", "Ğ": "g",
        "ı": "i", "I": "i", "İ": "i",
        "ö": "o", "Ö": "o",
        "ş": "s", "Ş": "s",
        "ü": "u", "Ü": "u",
        "â": "a", "î": "i", "û": "u",
        "’": "", "'": "", "”": "", "“": "",
    }
)

_NON_SLUG_RE = re.compile(r"[^a-z0-9]+")
# Arşivdeki en uzun slug 137 karakter; üretilen slug'ların medyanı 70, p90'ı 85.
# 110 sınırı, cümleyi ortasından kesmeyi %3'ten neredeyse sıfıra indirirken
# adresleri sınırsız uzamaktan korur.
MAX_SLUG_LENGTH = 110


def slugify(title: str) -> str:
    """Türkçe başlıktan dosya adı üretir.

    Slug her zaman Türkçe başlıktan türetilir. Eski sistemde slug kimi zaman
    kaynağın İngilizce manşetinden türemiş ve canlıya yarı İngilizce adresler
    çıkmıştı (`...-basbakani-will-stay-on-...`).
    """
    ascii_title = title.translate(_TURKISH_MAP).lower()
    slug = _NON_SLUG_RE.sub("-", ascii_title).strip("-")
    if len(slug) > MAX_SLUG_LENGTH:
        slug = slug[:MAX_SLUG_LENGTH].rsplit("-", 1)[0]
    return slug


def _scalar(value: str) -> str:
    """YAML için güvenli çift tırnaklı dize."""
    return json.dumps(value, ensure_ascii=False)


def render(
    selection: dict,
    *,
    sources: list[dict],
    hero_image: str | None = None,
    hero_describes_selection: bool = True,
    now: datetime | None = None,
    slug: str | None = None,
) -> str:
    """Yayına girecek markdown dosyasının tam içeriğini üretir."""
    moment = (now or datetime.now(PUBLISH_TZ)).astimezone(PUBLISH_TZ)
    stamp = moment.isoformat(timespec="seconds")
    target_slug = slug or slugify(selection["title"])

    lines = [
        "---",
        f"title: {_scalar(selection['title'])}",
        f"description: {_scalar(selection['description'])}",
        f"pubDate: '{stamp}'",
        f"updatedDate: '{stamp}'",
    ]

    if hero_image:
        lines.append(f"heroImage: {_scalar(hero_image)}")

    # `heroAlt` yalnız ekrandaki görseli gerçekten anlatıyorsa yazılır.
    # Asteria alt metnini ürettirmek istediği görsel için yazar; stok yedeğine
    # düşüldüğünde o metin olmayan bir şeyi tarif eder. Yanlış alt metin,
    # eksik alt metinden kötüdür: ekran okuyucu kullanan biri için sessiz bir
    # yalandır. Alan yazılmazsa şablonlar başlığa düşer (bkz. DECISIONS A1).
    if hero_describes_selection:
        lines.append(f"heroAlt: {_scalar(selection['heroAlt'])}")

    lines += [
        "isDraft: false",
        f"tags: {json.dumps(selection['tags'], ensure_ascii=False)}",
        f"author: {_scalar(AUTHOR)}",
        f"category: {_scalar(selection['category'])}",
        "breaking: false",
        "sources:",
    ]
    for source in sources:
        lines.append(f"  - name: {_scalar(source['name'])}")
        lines.append(f"    url: {_scalar(source['url'])}")
    # Frontmatter'ı gövdeden ayıran boş satır dahil; arşivdeki 585 yayının
    # biçimi birebir korunur ki diff'ler yalnız gerçek içerik değişimini göstersin.
    lines += ["autoGlossaryLinks: true", "---", "", ""]

    body = selection["body"].strip()
    primary, *supporting = sources

    parts = [
        body,
        "",
        "## Kaynaklar",
        "",
        f"- Ana kaynak: [{primary['name']}]({primary['url']})",
    ]
    if supporting:
        parts += ["", "## Ek kaynaklar", ""]
        parts += [f"- [{source['name']}]({source['url']})" for source in supporting]

    parts.append("")
    return "\n".join(lines) + "\n".join(parts) + "\n"


def hero_path_for(slug: str) -> str:
    return f"{HERO_DIR}/{slug}.webp"


def write(
    markdown: str, slug: str, *, content_dir: Path | None = None, overwrite: bool = False
) -> Path:
    """Markdown'ı içerik koleksiyonuna yazar.

    Var olan bir dosyanın üzerine yazmaz. Aynı slug ikinci kez üretilmişse bu
    bir tekrar yayındır ve sessizce ezilmemelidir.
    """
    directory = content_dir or DEFAULT_CONTENT_DIR
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / f"{slug}.md"

    if target.exists() and not overwrite:
        raise FileExistsError(f"bu slug zaten yayında: {target.name}")

    target.write_text(markdown, encoding="utf-8")
    return target
