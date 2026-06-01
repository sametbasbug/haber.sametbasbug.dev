from __future__ import annotations

import os
import sys
from pathlib import Path

PACKAGE_ROOT = Path(__file__).resolve().parents[1]
if str(PACKAGE_ROOT) not in sys.path:
    sys.path.insert(0, str(PACKAGE_ROOT))

# Tests must stay provider-free. If a publish helper renders frontmatter, force the
# local stock fallback path rather than OpenClaw image generation.
os.environ.setdefault("NEWS_PIPELINE_DISABLE_AI_HERO", "1")
os.environ.setdefault("NEWS_PIPELINE_REQUIRE_AI_HERO", "0")
