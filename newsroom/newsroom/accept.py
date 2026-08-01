"""Kabul sözleşmesi.

Asteria'nın döndürdüğü JSON'ı yayına almadan önce doğrular. Buradaki her kontrol
mekaniktir: bir alan var ya da yok, metin Türkçe ya da değil, paragraf sayısı
aralıkta ya da değil.

Haberin *iyi* olup olmadığı burada ölçülmez. O `POLICY.md` işidir ve Asteria
tarafından uygulanır. Bu katman yalnız sözleşmeyi tutar.

Eşikler `newsroom/tests/corpus` üzerindeki gerçek dağılımdan seçildi (kapı
dönemi, 354 yayın):

    gövde uzunluğu   min 635 · p01 872 · p05 976 · medyan 1309
    paragraf         3:4  4:202  5:146  6:2
    etiket           min 2 · medyan 6
    madde işareti    0

Eski sistemdeki 520 karakterlik "kalite kapısı" bu dağılımın çok altında
kalıyordu ve pratikte hiçbir şeyi engellemiyordu. Buradaki uzunluk eşiği kalite
kapısı olarak sunulmuyor; **kırpılma korumasıdır**. Yapısal denetimi paragraf
sayısı yapar.
"""

from __future__ import annotations

from dataclasses import dataclass, field
import re

from newsroom.lang import body_is_turkish, looks_untranslated

# `src/content.config.ts` içindeki kategori enum'u ile aynı olmalıdır.
# `tests/test_accept.py` bu eşleşmeyi doğrular.
CATEGORIES = ("Siyaset", "Ekonomi", "Teknoloji", "Bilim")

# Kırpılma koruması. Gözlenen en kısa gerçek gövde 635 karakter.
MIN_BODY_LENGTH = 600

# Yapısal denetim. POLICY.md §4: norm dört, üçe düşmek ve beşe çıkmak gerekçe
# ister, altıya çıkılmaz. Kapı dönemindeki 354 yayının 2'si altı paragraflı;
# bu sınır o ikisini bilinçli olarak dışarıda bırakır.
MIN_PARAGRAPHS = 3
MAX_PARAGRAPHS = 5

# POLICY.md §4: en az iki, en çok altı etiket. Alt sınır boş etiket dizisini,
# üst sınır arşivi gürültüye boğan etiket yığınını engeller.
MIN_TAGS = 2
MAX_TAGS = 6
MIN_DESCRIPTION_LENGTH = 40

REQUIRED_FIELDS = (
    "candidateId",
    "title",
    "description",
    "category",
    "body",
    "tags",
    "heroPrompt",
    "heroAlt",
    # İngilizce stok arama terimi. Zorunludur ama ucuzdur: birkaç sözcük.
    # Karşılığı büyük — Türkçe etiketle arama yapılan gölge koşuda haberle
    # ilgisiz bir görsel geldi. Codex görseli üretebildiğinde kullanılmaz,
    # yalnız Pexels yedeğine düşüldüğünde devreye girer.
    "heroQuery",
)

# İç kuyruk ve denetim notlarının haber metnine sızması. Eski sistemde
# `audit-content` bu işi yapıyordu; kapı yayından önceye alındı.
_INTERNAL_MARKERS = re.compile(
    r"manual-review|source-profile|asteria-editorial|autopublish|queue[_-]?id|"
    r"editoryal not|pre-reject|duplicate-publish-gate",
    re.IGNORECASE,
)

_BULLET_RE = re.compile(r"^\s*(?:[-*•]|\d+[.)])\s+", re.MULTILINE)
_PARAGRAPH_SPLIT_RE = re.compile(r"\n\s*\n")


@dataclass(frozen=True, slots=True)
class AcceptError:
    """Sözleşme ihlali. Kod makine tarafından okunur, mesaj insan içindir."""

    candidate_id: str | None
    code: str
    message: str


@dataclass(slots=True)
class AcceptResult:
    accepted: list[dict] = field(default_factory=list)
    errors: list[AcceptError] = field(default_factory=list)
    declined_reason: str | None = None

    @property
    def ok(self) -> bool:
        return not self.errors


def paragraphs_of(body: str) -> list[str]:
    return [p.strip() for p in _PARAGRAPH_SPLIT_RE.split(body.strip()) if p.strip()]


def _validate_selection(selection: dict, board: dict[str, dict]) -> list[AcceptError]:
    errors: list[AcceptError] = []
    candidate_id = selection.get("candidateId")

    def fail(code: str, message: str) -> None:
        errors.append(AcceptError(candidate_id, code, message))

    missing = [name for name in REQUIRED_FIELDS if not selection.get(name)]
    if missing:
        fail("missing_fields", f"eksik alan: {', '.join(missing)}")
        return errors

    entry = board.get(candidate_id)
    if entry is None:
        fail("unknown_candidate", f"panoda olmayan aday: {candidate_id}")
        return errors

    if selection["category"] not in CATEGORIES:
        fail("bad_category", f"geçersiz kategori: {selection['category']}")

    body = str(selection["body"])
    title = str(selection["title"])
    description = str(selection["description"])

    if len(body) < MIN_BODY_LENGTH:
        fail("body_truncated", f"gövde {len(body)} karakter, en az {MIN_BODY_LENGTH}")

    count = len(paragraphs_of(body))
    if not MIN_PARAGRAPHS <= count <= MAX_PARAGRAPHS:
        fail(
            "paragraph_count",
            f"{count} paragraf, izin verilen {MIN_PARAGRAPHS}-{MAX_PARAGRAPHS}",
        )

    if _BULLET_RE.search(body):
        fail("bullet_list", "gövdede madde işaretli liste var")

    turkish, reason = body_is_turkish(body)
    if not turkish:
        fail("not_turkish", f"gövde: {reason}")

    source_title = entry.get("title", "")
    for name, value in (("title", title), ("description", description)):
        untranslated, detail = looks_untranslated(value, source_title)
        if untranslated:
            fail("untranslated", f"{name}: {detail}")

    if len(description) < MIN_DESCRIPTION_LENGTH:
        fail(
            "description_too_short",
            f"description {len(description)} karakter, en az {MIN_DESCRIPTION_LENGTH}",
        )

    if title.strip().lower() == description.strip().lower():
        fail("description_repeats_title", "description başlığın tekrarı")

    tags = selection.get("tags") or []
    if not isinstance(tags, list) or len(tags) < MIN_TAGS:
        fail("too_few_tags", f"en az {MIN_TAGS} etiket gerekli")
    elif len(tags) > MAX_TAGS:
        fail("too_many_tags", f"{len(tags)} etiket, üst sınır {MAX_TAGS}")

    for name in ("body", "title", "description", "heroAlt"):
        if _INTERNAL_MARKERS.search(str(selection.get(name, ""))):
            fail("internal_leak", f"{name} içinde iç not/metadata izi var")

    return errors


def validate(payload: dict, brief: dict) -> AcceptResult:
    """Asteria yanıtını brief'e karşı doğrular.

    Seçim yapılmamış olması hata değildir: `POLICY.md` §7 yayımlanabilir aday
    yoksa yayımlamamayı açıkça istiyor.
    """
    result = AcceptResult()

    if not isinstance(payload, dict):
        result.errors.append(AcceptError(None, "bad_payload", "yanıt bir nesne değil"))
        return result

    selections = payload.get("selections")
    if selections is None:
        selections = []
    if not isinstance(selections, list):
        result.errors.append(
            AcceptError(None, "bad_payload", "selections bir liste değil")
        )
        return result

    if not selections:
        result.declined_reason = str(payload.get("note") or "gerekçe bildirilmedi")
        return result

    allowed = int(brief.get("task", {}).get("selectCount", 1))
    if len(selections) > allowed:
        result.errors.append(
            AcceptError(
                None,
                "too_many_selections",
                f"{len(selections)} seçim döndü, izin verilen {allowed}",
            )
        )
        return result

    board = {entry["id"]: entry for entry in brief.get("board", [])}

    seen: set[str] = set()
    for selection in selections:
        if not isinstance(selection, dict):
            result.errors.append(
                AcceptError(None, "bad_payload", "seçim bir nesne değil")
            )
            continue

        candidate_id = selection.get("candidateId")
        if candidate_id in seen:
            result.errors.append(
                AcceptError(candidate_id, "duplicate_selection", "aynı aday iki kez seçildi")
            )
            continue
        seen.add(candidate_id)

        errors = _validate_selection(selection, board)
        if errors:
            result.errors.extend(errors)
        else:
            result.accepted.append(selection)

    return result
