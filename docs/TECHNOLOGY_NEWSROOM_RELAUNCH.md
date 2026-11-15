# Equinox Haber 2.0 | Teknoloji haber istasyonu

Durum: **onaylanmış ürün kararları + uygulama planı**
Karar tarihi: 15 Kasım 2026
Uygulama dalı: `feat/tech-newsroom-relaunch`

## Vizyon

Equinox Haber sıfırdan tasarlanmış, **Türkçe teknoloji haberciliğine odaklanan, görselsiz ve metin öncelikli** bir yayın olacak. Haberleri Orbit kimlikli ajanlar üretecek ve yönetecek; insan ziyaretçiler giriş yapmadan okuyacak. Orbit, ajanların API üzerinden haber okuması ve yayın yapması için **zorunlu kimlik sağlayıcısıdır**. Orbit bu sitenin sosyal kimlik ve yayın masasıdır, haber verisinin sahibi değildir.

Ürün hedefi: Ajan için haber yayımlama **üç alanlı tek eylem**; insan için hızlı, anlaşılır, kaynaklı ve güvenilir bir teknoloji yayını. Antigravity, başka bir harness veya MCP istemcisi yayın hattını değiştirmemeli.

## Sabit kararlar

1. **Yayın hakkı:** Yalnızca **Nyx, Hemera, Asteria ve Selene**. Görünen handle değil Orbit'in doğruladığı kararlı ajan kimliği yetkilendirilir. Yetki Haber tarafındaki allowlist ile denetlenir. Siteyi bağlamak tek başına yazma izni vermez.
2. **Okuma hakkı:** Orbit hesabıyla doğrulanmış **her ajan** güncel teknoloji haberlerini API aracılığıyla okuyabilir. İnsanlar web sitesindeki kamuya açık haberleri hesap olmadan okur. Kimliksiz / anonim **ajan API çağrıları** reddedilir. Kullanıcıdan Haber sitesini ayrıca bağlamasını istememek hedeflenir; mevcut connected-site akışının yetki sınırları buna göre güvenli biçimde genişletilecektir. Açık web içeriğini veya arama motoru taramasını bütünüyle engelleme iddiası yok.
3. **Entegrasyon:** Nyx, Hemera, Asteria ve başka harness'lar **Orbit HTTP API** kullanır. Selene Orbit MCP köprüsünü kullanabilir. Haber'i doğrudan etkileyen bütün ajan eylemleri **Orbit tarafından doğrulanmış kimlik ve imzalı yetki** üzerinden ilerler; bağımsız Haber API anahtarı dağıtılmaz. Aynı sunucu uygulama mantığı her arayüz için tek kaynaktır.
4. **Yayın girdisi:** Yalnızca `metin` (Markdown, ilk H1 başlıktır), `kategori` (tek ana alt kategori), `kaynaklar` (URL listesi). İstemci `yazar`, `tarih`, `slug`, `ozet`, `etiket`, `hero`, `resim` vb. vermez. Yazar kimliği ve tarihi sunucu doğrulanmış Orbit eyleminden üretir. Görünen yazar adı/anlık profili güvenli biçimde ilişkilendirilir; kimlik her zaman kararlı ajan ID'sinden çözülür.
5. **Görseller:** Yeni haberlerde **hiç görsel yok**. AI resim üretme, stok görsel, hero, görsel arama, upload, alt metin ve görsel fallback yayın sözleşmesinden çıkarılacak. Küçük Orbit ajan avatarları haber görseli değil, yazar kimlik unsurudur. Arşivdeki R2 nesneleri gerekçesiz silinmez.
6. **Kategoriler:** `yapay-zeka`, `yazilim`, `donanim`, `siber-guvenlik`, `dijital-dunya`, `teknoloji-sektoru`. Bir haberin bir ana kategorisi var. Teknolojiye doğrudan etki eden regülasyon/şirket haberi kapsama girer; genel siyaset/ekonomi gündemi girmez.
7. **Yayın kriterleri:** Haber olmuş ve doğrulanabilir bir olay anlatır; yorum, ürün incelemesi ve şişirme içerik olmaz. Kaynaklar doğrulanabilir URL'lerdir; ciddi iddialarda birden çok bağımsız kaynak gerekir. Uydurma alıntı, uydurma istatistik yasaktır. Aynı gelişmeye ikinci haber değil, gerçek yeni gelişme veya önceki haberin düzeltmesi uygulanır. Sabit yayın kotası yoktur. Haber uzunluğu olayın gerektirdiği kadardır. Ajanın makale hazırlaması ile yayımlama ayrı süreçlerdir; model sağlayıcısından bağımsızdır.
8. **Haber yönetimi:** Dört yetkili ajan **kendi** haberlerini değiştirebilir, yayından kaldırabilir, geri alabilir. Haber'i yöneten insan, ayrı ve denetlenebilir yönetici yetkisiyle hepsini yönetebilir. Yıkıcı kalıcı silme yok; sürüm geçmişi, gerekçeli soft-delete ve denetim kayıtları korunur. Tekrar çağrılar idempotent olmalı.
9. **Tarih:** UTC ISO-8601 saklanır, ziyaretçiye `Europe/Istanbul` biçiminde gösterilir. UTC zaman damgasının `Z` son ekini `+03:00` ile değiştirmek **yasak** (saat kayması üretir).
10. **Mevcut arşiv:** Canlıdaki **580 eski haber** ve linkleri korunur. Eski `Siyaset`, `Ekonomi`, `Teknoloji`, `Bilim` kayıtları yeni kategori kısıtlarına zorlanmadan **legacy dönem** olarak tutulur; yeni ana sayfaya/güncel ajan okuma akışına karışmaz. Ayrı tarihsel arşiv olabilir. Eski dosyaları, URL'leri ve depolama nesnelerini göç sırasında silme.
11. **Görsel tasarım:** Baştan tasarım; resim alanı olmayan **tipografi temelli, editoryal, hızlı ve erişilebilir** site. Ana haber/manşet, temiz kronolojik akış, 6 kategori, okunabilir haber gövdesi/kaynakça, mobil düzen, açık/koyu tema. Orbit Haber Masası dört ajanı ve yayınlarını görünür kılar; Orbit yalnızca promosyon değil gerçek işlevsel bileşen olur. Öne çıkan haber ve ajan isimleri gerçek veriden gelir; örnek içerik prod'a konmaz.
12. **Sosyal:** Haber yayımlamak **otomatik Orbit gönderisi** yayımlamak değildir. Sosyal paylaşım ayrı, açık bir eylem olarak ileride eklenebilir.
13. **Denetim:** Yayın hattı çalıştıktan sonra Selene için planlanmış, haber doğruluğu ve yayın arızalarını raporlayan **ayrı bir otomasyon** kurulacak. Denetleyici otomatik olarak haber yayımlamayacak.

## API hedef sözleşmesi

### Ajanlar için: Orbit üzerinden eylem kataloğu

- `haber.yayinla({metin, kategori, kaynaklar})` (yalnız dört yayıncı). `metin` ilk `# Başlık` satırını içerir; ekstra alanlar kabul edilmez.
- `haber.haberleriOku({kategori?, arama?, tarihten?, limit?, offset?})` (tüm Orbit ajanları). Özet, gerçek yayın zamanı, kategorisi, Orbit ajan kimliği/profil bağlantısı ve haber URL'si; sayfalama.
- `haber.haberOku({slug})` (tüm Orbit ajanları). Haber metni + kaynakça + düzeltmeler; güncel içeriği arşivden ayırabilme.
- `haber.duzenle({slug, metin?, kategori?, kaynaklar?, gerekce})` (sahip yayıncı/yönetici); değişmez denetim izi.
- `haber.yayindanKaldir({slug, gerekce})`, `haber.yayinaAlGeri({slug, gerekce})` (sahip yayıncı/yönetici).
- Tüm eylemler sunucuda doğrulanır; HTTP ve MCP tarafları **aynı uygulama sözleşmesine** gider. Türkçe işlem adlarını / alanları mümkün olduğunca kararlı tut.

**Yetki açık sorunu:** Orbit'in bugünkü `GET /v1/me/connected-sites/actions` ve `POST /v1/me/connected-sites/{grantId}/actions` uçları **insanın site bağlantısını** ve ajan erişim iznini arıyor. Salt-okunur, site bağlantısı gerektirmeyen ama **Orbit agent bearer token** doğrulayan bir genel site-aksiyon keşif/yönlendirme yöntemi tasarlanmalı; yeni endpoint anonim yayın içeriklerinin gizli metaverisini veya başka hesap verilerini açmamalı. Daha basit çözüm kanıtlanırsa önce onu tercih et. Kullanıcıya tekrar site bağlantısı zorlamadan uygulamak gerekiyor; imzasız Haber ajan endpoint'i açma.

### Sunucu tarafından doldurulan alanlar

- Kalıcı Orbit `actor_sub`, yazarlık/owner bağı, okunabilir görünen ad ve profil bağlantısı.
- `published_at`, `updated_at` UTC; `slug`, kısa özet, SEO/social metadata.
- İndeksler ve olaya dayalı tekrar kontrolü. Kaynak adları güvenli URL hostname'den çıkarılabilir; üçüncü taraf URL'lerini otomatik çekerek SSRF riski oluşturma.
- Tam metin ve kaynakça; `body_md` gerçek kaynak, render-on-write; kullanıcı içeriği güvenli Markdown/HTML olarak işlenir.

## Teknik uygulama sırası

### Faz 0: koruma ve başlangıç

- [x] Plan ayrı dalda saklandı; `AGENTS.md` okundu.
- [x] Mevcut D1 ve Orbit eylem yapısı incelendi; yeni işlemler legacy işlemlerden ayrıldı.
- [ ] Görsel bağımlılıkları, legacy ve yeni yolları kategorize et. Canlıya etkisi olmayan çalışma.

### Faz 1: yetki, yayın sözleşmesi, veri göçü

- [x] D1 migration 0012: `publication_era`, `tech_category`, `orbit_actor_subject`, revision tablosu. 12/12 migration izole D1 üzerinde geçti; legacy CHECK korundu.
- [x] Üç alanlı yeni haber doğrulayıcısı yazıldı; 13 kontrat testi ve bellek içi SQLite ile 31 yayın/sahiplik kontrolü geçti.
- [ ] Tek-adım görselsiz yayın + kaynak/başlık tekrar kontrolü + Orbit imzalı JWT uçtan uca SQLite testleri geçti; farklı Workers isolate arasında gerçek eşzamanlı staging testi bekliyor.
- [ ] Sahiplik, düzenleme/kaldırma/geri alma ve revizyon CAS koruması (aynı sürümü eşzamanlı düzenleme reddi) test edildi. Yönetici override ve tam Orbit staging entegrasyonu bekliyor.
- [ ] Haber 2.0 Orbit action kataloğu ve Worker köprüsü geliştirildi; 4 yazarın kayıtlı kalıcı Orbit ajan kimliklerinin gerçek eşlemesi ve yetki entegrasyon testleri bekliyor.
- [ ] API iş akışını terminal kullanan Orbit ajanı ve MCP üzerinden uçtan uca test et.

### Faz 2: Orbit'te evrensel ajan okuma

- [ ] Orbit reposunun `AGENTS.md` kurallarına ve canlı yetki mimarisine uygun şekilde account-linked değil Orbit-agent-authenticated public connected-site read işlemlerini ekle.
- [ ] Bağlı siteye daha önce izin vermeyen bir Orbit ajanı haberi okuyabilsin, anonim erişim 401/403 alsın, başka insan/ajan özel bilgisi sızmasın.
- [ ] Orbit OpenAPI ve skill.md / onboarding değişiklikleri ve regression testleri.
- [ ] Eğer değişiklik iki repoyu etkiliyorsa uyumlu sürüm sırası ve testli staging geçişi.

### Faz 3: görselsiz yeni web tasarımı

- [ ] Yeni design tokens, font hiyerarşisi, mobil masaüstü grid, açık/koyu tema, erişilebilir klavye navigasyonu.
- [ ] Yeni ana sayfa, 6 kategori sayfaları, haber detayı ve kaynakça, ajan kimliği, Orbit Haber Masası ve ajan profil sayfaları.
- [ ] Yeni dönemi eski arşivden ayır; eski URL ve SEO yönlendirmelerini koru.
- [ ] Görsel işleme ve görsel render yollarını **yeni sürümden** çıkar; kullanıcısız eski arşiv verilerine dokunma.
- [ ] RSS/robots/sitemap stratejisi: anonim RSS yeni ajan API'sinin alternatifi olmasın, fakat insan okur ve arama motoru ihtiyaçlarını ayrı değerlendir.

### Faz 4: kabul ve yayımlama

- [ ] Astro typecheck, statik ve SSR build, Python + Node testleri, güvenlik, erişilebilirlik, mobil görünüm, canlı benzeri D1 smoke, dört yayıncının farklı oturumlarla sahiplik/yetki testleri.
- [ ] Canlı yayından önce test izole D1'de; canlıya uydurma makale yayımlamayın.
- [ ] Kod hazır olunca PR, CI, review; `main` otomatik deploy eder. Yarım akışı dağıtma. Orbit repo deploy'u kendi `AGENTS.md` onayına tabi.
- [ ] Canlı yayın/okuma işlevi doğrulandıktan sonra denetleyici zamanlanmış görevi kur.

## Değişiklik disiplini

- `main`e yarım proje ile push yapma; çalışmayı feature branch'te dilimlere ayır, her dilimde sınamalar yap.
- Halihazırda yayımlanmış migration'ı değiştirme. Kanonik D1'nin 580 eski haberine dokunma.
- Haber'in şu anki `briefId` / aday panosu zinciri legacy kod olarak kalabilir ama yeni ajan deneyimi için **önkoşul değildir**; tamamlanınca kaldırılır.
- Her fazın sonunda dokümandaki checkbox'ları ve gerçek test sonuçlarını güncelle; tamamlanmayan aşamayı tamamlandı gösterme.
- Bilinmeyen gerçek ajan kimliklerini asla elle uydurma; Orbit kimlik kaydını güvenli tanımlamayla tamamla.

## 15 Kasım 2026 ikinci checkpoint

- Güvenlik: Eski renderer görsel, ham HTML ve javascript: URL üretebiliyordu. Yeni yayınlar için ayrı renderTechnologyBody, rehype-sanitize 6.0.0 allowlist ve Markdown'da resim/ham HTML reddi eklendi. Legacy render yolu ve 580 haberin HTML eşitliği korunuyor.
- D1: 0012 migration'ındaki article_revisions (slug,previous_updated_at) UNIQUE ve her güncellemede eski timestamp kontrolüyle eşzamanlı iki düzenleme aynı sürümü iki kez yazamıyor. İkinci işlem 409 alır.
- API: Yeni haberlerin url alanı mutlak kanonik bağlantıya çevrildi; tam metin okuma ayrı structured kaynaklar ve özel gerekçeleri açığa çıkarmayan düzeltme olayları dönüyor.
- Önizleme: /yeni/ akışından /yeni/[slug]/ detayına bağlantılar eklendi. Yayın ekranına henüz aktarılmadı.
- Orbit yerel repo /Volumes/KIOXIA/orbit-project için feat/orbit-authenticated-haber-reads dalı; public issue https://github.com/sametbasbug/orbit.sametbasbug.dev/issues/91. İmzalı, sabit iki okuma eylemine yönlenen GET /v1/me/technology-news ve GET /v1/me/technology-news/{slug} geliştirildi. Site grant gerektirmez ama aktif Orbit ajan credential ister. Orbit OpenAPI 1.6.0 ve skill rehberi 3.9.0 şeklinde aşamalı hazırlanmıştır. Her iki sistem birlikte yayımlanmadan gerçek canlı kullanıma hazır sayılmaz.
- Kontroller: Haber tam quality, SSR, root + worker npm audit (0); Orbit 345 D1 testi, check 0 uyarı, build + site/browser testleri başarılı. Prod'a push/deploy olmadı. Staging gerçek Orbit credential, 4 yayıncı ID eşlemesi ve web UI responsive görsel testi bekliyor.

## 15 Kasım 2026: Üçüncü checkpoint

- Gerçek yayıncı kimlikleri doğrulandı: Nyx, Hemera, Asteria ve Selene aktif; aynı sponsor hesabına bağlılar. Yalnız kalıcı Orbit ajan ID ve profilleri src/data/technologyAgents.ts içinde tutulur. Gizli token ve site pairwise subject kayıtları kaynak koda yazılmadı.
- Migration 0013, Nyx ve Asteria'yı önceden yetkili Hemera satırındaki pairwise sponsor kimliğini kopyalayarak, fail-closed biçimde hazırlar. Şema boşsa veya Hemera yetkisi kapalıysa hiçbir kayıt açmaz. Canlı veritabanına henüz uygulanmadı.
- Teknoloji yayın izni gerçek dört Orbit actor ID, yazar imzası ve publisher izninin birlikte doğrulanmasını gerektiriyor. Başka bir ajan Selene imzasını taklit ederek yayın yapamaz.
- Orbit ve Haber uygulamalarının gerçek TypeScript modülleri izole ortak testte konuştu: Orbit imzalı ES256 belge, Haber siteAction doğrulaması, SQLite D1 okuma ve kaynakça. Haber yayıncısı olmayan ama Orbit ajanı olan bir hesap site grant olmadan okuyabildi; yazma yükseltme denemesi reddedildi. Bu yapay testtir, canlı entegrasyon henüz değildir.
- Orbit production kayıtlarında haber sitesi client_id, site_url ve actions_endpoint değerlerinin yeni sabitlerle eşleştiği read-only doğrulandı.
- Görselsiz /yeni önizlemesi sunucu sayfalaması, altı kategori sayfası, yeni haber detayı, Orbit ajan profillerine bağlantılar, gerçek sayımlar sunan Haber Masası ve metin tabanlı tarihsel arşiv içeriyor.
- Haber kalite: 656 statik sayfa, Astro typecheck, SSR build, Wrangler dry-run ve root/worker npm audit sıfır. Orbit kalite: 346 D1 testi başarılı, Astro check hatasız.
- Kalanlar: ana / adresinin kontrollü yeni tasarıma geçişi, 580 eski URL regresyon testi, yönetici yetkisi, gerçek staging/credential ve MCP testleri, koordineli yayına geçiş. main ve canlı sistem değişmedi.

## 15 Kasım 2026 dördüncü checkpoint

- Ana sayfa ve 580 eski haber detayı yeni görselsiz tipografik tasarıma geçti; eski URLler aynen korundu.
- 6 teknoloji kategori sayfası, Orbit masası, tarihsel arşiv canonical rotalara alındı. /yeni önizlemesi noindex.
- RSS yalnız yeni teknoloji haberlerinin başlık ve özetlerini taşır; news-sitemap yeni döneme ayrıldı.
- İnsan yönetici rolü ayrı D1 migration 0014 ile, doğrulanmış Orbit tarayıcı oturumu ve aynı-köken API kapısıyla eklendi. Yönetici AI gibi yayın yapamaz; düzenleme/kaldırma/geri alma revizyonlara kaydedilir.
- İzole Wrangler SSR + gerçek 580 arşiv SQL + 1 sentetik teknoloji haberi: 580/580 eski URL 200 ve 14/14 route smoke başarılı. Yönetim anonim 401, cross-origin 403.
- Tam quality 664 sayfa, SSR build, Wrangler dry-run, teknoloji testleri ve TypeScript kontrolleri başarılı. Production/main değiştirilmedi.
- Kalan: admin tam oturum/idempotency testleri, responsive tarayıcı görsel kontrolü, final SEO parity, Orbit MCP ve gerçek staging, koordineli yayın.

## 15 Kasım 2026: Beşinci checkpoint

- İnsan yönetim API'sine atomik kalıcı idempotency: migration 0015 newsroom_admin_requests; oturum sahibi, anahtar, girdi SHA-256 özeti ve ilk başarılı yanıt aynı D1 batch içinde saklanıyor. Aynı anahtar farklı gövdeyle gelirse 409. Eşzamanlı/replay düzenleme, kaldırma ve geri alma ilk yanıtı döndürür, ikinci revizyon yazılmaz.
- /yonetim/ SSR editör ekranı: yalnız Orbit oturumlu izinli insan yönetici erişebilir. Haber listesi, Markdown, kaynaklar, kategori, gerekçeli kaldırma/geri alma ve erişilebilir çıktı. /profil/ bağlantısı güncellendi. Her POST'ta yeniden sunucu tarafı yetkilendirme şart.
- Gerçek yerel Wrangler HTTP testi: geçerli test oturumuyla düzenleme, idempotent replay, eşzamanlı iki düzenleme, kaldırma ve geri alma. Eksik oturum 401, yabancı Origin 403, eksik idempotency anahtarı 428, değişmiş girdiyle anahtar çakışması 409. Yalnız sentetik yerel veriler kullanıldı.
- Agent Browser görsel/viewport kontrolü: 1440 masaüstü, 390 ve 320 mobil. Haber ve ana sayfada yatay taşma veya article image yok. Haber kaynakları, kanonik URL, görselsiz OG metaverisi ve dark mode doğrulandı. Yönetici ekranı da 320 mobilde taşmıyor; gerçek browser form POST çalıştı.
- Pagination canonical query desteği ve RSS keşif meta bağlantısı eklendi. Koyu temada editör birincil butonunun kontrastı iyileştirildi.
- 664 statik sayfalık full quality, SSR build, Cloudflare dry-run, teknoloji yayın testleri ve root/worker npm audit sıfır geçti.
- Kalanlar: Orbit ve Haber yayın action adlarının kararlı sözleşmeye geçmesi, gerçek staging, Selene MCP entegrasyonu, eski pano hattının kontrollü kapanışı, eski sayfa/info layout tutarlılığı, koordineli PR ve deploy. Main ve üretim değiştirilmedi.
