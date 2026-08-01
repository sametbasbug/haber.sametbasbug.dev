"""Hero görsel arayüzü.

Sağlayıcı kararı bilinçli olarak ertelendi (`docs/DECISIONS.md` K6): `openclaw`
CLI kalmayacak, yerine ne geleceği Faz 3 sonunda kararlaştırılacak.

Bu modül yalnız sözleşmeyi tanımlar; rayın geri kalanı sağlayıcıdan habersiz
çalışır ve karar verildiğinde tek bir sınıf eklenir.

Karar için bağlam: hero görseli makale sayfasında gösterilmiyor. Şablonlarda
yalnız kart listelerinde, `og:image` ve JSON-LD alanlarında kullanılıyor. Yani
üretilen şey bir makale görseli değil, küçük resim ve sosyal önizleme.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Protocol


@dataclass(frozen=True, slots=True)
class HeroRequest:
    slug: str
    prompt: str
    alt: str
    category: str
    title: str


@dataclass(frozen=True, slots=True)
class HeroResult:
    """Üretim sonucu.

    `public_path` frontmatter'a yazılacak yoldur; üretim yapılmadıysa `None`.
    """

    public_path: str | None = None
    failure: str | None = None

    @property
    def ok(self) -> bool:
        return self.public_path is not None


class HeroProvider(Protocol):
    """Hero görseli üreten her sağlayıcının uyacağı sözleşme."""

    name: str

    def generate(self, request: HeroRequest, *, output_dir: Path) -> HeroResult: ...


class NoHeroProvider:
    """Görsel üretmeyen sağlayıcı.

    Faz 3 kararı verilene kadar varsayılan. Yayın hero'suz da geçerlidir:
    `heroImage` şemada zorunlu değil ve şablonlar alanın yokluğunu zaten
    karşılıyor (`{entry.data.heroImage && ...}`).
    """

    name = "none"

    def generate(self, request: HeroRequest, *, output_dir: Path) -> HeroResult:
        return HeroResult(failure="hero sağlayıcısı seçilmedi (DECISIONS.md K6)")
