"""Kabul sözleşmesi testleri."""

from __future__ import annotations

from pathlib import Path
import re

import pytest

from newsroom.accept import (
    CATEGORIES,
    MAX_PARAGRAPHS,
    MIN_BODY_LENGTH,
    AcceptError,
    paragraphs_of,
    validate,
)

CONTENT_CONFIG = (
    Path(__file__).resolve().parents[2] / "src" / "content.config.ts"
)


def _brief(candidate_id: str = "c1", source_title: str = "Some English headline here") -> dict:
    return {
        "task": {"selectCount": 1},
        "board": [{"id": candidate_id, "title": source_title, "sourceText": "..."}],
    }


def _selection(**overrides) -> dict:
    # Gerçek dağılıma yakın tutuldu: kapı dönemindeki en kısa gövde 635,
    # dört paragraflı yayınların medyanı 1176 karakter.
    body = "\n\n".join(
        [
            "Bakanlık tarafından yapılan yazılı açıklamada, uzun süredir beklenen "
            "kararın önümüzdeki ay yürürlüğe gireceği bildirildi ve geçiş takvimi "
            "kamuoyuyla paylaşıldı. Açıklama bugün öğle saatlerinde yayımlandı.",
            "Açıklamada yer alan verilere göre düzenleme yaklaşık iki bin işletmeyi "
            "kapsıyor ve uyum süreci için altı aylık bir geçiş dönemi tanınıyor. "
            "Bu sürede mevcut belgeler geçerliliğini korumaya devam edecek.",
            "Sektör temsilcileri takvimin kısa olduğunu savunurken bakanlık sürenin "
            "yeterli olduğunu belirtiyor ve şimdilik ek bir düzenleme beklemediğini "
            "söylüyor. Tarafların önümüzdeki hafta yeniden bir araya gelmesi bekleniyor.",
            "Düzenlemenin ayrıntıları önümüzdeki hafta yayımlanacak yönetmelikle "
            "netleşecek. İtiraz süreci için takvimin ne zaman açıklanacağı ise "
            "bakanlığın açıklamasında yer almadı ve soru olarak duruyor.",
        ]
    )
    return {
        "candidateId": "c1",
        "title": "Bakanlık yeni düzenlemenin takvimini açıkladı",
        "description": "Bakanlık, iki bin işletmeyi kapsayan düzenleme için altı aylık geçiş süresi tanıdığını bildirdi.",
        "category": "Ekonomi",
        "body": body,
        "tags": ["düzenleme", "işletme", "bakanlık"],
        "heroPrompt": "Resmî bir binanın önünde belge taşıyan kişiler",
        "heroAlt": "Bakanlık binası önünde belge taşıyan kişiler",
        **overrides,
    }


class TestSchemaAlignment:
    def test_kategoriler_astro_semasiyla_ayni(self) -> None:
        """Kategori listesi iki yerde yaşıyor; ayrışırsa build kırılır."""
        text = CONTENT_CONFIG.read_text(encoding="utf-8")
        match = re.search(r"category:\s*z\.enum\(\[(.*?)\]\)", text, re.DOTALL)
        assert match, "content.config.ts içinde kategori enum'u bulunamadı"
        found = tuple(re.findall(r"'([^']+)'", match.group(1)))
        assert found == CATEGORIES


class TestCorpusReplay:
    def test_gercek_yayinlar_sozlesmeyi_gecer(
        self, published_current_era: list[dict]
    ) -> None:
        """Kapı dönemindeki gerçek yayınlar kabul sözleşmesinden geçmeli.

        Beklenen istisna: altı paragraflı iki yayın. POLICY.md §4 altıya
        çıkmayı yasaklıyor, bu yüzden reddedilmeleri kasıtlıdır.
        """
        failures: list[tuple[str, str]] = []
        six_paragraph: list[str] = []

        for post in published_current_era:
            origin = post.get("origin")
            if not origin or not post.get("hero_alt"):
                continue

            selection = {
                "candidateId": post["slug"],
                "title": post["title"],
                "description": post["description"],
                "category": post["category"],
                "body": post["body"],
                "tags": post["tags"],
                "heroPrompt": "brief",
                "heroAlt": post["hero_alt"],
            }
            brief = _brief(post["slug"], origin["orig_title"])
            result = validate({"selections": [selection]}, brief)

            if result.ok:
                continue
            codes = {error.code for error in result.errors}
            if codes == {"paragraph_count"} and len(paragraphs_of(post["body"])) > MAX_PARAGRAPHS:
                six_paragraph.append(post["slug"])
            else:
                failures.append((post["slug"], ", ".join(sorted(codes))))

        assert failures == [], f"{len(failures)} gerçek yayın reddedildi: {failures[:5]}"
        assert len(six_paragraph) <= 2, f"beklenenden çok uzun yayın: {six_paragraph}"


class TestSelectionValidation:
    def test_temiz_secim_kabul_edilir(self) -> None:
        result = validate({"selections": [_selection()]}, _brief())
        assert result.ok, [e.message for e in result.errors]
        assert len(result.accepted) == 1

    def test_eksik_alan_reddedilir(self) -> None:
        selection = _selection()
        del selection["heroPrompt"]
        result = validate({"selections": [selection]}, _brief())
        assert not result.ok
        assert result.errors[0].code == "missing_fields"

    def test_panoda_olmayan_aday_reddedilir(self) -> None:
        result = validate({"selections": [_selection(candidateId="yok")]}, _brief())
        assert {e.code for e in result.errors} == {"unknown_candidate"}

    def test_gecersiz_kategori_reddedilir(self) -> None:
        result = validate({"selections": [_selection(category="Spor")]}, _brief())
        assert "bad_category" in {e.code for e in result.errors}

    def test_kirpilmis_govde_reddedilir(self) -> None:
        result = validate({"selections": [_selection(body="Çok kısa bir gövde.")]}, _brief())
        assert "body_truncated" in {e.code for e in result.errors}

    def test_alti_paragraf_reddedilir(self) -> None:
        body = "\n\n".join(
            f"Bu {i}. paragraf yeterince uzun tutulmuştur ve gövdenin uzunluk "
            f"eşiğini aşmasını sağlamak için ek cümleler içermektedir bugün."
            for i in range(6)
        )
        result = validate({"selections": [_selection(body=body)]}, _brief())
        assert "paragraph_count" in {e.code for e in result.errors}

    def test_madde_isaretli_govde_reddedilir(self) -> None:
        selection = _selection()
        selection["body"] = selection["body"].replace("\n\n", "\n\n- ", 1)
        result = validate({"selections": [selection]}, _brief())
        assert "bullet_list" in {e.code for e in result.errors}

    def test_ingilizce_govde_reddedilir(self) -> None:
        body = "\n\n".join(
            [
                "The ministry said in a statement that the decision will take effect "
                "next month and that the transition timetable has been shared.",
                "According to the data in the statement, the regulation covers about "
                "two thousand businesses and allows a six month transition period.",
                "Industry representatives argue that the timetable is short while the "
                "ministry maintains that the period is sufficient for the sector.",
            ]
        )
        result = validate({"selections": [_selection(body=body)]}, _brief())
        assert "not_turkish" in {e.code for e in result.errors}

    def test_cevrilmemis_baslik_reddedilir(self) -> None:
        source = "Ministry announces new timetable for business regulation"
        result = validate(
            {"selections": [_selection(title=source)]}, _brief(source_title=source)
        )
        assert "untranslated" in {e.code for e in result.errors}

    def test_ic_not_sizintisi_reddedilir(self) -> None:
        selection = _selection()
        selection["body"] += "\n\nEditoryal not: manual-review gerekiyor."
        result = validate({"selections": [selection]}, _brief())
        assert "internal_leak" in {e.code for e in result.errors}

    def test_yetersiz_etiket_reddedilir(self) -> None:
        result = validate({"selections": [_selection(tags=["tek"])]}, _brief())
        assert "too_few_tags" in {e.code for e in result.errors}

    def test_asiri_etiket_reddedilir(self) -> None:
        """POLICY.md §4 üst sınırı da bağlayıcıdır.

        Önceki sürümde yalnız alt sınır denetleniyordu; politika "en çok altı"
        derken kod on beş etiketi kabul ediyordu.
        """
        tags = [f"etiket{i}" for i in range(7)]
        result = validate({"selections": [_selection(tags=tags)]}, _brief())
        assert "too_many_tags" in {e.code for e in result.errors}

    def test_ust_sinirdaki_etiket_sayisi_gecer(self) -> None:
        tags = [f"etiket{i}" for i in range(6)]
        result = validate({"selections": [_selection(tags=tags)]}, _brief())
        assert not result.errors

    def test_description_baslik_tekrari_reddedilir(self) -> None:
        title = "Bakanlık yeni düzenlemenin takvimini açıkladı bugün sabah"
        result = validate(
            {"selections": [_selection(title=title, description=title)]}, _brief()
        )
        assert "description_repeats_title" in {e.code for e in result.errors}


class TestDeclineAndLimits:
    def test_secim_yapilmamasi_hata_degildir(self) -> None:
        result = validate({"selections": [], "note": "yayımlanabilir aday yok"}, _brief())
        assert result.ok
        assert result.accepted == []
        assert result.declined_reason == "yayımlanabilir aday yok"

    def test_alan_hic_yoksa_da_ret_sayilir(self) -> None:
        result = validate({"note": "aday yok"}, _brief())
        assert result.ok and result.accepted == []

    def test_izinden_fazla_secim_reddedilir(self) -> None:
        result = validate(
            {"selections": [_selection(), _selection(candidateId="c2")]}, _brief()
        )
        assert result.errors[0].code == "too_many_selections"

    def test_coklu_secim_izin_verildiginde_kabul_edilir(self) -> None:
        """selectCount konfigürasyondur; 1 koda gömülü değildir."""
        brief = _brief()
        brief["board"].append({"id": "c2", "title": "Another English headline"})
        brief["task"]["selectCount"] = 2
        result = validate(
            {"selections": [_selection(), _selection(candidateId="c2")]}, brief
        )
        assert result.ok, [e.message for e in result.errors]
        assert len(result.accepted) == 2

    def test_ayni_aday_iki_kez_secilemez(self) -> None:
        brief = _brief()
        brief["task"]["selectCount"] = 2
        result = validate({"selections": [_selection(), _selection()]}, brief)
        assert "duplicate_selection" in {e.code for e in result.errors}

    @pytest.mark.parametrize("payload", [None, [], "metin", 42])
    def test_bozuk_yanit_reddedilir(self, payload) -> None:
        result = validate(payload, _brief())
        assert not result.ok
        assert result.errors[0].code == "bad_payload"


class TestParagraphs:
    def test_bos_satirlar_paragraf_saymaz(self) -> None:
        assert len(paragraphs_of("Bir.\n\n\n\nİki.\n\n")) == 2

    def test_tek_satir_sonu_paragraf_bolmez(self) -> None:
        assert len(paragraphs_of("Bir satır\ndevamı burada.")) == 1


def test_hata_kodu_makine_okunur() -> None:
    error = AcceptError("c1", "not_turkish", "gövde: ...")
    assert error.code.islower() and " " not in error.code
