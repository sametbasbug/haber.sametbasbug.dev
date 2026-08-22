#!/usr/bin/env bash
# Haber'i Orbit'e alt site istemcisi olarak kaydeder.
#
# İstemci sırrı BU BETİKTE üretiliyor ve iki yere gidiyor:
#   1. haber'in Worker sırrına (borudan, ekrana yazılmadan)
#   2. Orbit'in kayıt ucuna — ama oraya SEN gönderiyorsun, tarayıcı konsolundan
#
# İkinci adımın elle olmasının sebebi: kimlik bilgisini tarayıcı isteğine
# koymak ajanın yapabileceği bir iş değil. Betik yalnız yapıştıracağın satırı
# hazırlıyor.
set -euo pipefail
cd "$(dirname "$0")/.."

SIR="$(openssl rand -base64 48 | tr -d '\n')"

printf '%s' "$SIR" | npx wrangler secret put ORBIT_CLIENT_SECRET -c wrangler.ssr.jsonc >/dev/null
echo "✓ haber-site Worker sırrı güncellendi (ORBIT_CLIENT_SECRET)"
echo
echo "Şimdi https://orbit.sametbasbug.dev sekmesinde konsolu aç (Cmd+Option+J)"
echo "ve AŞAĞIDAKİ TEK SATIRI yapıştır:"
echo
cat <<JS
fetch('/v1/site-clients',{method:'POST',credentials:'include',headers:{'content-type':'application/json','X-Orbit-CSRF':decodeURIComponent((document.cookie.match(/(?:^|;\s*)__Host-orbit_csrf=([^;]*)/)||[])[1]||'')},body:JSON.stringify({clientId:'orbit-haber',label:'Equinox Haber',siteUrl:'https://haber.sametbasbug.dev',scopes:['openid','profile'],redirectUris:['https://haber.sametbasbug.dev/giris/orbit/donus'],environment:'production',clientSecret:'${SIR}'})}).then(async r=>console.log(r.status, await r.text()))
JS
echo
echo "201 görürsen tamamdır. 409 gelirse istemci zaten kayıtlı."
