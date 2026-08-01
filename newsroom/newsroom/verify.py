"""Yayın öncesi ve sonrası doğrulama.

Dört kapı: içerik denetimi, görsel denetimi, Astro build, ve değişikliğin dar
kapsamlı olduğunun kontrolü.

Sonuncusu eski sistemin en değerli parçasıydı ve bilinçli olarak taşındı.
Otonom yayın yapan bir sistemin commit'i yalnız o haberin dosyalarına
dokunmalıdır; geniş bir diff, sistemin niyet etmediği bir şey yaptığı anlamına
gelir ve yayın orada durmalıdır.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
import re
import subprocess

import yaml

from newsroom.accept import CATEGORIES, _INTERNAL_MARKERS

REPO_ROOT = Path(__file__).resolve().parents[2]
CONTENT_PREFIX = "src/content/equinoxHaber/"
IMAGE_PREFIX = "public/images/generated/equinox-haber/"

BUILD_COMMAND = ("npm", "run", "build")
BUILD_TIMEOUT_SECONDS = 600

_FRONTMATTER_RE = re.compile(r"\A---\n(.*?)\n---\n(.*)\Z", re.DOTALL)

REQUIRED_FRONTMATTER = ("title", "description", "pubDate", "category", "sources")


@dataclass(slots=True)
class VerifyResult:
    checks: dict[str, bool] = field(default_factory=dict)
    problems: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.problems

    def record(self, name: str, problems: list[str]) -> None:
        self.checks[name] = not problems
        self.problems.extend(problems)


def audit_content(path: Path) -> list[str]:
    """Yazılmış markdown'ı denetler.

    Eski `audit-content` komutunun karşılığı, ama yayından *önce* çalışır:
    bozuk bir dosyayı yazıp sonra fark etmek yerine yazmadan yakalamak gerekir.
    """
    problems: list[str] = []
    match = _FRONTMATTER_RE.match(path.read_text(encoding="utf-8"))
    if not match:
        return [f"{path.name}: frontmatter okunamadı"]

    try:
        front = yaml.safe_load(match.group(1)) or {}
    except yaml.YAMLError as exc:
        return [f"{path.name}: frontmatter geçersiz YAML: {exc}"]

    for field_name in REQUIRED_FRONTMATTER:
        if not front.get(field_name):
            problems.append(f"{path.name}: eksik alan '{field_name}'")

    category = front.get("category")
    if category and category not in CATEGORIES:
        problems.append(f"{path.name}: geçersiz kategori '{category}'")

    body = match.group(2)
    if _INTERNAL_MARKERS.search(body):
        problems.append(f"{path.name}: gövdede iç not/metadata izi var")
    if "## Kaynaklar" not in body:
        problems.append(f"{path.name}: Kaynaklar bölümü yok")

    for source in front.get("sources") or []:
        if not str(source.get("url", "")).startswith("http"):
            problems.append(f"{path.name}: geçersiz kaynak adresi")

    return problems


def audit_images(path: Path, *, repo_root: Path | None = None) -> list[str]:
    """`heroImage` alanının gerçekten var olan bir dosyayı gösterdiğini doğrular."""
    root = repo_root or REPO_ROOT
    match = _FRONTMATTER_RE.match(path.read_text(encoding="utf-8"))
    if not match:
        return [f"{path.name}: frontmatter okunamadı"]

    try:
        front = yaml.safe_load(match.group(1)) or {}
    except yaml.YAMLError:
        return [f"{path.name}: frontmatter geçersiz YAML"]

    hero = front.get("heroImage")
    if not hero:
        return []

    if not str(hero).startswith("/images/"):
        return [f"{path.name}: heroImage yolu beklenmedik: {hero}"]

    asset = root / "public" / str(hero).lstrip("/")
    if not asset.is_file():
        return [f"{path.name}: heroImage dosyası yok: {hero}"]
    if asset.stat().st_size < 1024:
        return [f"{path.name}: heroImage dosyası bozuk görünüyor ({asset.stat().st_size} bayt)"]
    return []


def _git(*args: str, repo_root: Path | None = None) -> str:
    result = subprocess.run(
        ("git", *args),
        cwd=repo_root or REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)}: {result.stderr.strip()}")
    return result.stdout


def changed_paths(*, repo_root: Path | None = None) -> list[str]:
    """Çalışma ağacındaki tüm değişiklikler (izlenmeyenler dahil).

    `-uall` şart: `git status --porcelain` varsayılan olarak izlenmeyen bir
    klasörü tek satırda toplar (`src/`). Kapsam kontrolü dosya düzeyinde
    çalışmalı, yoksa kapsam içindeki yeni bir dosya kapsam dışı görünebilir.
    """
    output = _git("status", "--porcelain", "-uall", repo_root=repo_root)
    return [line[3:].strip() for line in output.splitlines() if line.strip()]


def is_publish_scoped(path: str) -> bool:
    return path.startswith(CONTENT_PREFIX) or path.startswith(IMAGE_PREFIX)


def audit_scope(*, repo_root: Path | None = None) -> list[str]:
    """Değişikliğin yalnız yayın dosyalarına dokunduğunu doğrular.

    Bu kapı gevşetilmemelidir. Otonom bir sistemin beklenmedik bir dosyayı
    değiştirmesi, o dosyanın ne olduğundan bağımsız olarak durma sebebidir.
    """
    unexpected = [path for path in changed_paths(repo_root=repo_root) if not is_publish_scoped(path)]
    if unexpected:
        return [f"yayın kapsamı dışında değişiklik: {', '.join(sorted(unexpected)[:5])}"]
    return []


def run_build(*, repo_root: Path | None = None) -> list[str]:
    """Astro build'i çalıştırır. Geçmeyen build yayınlanmaz."""
    try:
        result = subprocess.run(
            BUILD_COMMAND,
            cwd=repo_root or REPO_ROOT,
            capture_output=True,
            text=True,
            timeout=BUILD_TIMEOUT_SECONDS,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return [f"build {BUILD_TIMEOUT_SECONDS} saniyede bitmedi"]

    if result.returncode != 0:
        tail = (result.stderr or result.stdout).strip().splitlines()[-12:]
        return ["build başarısız:\n" + "\n".join(tail)]
    return []


def verify(path: Path, *, repo_root: Path | None = None, build: bool = True) -> VerifyResult:
    """Yazılmış bir yayını tüm kapılardan geçirir."""
    result = VerifyResult()
    result.record("content", audit_content(path))
    result.record("images", audit_images(path, repo_root=repo_root))
    result.record("scope", audit_scope(repo_root=repo_root))

    # Build pahalıdır; önceki kapılar düştüyse çalıştırmanın anlamı yok.
    if build and result.ok:
        result.record("build", run_build(repo_root=repo_root))
    elif build:
        result.checks["build"] = False

    return result


def commit(paths: list[str], message: str, *, repo_root: Path | None = None) -> str:
    """Yalnız verilen yolları commit eder ve hash döner.

    Push yapmaz. Yayına alma ayrı ve açık bir adımdır.
    """
    outside = [path for path in paths if not is_publish_scoped(path)]
    if outside:
        raise ValueError(f"yayın kapsamı dışında yol commit edilemez: {outside}")

    _git("add", "--", *paths, repo_root=repo_root)
    _git("commit", "-m", message, repo_root=repo_root)
    return _git("rev-parse", "--short", "HEAD", repo_root=repo_root).strip()
