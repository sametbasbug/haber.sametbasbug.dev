from __future__ import annotations

import json
from pathlib import Path

import pytest

CORPUS_DIR = Path(__file__).parent / "corpus"

# Aday havuzundaki Türkçe yayın yapan kaynaklar. Dil kapısı testlerinde
# "İngilizce negatif" kümesinden çıkarılmaları gerekir; aksi halde doğru
# sınıflanmış Türkçe metinler yanlış kabul gibi sayılır.
TURKISH_LANGUAGE_SOURCES = frozenset({"Diken", "Kısa Dalga", "Medyascope"})


@pytest.fixture(autouse=True)
def isolated_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Testleri geliştiricinin `.env` dosyasından yalıtır.

    `.env` varsa gerçek API anahtarı okunur ve "anahtar yokken ne olur"
    testleri makineden makineye farklı sonuç verir. Anahtar gerektiren testler
    `monkeypatch.setenv` ile kendi değerini koyar.
    """
    monkeypatch.setattr("newsroom.env.load_env", lambda *args, **kwargs: None)
    monkeypatch.delenv("PEXELS_API_KEY", raising=False)


def _load(name: str) -> list[dict]:
    path = CORPUS_DIR / name
    with path.open(encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


@pytest.fixture(scope="session")
def published() -> list[dict]:
    """Yayımlanmış haberler. Şema ve dil açısından kesin pozitif."""
    return _load("published.jsonl")


# Kapıların yürürlüğe girdiği tarih.
#
# Nisan 2026 yayınları, bugün geçerli olan kapılardan bazıları eklenmeden önce
# üretildi ve onlara uymuyor: 216 yayının 130'u 24 saatten eski kaynağa dayanıyor,
# hiçbirinde `heroAlt` yok. Bunlar hata değil, kapı öncesi dönem.
#
# Regresyon testleri bu tarihten sonrasına bakar. Ölçüt "geçmişte ne yapıldı"
# değil, "bugünkü kurallar yürürlükteyken ne üretildi" olmalıdır.
GATE_ERA_START = "2026-05"


@pytest.fixture(scope="session")
def published_current_era(published: list[dict]) -> list[dict]:
    """Bugünkü kapılar yürürlükteyken yayımlanmış haberler."""
    return [post for post in published if post["pub_date"] >= GATE_ERA_START]


@pytest.fixture(scope="session")
def candidates() -> list[dict]:
    """Yayımlanmamış aday örneklemi. Etiketsizdir — negatif değildir."""
    return _load("candidates.jsonl")


@pytest.fixture(scope="session")
def foreign_language_texts(published: list[dict], candidates: list[dict]) -> list[str]:
    """Türkçe olmayan metinler: kaynak başlıkları ve özetleri."""
    texts: list[str] = []
    for post in published:
        origin = post.get("origin")
        if origin and origin["source_name"] not in TURKISH_LANGUAGE_SOURCES:
            texts.append(origin["orig_title"])
            texts.append(origin["orig_summary"])
    for candidate in candidates:
        if candidate["source_name"] not in TURKISH_LANGUAGE_SOURCES:
            texts.append(candidate["title"])
            texts.append(candidate["summary"])
    return [text for text in texts if text.strip()]
