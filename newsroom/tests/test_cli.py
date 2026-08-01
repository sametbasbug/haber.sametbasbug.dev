"""CLI testleri.

Ajan yüzeyinin sözleşmesi: çıktı her zaman tek parça JSON, hata durumunda da.
Serbest metin basılmaz; ajanın ayrıştıracağı tek bir yapı olur.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from newsroom.cli import build_parser, main


def _run(capsys, argv: list[str]) -> tuple[int, dict]:
    code = main(argv)
    out = capsys.readouterr().out
    return code, json.loads(out)


class TestParser:
    def test_komut_zorunlu(self) -> None:
        with pytest.raises(SystemExit):
            build_parser().parse_args([])

    def test_publish_kaynak_zorunlu(self) -> None:
        with pytest.raises(SystemExit):
            build_parser().parse_args(["publish"])

    def test_publish_iki_kaynak_birlikte_verilemez(self) -> None:
        with pytest.raises(SystemExit):
            build_parser().parse_args(["publish", "--stdin", "--response", "x.json"])

    def test_varsayilan_secim_sayisi_bir(self) -> None:
        assert build_parser().parse_args(["prepare"]).select_count == 1

    def test_secim_sayisi_ayarlanabilir(self) -> None:
        """Saat başı 2-3 habere çıkmak konfigürasyon olmalı, kod değişikliği değil."""
        assert build_parser().parse_args(["prepare", "--select-count", "3"]).select_count == 3


class TestPublishCommand:
    def test_bozuk_json_tek_parca_hata_verir(self, capsys, tmp_path: Path) -> None:
        bad = tmp_path / "bozuk.json"
        bad.write_text("{eksik", encoding="utf-8")
        code, payload = _run(capsys, ["publish", "--response", str(bad)])
        assert code == 1
        assert payload["ok"] is False
        assert "geçerli JSON değil" in payload["problems"][0]

    def test_olmayan_dosya_cokmeden_raporlanir(self, capsys, tmp_path: Path) -> None:
        code, payload = _run(capsys, ["publish", "--response", str(tmp_path / "yok.json")])
        assert code == 1
        assert payload["ok"] is False
        assert payload["problems"]

    def test_brief_yokken_temiz_hata(self, capsys, tmp_path: Path, monkeypatch) -> None:
        monkeypatch.setattr("newsroom.cycle.BRIEF_PATH", tmp_path / "yok.json")
        response = tmp_path / "r.json"
        response.write_text(json.dumps({"selections": []}), encoding="utf-8")
        code, payload = _run(capsys, ["publish", "--response", str(response)])
        assert code == 1
        assert any("brief bulunamadı" in problem for problem in payload["problems"])

    def test_secim_yapilmamasi_basarili_sayilir(
        self, capsys, tmp_path: Path, monkeypatch
    ) -> None:
        brief = tmp_path / "brief.json"
        brief.write_text(json.dumps({"task": {"selectCount": 1}, "board": []}), encoding="utf-8")
        monkeypatch.setattr("newsroom.cycle.BRIEF_PATH", brief)

        response = tmp_path / "r.json"
        response.write_text(
            json.dumps({"selections": [], "note": "yayımlanabilir aday yok"}, ensure_ascii=False),
            encoding="utf-8",
        )
        code, payload = _run(capsys, ["publish", "--response", str(response), "--no-build"])
        assert code == 0
        assert payload["ok"] is True
        assert payload["declinedReason"] == "yayımlanabilir aday yok"
        assert payload["published"] == []

    def test_sozlesme_ihlali_makine_okunur_kod_doner(
        self, capsys, tmp_path: Path, monkeypatch
    ) -> None:
        brief = tmp_path / "brief.json"
        brief.write_text(
            json.dumps({"task": {"selectCount": 1}, "board": [{"id": "c1", "title": "X"}]}),
            encoding="utf-8",
        )
        monkeypatch.setattr("newsroom.cycle.BRIEF_PATH", brief)

        response = tmp_path / "r.json"
        response.write_text(
            json.dumps({"selections": [{"candidateId": "c1", "title": "Kısa"}]}),
            encoding="utf-8",
        )
        code, payload = _run(capsys, ["publish", "--response", str(response), "--no-build"])
        assert code == 1
        assert payload["contractErrors"][0]["code"] == "missing_fields"


class TestStatusCommand:
    def test_durum_raporlanir(self, capsys) -> None:
        code, payload = _run(capsys, ["status"])
        assert code == 0
        assert "lastCycleAt" in payload
        assert "briefReady" in payload


class TestErrorSurface:
    def test_beklenmedik_hata_json_olarak_doner(self, capsys, monkeypatch) -> None:
        """Ajan hiçbir durumda ayrıştırılamayan çıktı görmemeli."""

        def boom(*args, **kwargs):
            raise RuntimeError("beklenmedik")

        monkeypatch.setattr("newsroom.cli.prepare", boom)
        code, payload = _run(capsys, ["prepare"])
        assert code == 1
        assert payload["ok"] is False
        assert "RuntimeError: beklenmedik" in payload["problems"][0]
