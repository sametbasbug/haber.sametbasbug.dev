#!/usr/bin/env bash
set -euo pipefail

ROOT="/Volumes/KIOXIA/haber-project"
LIVE_ROOT="/Volumes/KIOXIA/haber-project"
cd "$ROOT"

if ! command -v openclaw >/dev/null 2>&1; then
  echo "error: openclaw CLI not found"
  exit 1
fi

RECENT_SOURCE_CONTEXT=$(news_pipeline/.venv/bin/python - <<'PY'
from pathlib import Path
import re
from collections import Counter

root = Path('/Volumes/KIOXIA/haber-project/src/content/anlikHaber')
files = sorted(root.glob('*.md'), key=lambda p: p.stat().st_mtime, reverse=True)
source_re = re.compile(r'^\s*- name: "?(.*?)"?\s*$')
title_re = re.compile(r'^title: "?(.*?)"?\s*$')
company_patterns = {
    'Google': re.compile(r'\bgoogle\b', re.I),
    'OpenAI': re.compile(r'\bopenai\b', re.I),
    'Anthropic': re.compile(r'\banthropic\b', re.I),
    'Meta': re.compile(r'\bmeta\b', re.I),
    'Microsoft': re.compile(r'\bmicrosoft|linkedin\b', re.I),
    'Nvidia': re.compile(r'\bnvidia\b', re.I),
    'Apple': re.compile(r'\bapple\b', re.I),
    'Amazon': re.compile(r'\bamazon|aws\b', re.I),
}
rows = []
for path in files[:20]:
    source = '-'
    title = path.stem
    for line in path.read_text(encoding='utf-8').splitlines():
        m = source_re.match(line)
        if m:
            source = m.group(1)
        t = title_re.match(line)
        if t:
            title = t.group(1)
    company = '-'
    for name, pattern in company_patterns.items():
        if pattern.search(title):
            company = name
            break
    rows.append((path.stem, source, title, company))

last8 = rows[:8]
source_counts = Counter(source for _, source, _, _ in rows)
company_counts = Counter(company for _, _, _, company in rows if company != '-')
last10_company_counts = Counter(company for _, _, _, company in rows[:10] if company != '-')

out = []
out.append('Son 8 yayın:')
for slug, source, title, company in last8:
    company_note = f' | şirket: {company}' if company != '-' else ''
    out.append(f"- {slug}: {source}{company_note} | {title}")
out.append('')
out.append('Son 20 yayın kaynak sayımı:')
for source, count in source_counts.most_common():
    out.append(f"- {source}: {count}")
out.append('')
out.append('Son 10 yayın şirket/konu sayımı:')
if last10_company_counts:
    for company, count in last10_company_counts.most_common():
        out.append(f"- {company}: {count}")
else:
    out.append('- belirgin şirket kümesi yok')
out.append('')
out.append('Son 20 yayın şirket/konu sayımı:')
if company_counts:
    for company, count in company_counts.most_common():
        out.append(f"- {company}: {count}")
else:
    out.append('- belirgin şirket kümesi yok')
print('\n'.join(out))
PY
)

TURKIYE_CANDIDATE_CONTEXT=$(news_pipeline/.venv/bin/python - <<'PY'
from pathlib import Path
import json

root = Path('/Volumes/KIOXIA/haber-project/news_pipeline/data/queue')
items = []
for path in root.glob('*.json'):
    try:
        data = json.loads(path.read_text(encoding='utf-8'))
    except Exception:
        continue
    if data.get('status') != 'new' or data.get('draft_category') != 'Türkiye':
        continue
    sources = data.get('draft_sources') or []
    source_name = sources[0].get('name') if sources else '-'
    notes = data.get('notes') or []
    note_text = f" | not: {'; '.join(notes[:2])}" if notes else ''
    items.append((
        float(data.get('editorial_priority') or 0),
        data.get('queue_id') or path.stem,
        source_name,
        data.get('draft_title') or '-',
        data.get('draft_description') or '-',
        note_text,
    ))
items.sort(reverse=True)
out = ['En güçlü Türkiye adayları (ayrı shortlist, global top listede kaybolmasın diye özellikle bak):']
if not items:
    out.append('- yeni Türkiye adayı yok')
else:
    for score, qid, source_name, title, desc, note_text in items[:6]:
        short_desc = ' '.join(desc.split())[:220]
        out.append(f'- {qid} | skor={score:.3f} | kaynak={source_name} | başlık={title}')
        if short_desc and short_desc != '-':
            out.append(f'  özet: {short_desc}{note_text}')
print('\n'.join(out))
PY
)

PROMPT_TEMPLATE=$(cat <<'EOF'
`news_pipeline` için /Volumes/KIOXIA/haber-project içinde çalış; canlı yayın yüzeyi de /Volumes/KIOXIA/haber-project/src/content/anlikHaber klasörüdür ve kanonik adres https://haber.sametbasbug.dev alanıdır.

Son 8 canlı yayının kaynak dağılımı:
__RECENT_SOURCE_CONTEXT__

__TURKIYE_CANDIDATE_CONTEXT__

Görevin:
1. yeni ve güçlü adayları değerlendir,
2. yeterli kalite varsa en fazla üç güçlü kaydı editoryal olarak temizleyip publish et,
3. riskli, zayıf, tekrarlı veya yetersiz doğrulanmış kayıtları publish etme,
4. yeterli publish kalitesi yoksa daha az sayıda kayıtla yetin.

Kurallar:
- direct autopublish kapalı, editoryal kapı sensin
- bir koşuda en fazla 3 kayıt publish et
- yalnızca Anlık Haber alanında çalış
- pipeline işlemleri ve canlı publish yüzeyi `/Volumes/KIOXIA/haber-project` içinde olmalı
- publish sonrası yalnız ilgili `src/content/anlikHaber` ve gerekliyse buna yakın dar değişikliklerle sınırlı dar kapsamlı git add, commit ve push varsayılan adımdır
- alakasız dosya, geniş repo diff'i, teknik blokaj veya riskli içerik görürsen push yapma; bunlar yoksa publish'i commit/push olmadan bırakma
- mümkünse kısa ve net çalış, gereksiz repo değişikliği yapma
- çıkan metin bülten maddesi, bullet summary veya genişletilmiş özet gibi durmasın; kısa ama gerçek haber yazısı gibi aksın
- gövdeyi mümkünse tercihen 5, gerekirse 4 ila 6 kısa paragraf halinde kur: güçlü bir açılış, net haber çerçevesi, somut detay, ek ayrıntı ve kısa ama organik bağlam
- gerektiğinde metni biraz daha uzun tut; aşırı kısalık yüzünden haber hissi kaybolmasın
- yorumcu, köşe yazarı veya analist tonuna kayma; haber tonu korunmalı
- metni yasak cümlelerden kaçınmaya çalışırken robotikleştirme; doğal ve akıcı Türkçe önceliklidir
- son paragraf kaynaklardan kopuk büyük çıkarım cümlesine dönüşmesin; mümkünse ek somut detay, resmi pozisyon, sonraki adım, zamanlama, etkilenen taraf ya da elde kalan açık soru ile bitsin
- `bu da ... gösteriyor`, `konumunu daha da güçlendirebilir`, `yatırımcı ilgisinin sürdüğünü gösteriyor` gibi otomatik kapanış reflekslerinden kaçın; son cümle haberden çıksın, şablondan değil
- opinion, review, hands-on veya birinci tekil deneyim ağırlıklı kaynakları düz haber gibi sertleştirme; gerekiyorsa tonu buna göre yumuşat ya da adayı ele
- editör notu gibi duran meta bölümlerden kaçın ama haber akışını boğacak kadar negatif kurala saplanma
- kullanıcı özellikle istemedikçe gövdede madde işaretli liste kullanma
- kişisel suçlama, cinsel suç iddiası ve tek kaynaklı sert itham dosyalarında ekstra dikkat göster; ama siyaset başlığını sırf siyaset diye otomatik eleme
- kurumsal karar, yasa, diplomasi, seçim süreci, parlamento, parti, mahkeme veya resmi açıklama eksenli temiz ve çok kaynaklı siyaset haberlerini publish edilebilir aday olarak aktif biçimde değerlendir
- benzer güçte iki aday varsa, son 20 yayında daha az görünen kaynağı açıkça tercih et
- son 20 yayında açık biçimde baskınlaşmış bir kaynağa yeniden yaslanacaksan, bunun neden bariz biçimde daha güçlü aday olduğunu bilinçli olarak değerlendir; küçük kalite farkı için aynı kaynağa dönme
- ama TechCrunch dahil hiçbir güçlü kaynağı sırf son dönemde sık kullanıldı diye otomatik dışlama; gerçekten açık ara en temiz ve güçlü aday ondaysa kullan
- bir koşuda iki veya üç kayıt publish edeceksen mümkünse aynı kaynağa yaslanma; yeterli kalite varsa kaynakları çeşitlendir
- son 3 canlı yayının kaynağıyla aynı kaynağa yeniden yaslanacaksan bunu istisna say ve ancak belirgin kalite farkı varsa yap
- aynı şirket veya ürün kümesinden başlıklar son 10 yayında zaten iki ya da daha fazla kez görünüyorsa buna seri yığılma muamelesi yap; açık ara daha güçlü değilse alternatif şirket/konu adayını seç
- özellikle Google, OpenAI, Anthropic, Meta, Microsoft, Nvidia, Apple ve Amazon başlıklarında konu çeşitliliğini aktif koru; aynı şirketi kısa aralıkta üst üste bindirme
- TechCrunch son 20 yayında baskın görünüyorsa küçük kalite farkında CNBC, WIRED, Ars Technica, Reuters, BBC, Politico, Guardian veya başka temiz alternatif kaynağa yönel
- publish kalitesini geçen `Türkiye` kategorisinde en az bir uygun aday varsa, bir koşudaki en fazla 3 publish hakkından birini öncelikle `Türkiye` kategorisine ayır
- ama bu kuralı kör kota gibi uygulama; zayıf, riskli, tek kaynaklı sert itham içeren veya dil/bağlam kalitesi düşük `Türkiye` adayları bu önceliği hak etmez

Çıkışında kısa bir sonuç ver:
- kaç kayıt publish edildi
- varsa queue_id veya slug listesi
- commit/push yapıldıysa kısa hash veya özet, yapılmadıysa neden yapılmadığı
- kısa gerekçe
EOF
)

PROMPT=${PROMPT_TEMPLATE/__RECENT_SOURCE_CONTEXT__/$RECENT_SOURCE_CONTEXT}
PROMPT=${PROMPT/__TURKIYE_CANDIDATE_CONTEXT__/$TURKIYE_CANDIDATE_CONTEXT}

SESSION_ID="asteria-editorial-gate-$(date +%s)"

echo "--- ASTERIA EDITORIAL GATE ---"
echo "session_id=${SESSION_ID}"
openclaw agent \
  --agent asteria \
  --session-id "$SESSION_ID" \
  --thinking high \
  --timeout 900 \
  --message "$PROMPT"
