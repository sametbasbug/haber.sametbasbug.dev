"""Canlı yayın yüzeyi.

`src/content/equinoxHaber/` altındaki yayımlanmış haberleri okur. İki işi var:

1. **Tekrar kontrolü** (M3, M4) — aynı URL veya aynı haber yeniden yayımlanmasın.
2. **Çeşitlilik verisi** — son yayınların kaynak, kategori ve etiket dağılımı.

İkincisi Asteria'ya *veri* olarak gider, ceza puanı olarak değil. Eski sistem
bu sinyali `RECENT_SOURCE_PENALTY_PER_ITEM = 0.07` gibi sabitlere çeviriyor,
aynı kuralı bir de doğal dille Asteria'ya söylüyordu; iki mekanizma aynı anda
çalışıp toplam etkisi hiçbir yerde hesaplanmıyordu.

Tasarım notu: eski sistemdeki sabit şirket/ürün eşleme listesi taşınmadı. Konu
yığılması, yayınların kendi etiketlerinden okunur. Etiketleri Asteria yazdığı
için liste bakımı gerekmez ve gündeme yeni bir aktör girdiğinde kod değişikliği
istemez. `tests/test_brief.py` bu modülde marka adı geçmediğini doğrular.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
import re

from rapidfuzz.fuzz import token_set_ratio
import yaml

from newsroom.ingest import canonicalize

DEFAULT_CONTENT_DIR = (
    Path(__file__).resolve().parents[2] / "src" / "content" / "equinoxHaber"
)

# Bir adayın canlıdaki bir haberle aynı sayılması için gereken başlık benzerliği.
# Eski sistemin fuzzy duplicate eşiğiyle aynı hizada tutuldu.
DUPLICATE_TITLE_SIMILARITY = 82

# Çeşitlilik verisinin kapsamı. "Son ne kadarına bakılacağı" mekanik bir
# penceredir; o pencereden ne sonuç çıkarılacağı POLICY.md §2'dedir.
RECENT_WINDOW = 20

_FRONTMATTER_RE = re.compile(r"\A---\n(.*?)\n---\n", re.DOTALL)


@dataclass(frozen=True, slots=True)
class LivePost:
    slug: str
    title: str
    description: str
    category: str | None
    tags: tuple[str, ...]
    pub_date: str
    source_names: tuple[str, ...]
    source_urls: tuple[str, ...]


@dataclass(slots=True)
class LiveIndex:
    """Yayımlanmış haberlerin okunmuş hali."""

    posts: list[LivePost] = field(default_factory=list)

    @property
    def recent(self) -> list[LivePost]:
        return self.posts[:RECENT_WINDOW]

    def has_url(self, url: str) -> bool:
        target = canonicalize(url)
        return any(target in post.source_urls for post in self.posts)

    def duplicate_of(self, title: str) -> LivePost | None:
        """Aynı haberin daha önce yayımlanmış hâlini bulur."""
        lowered = title.strip().lower()
        if not lowered:
            return None
        for post in self.posts:
            if token_set_ratio(lowered, post.title.lower()) >= DUPLICATE_TITLE_SIMILARITY:
                return post
        return None

    def recent_context(self) -> dict:
        """Asteria'ya gidecek çeşitlilik verisi.

        Yorum içermez, sayım içerir. Ne anlama geldiği POLICY.md §2'de yazılı.
        """
        window = self.recent
        return {
            "windowSize": len(window),
            "sources": _counts(name for post in window for name in post.source_names),
            "categories": _counts(post.category for post in window if post.category),
            "tags": _counts(tag for post in window for tag in post.tags),
            # Pencerenin tamamı listelenir. Daha önce sekiz haber veriliyordu:
            # sayımlar 20 yayını kapsarken başlıklar 8'de kesiliyordu, yani
            # 9-20 arasında aynı olayın farklı sözcüklerle çıkıp çıkmadığı
            # görülemiyordu. Tekrar yargısı başlığı görmeyi gerektirir.
            "latest": [
                {
                    "title": post.title,
                    "category": post.category,
                    "source": post.source_names[0] if post.source_names else None,
                    "pubDate": post.pub_date,
                }
                for post in window
            ],
        }


def _counts(values) -> dict[str, int]:
    return dict(Counter(v for v in values if v).most_common())


def _read_post(path: Path) -> LivePost | None:
    match = _FRONTMATTER_RE.match(path.read_text(encoding="utf-8"))
    if not match:
        return None
    try:
        front = yaml.safe_load(match.group(1)) or {}
    except yaml.YAMLError:
        return None

    sources = front.get("sources") or []
    return LivePost(
        slug=path.stem,
        title=str(front.get("title", "")),
        description=str(front.get("description", "")),
        category=front.get("category"),
        tags=tuple(front.get("tags") or ()),
        pub_date=str(front.get("pubDate", "")),
        source_names=tuple(str(s.get("name", "")) for s in sources if s.get("name")),
        source_urls=tuple(
            canonicalize(str(s.get("url", ""))) for s in sources if s.get("url")
        ),
    )


def load_live(content_dir: Path | None = None) -> LiveIndex:
    """Yayımlanmış haberleri en yeniden eskiye sıralı okur."""
    directory = content_dir or DEFAULT_CONTENT_DIR
    posts = [post for path in directory.glob("*.md") if (post := _read_post(path))]
    posts.sort(key=lambda post: post.pub_date, reverse=True)
    return LiveIndex(posts)


def published_after(index: LiveIndex, moment: datetime) -> list[LivePost]:
    """Belirli bir andan sonra yayımlananlar. Çevrim başına hacim denetimi için."""
    marker = moment.isoformat()
    return [post for post in index.posts if post.pub_date >= marker]
