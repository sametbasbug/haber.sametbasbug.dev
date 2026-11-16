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
- [x] Görselsiz yeni dönemle görsel içeren eski arşiv akışlarını ayır; canlıya etkisi olmayan yerel tasarım/sayfa değişiklikleri tamamlandı.

### Faz 1: yetki, yayın sözleşmesi, veri göçü

- [x] D1 migration 0012: `publication_era`, `tech_category`, `orbit_actor_subject`, revision tablosu. 0012-0016 dahil 16/16 migration izole D1 üzerinde geçti; legacy CHECK korundu.
- [x] Üç alanlı haber doğrulayıcısı ve güvenli metin render'ı tamamlandı; 15 sözleşme testi, imzalı D1 yayın ve idempotency/sahiplik regresyonları geçti.
- [x] Tek-adım görselsiz yayın, kaynak/başlık tekrar kontrolü ve Orbit imzalı JWT ile gerçek SQL şeması üstünde yerel E2E testler tamamlandı.
- [ ] Gerçek Orbit hesabı ve farklı canlı/staging Worker isolate'ları arasında eşzamanlı uçtan uca kabul testi bekliyor.
- [x] Sahiplik, düzenleme/kaldırma/geri alma, revizyon CAS, ayrı insan yönetici override ve idempotent replay yerel SQL/HTTP testlerinde doğrulandı.
- [ ] Gerçek oturum ve gerçek ajan credential'ıyla staging yönetici/yazar kabulü bekliyor.
- [x] Haber 2.0 altı kanonik Orbit eylemi ve Worker köprüsü geliştirildi; dört yazarın gerçek kararlı Orbit ID'siyle imzalı yerel yetki ve iki-repo kaynak sözleşmesi doğrulandı.
- [ ] API iş akışını terminal kullanan Orbit ajanı ve MCP üzerinden uçtan uca test et.

### Faz 2: Orbit'te evrensel ajan okuma

- [x] Orbit reposunda site grant'i istemeyen ama Orbit-agent bearer credential'ı zorunlu tutan iki yeni haber GET rotası eklendi (feature branch).
- [x] Grant'siz aktif konuk ajan, anonim/askıdaki/emekli ajan ve içerik gizliliği yerel Worker HTTP + imzalı iki-repo testlerinde doğrulandı.
- [x] Orbit OpenAPI, skill.md/onboarding ve regresyon testleri güncellendi; her iki gerçek repo sözleşmesi karşılaştırıldı.
- [x] Orbit önce, Haber sonra sırası; 600 saniyelik katalog önbelleği ve iki sürümün uyumluluğu yerel testli; migration öncesi Orbit kontrolü CI'da zorunlu.
- [ ] Gerçek dağıtım/staging ve canlı önbellek kabulü bekliyor.

### Faz 3: görselsiz yeni web tasarımı

- [x] Yeni tipografik tasarım, mobil/masaüstü düzen, açık/koyu tema ve erişilebilirlik kontrolleri yerel browser'da doğrulandı.
- [x] Yeni ana sayfa, altı kategori, haber detayı ve kaynakça, ajan kimliği/profil bağlantıları, Orbit Haber Masası ve ajan profilleri tamamlandı.
- [x] Yeni teknoloji dönemi tarihsel arşivden ayrıldı; 580 eski URL, SSR/statik parity ve SEO sınamaları yerel testlerde korunuyor.
- [x] Yeni yayın render'ında haber görselleri kaldırıldı ve yasaklandı; eski arşiv verileri/depolama nesnelerine dokunulmadı.
- [x] RSS, robots ve sitemap akışları güncel teknoloji yayınıyla tarihsel arşivi ayıracak şekilde yerel test edildi.

### Faz 4: kabul ve yayımlama

- [x] Astro TypeScript, statik/SSR, Python/Node, mobil görsel kontroller, gerçek yerel Wrangler D1, dört yayıncı imzası ve güvenlik regresyonları tamamlandı.
- [ ] Farklı gerçek Orbit oturumlarıyla canlı/staging E2E testleri henüz yapılmadı.
- [x] Testler izole D1/Worker üzerinde sentetik kayıtlarla yapıldı; canlıya test haberi yazılmadı.
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

## 15 Kasım 2026 altıncı checkpoint

- Orbit site action sözleşmesi artık 6 kanonik işlem: `haber.yayinla`, `haber.haberleriOku`, `haber.haberOku`, `haber.duzenle`, `haber.yayindanKaldir`, `haber.yayinaAlGeri`. Yayın için yalnız `metin,kategori,kaynaklar` gerekir. Katalog BİÇİM sürümü 1 korunur (Orbit parser 2'yi reddediyor); eski pano işlemleri kamu kataloğundan çıkarıldı, varsayılan olarak kapalı ve yalnız rollback bayrağıyla çalışır. Önceki operasyon adlarını kullanan istemciler birlikte geçiş gerektirir.
- Migration 0016 `technology_agent_requests`: Orbit imzalı ajan yazma isteğinin tekrar yanıtı ve haber/revizyon değişikliği aynı D1 batch'e girer. Aynı anahtar+aktör+gövde tekrarında ilk yanıt döner, başka aktör veya farklı gövde 409. Eşzamanlı yayın/düzeltme/kaldırma/geri alma ve dört gerçek Orbit yayıncı ID'si üzerinden imzalı JWS testleri başarılı. Eski post-mutation log yalnız rollback yoluna ayrıldı.
- Orbit repo yeni okuma eylem adlarına güncellendi; gerçek Orbit katalog normalizeSiteActionCatalog, Haber'in altı işlemli JSON'unu doğruladı. Eski briefId yeni yayımla şemasında reddediliyor.
- /sayfa/N tarihsel yolları ve /arsiv/ artık ortak TechnologyArchiveList ile görselsiz. /sayfa/ sayımları legacy dönemiyle sınırlandırıldı. InfoPageLayout yeni tipografiyle aynı; Hakkımızda/Yazarlar/AI süreci/Editoryal İlkeler güncel teknoloji yayın modeline göre güncellendi.
- Haber full quality, SSR build, Wrangler dry-run; Orbit 346/346 D1 test, production build, 3462 site ve 855 browser doğrulaması geçti. İzole Wrangler + 580 eski D1 kaydıyla statik ve SSR tam HTML denklik testi: **587 karşılaştırılan, 0 atlanan, 0 ayrışan**. Lightning CSS'in SSR-only compiler sentinelleri (haber içeriği değil) parity normalizer'da gerekçeli biçimde hariç tutuldu.
- Canlı sistem, main, production migration ve gerçek haberler DEĞİŞMEDİ. Kalan: çapraz-HTTP staging, Selene MCP katalog geçişi, tam UX/bilgi sayfaları doğrulaması, kesintisiz koordineli deployment, ajan idempotency kayıtları için retention stratejisi. Orbit AGENTS.md gereğince açık push/deploy onayı gerekir.

## 15 Kasım 2026 yedinci checkpoint

- Checkpoint 6 geçici SSR/D1 dosyaları ve Wrangler test sunucusu temizlendi; iki yerel repo temiz başlangıçta doğrulandı.
- Orbit deposuna isteğe bağlı ama gerçek iki repo kaynağıyla çalışan test eklendi: npm run test:haber:cross-repo. Orbit'in gerçek ES256 imzalayıcısı + Haber'in gerçek siteAction imza doğrulaması + gerçek Haber 0016'ya kadar SQLite migration'ları. Bağlı site izni OLMAYAN Orbit guest ajanıyla dört imzalı okuma, kaynaklı tam metin, legacy ayrımı, olmayan habere 404 ve yazma enjeksiyonu reddi kanıtlandı. Hiç gerçek credential veya ağ erişimi yok.
- Eski SSR /api/brief ve /api/publish uçları varsayılan 410 Gone ile kapatıldı; sadece sunucu tarafı açık ENABLE_LEGACY_NEWS_ACTIONS=1 geri dönüş izni verebilir. Böylece eski publisher key ile dört Orbit ajanı kuralını baypas etme kapısı kapandı. Regresyon testli.
- Görselsiz 404 sayfası yeni TechnologyLayout'a geçirildi; gizlilik sayfasında anonim web okuması ve kimlik gerektiren Orbit ajan API'si ayrımı açıklandı.
- Genel SSR sitemap sayfa sayısı artık yalnız legacy dönem üzerinden hesaplanıyor. İzole gerçek Wrangler D1: 580 tarihsel ve bir sentetik yeni teknoloji haberi. 654 statik sitemap adresi korunup yeni habere ait yalnız bir adres eklendi; /sayfa/59/ 404, eski iki yazma ucu 410, teknoloji RSS yalnız yeni dönem, yeni haber görselsiz.
- İlk Haber production dağıtımının eski RSS doluluğu varsayımını düzeltmek için arşiv fallback URL çıkarıcı, testler ve Cloudflare deploy workflow kabul kontrolleri güncellendi. RSS boşken örnek haberi canlıya yayımlamaya gerek yok.
- Ayrıntılı sıralı koordineli yayına geçiş planı: docs/TECHNOLOGY_NEWSROOM_CUTOVER.md. Orbit catalog TTL 600 saniye, migration önce-worker sırası, ilk gerçek haber kontrolü, fail-closed rollback ve açık push/deploy onayı gereksinimi belgelendi.
- Kullanıcının canlı siteleri, main dalları, production D1 veya gerçek haber içerikleri henüz değiştirilmedi.

## 15 Kasım 2026: Sekizinci checkpoint

- Canlı Selene MCP kataloğu salt-okunur orbit_read(action=list) ile doğrulandı: Haber hâlâ eski pano eylemlerini gösteriyor. Yeni altı işlem canlıda henüz etkin değil. Kaynak koddan orbit-remote-mcp genel bağlı-site çağrı/keşif mekanizmasının işlem adlarını hardcode etmediği doğrulandı; MCP repo kod değişikliği gerekmiyor, mevcut npm run check 39/39 geçti.
- Orbit belgeleri docs/baglisite-ajan-eylemleri.md ve docs/mcp-baglisite-koprusu.md yeni teknoloji haber eylemlerine, ayrı HTTP read API'ye ve cache geçişine göre güncellendi. MCP üzerinden Selene için bağlı-site grant gerekiyor; diğer ajanlar kendi Orbit HTTP credential'ıyla bağlı-site grant olmadan okuyabiliyor.
- Cloudflare eklentisi ile üretim D1 SALT-OKUNUR kontrolü: 580 yayımlanmış eski haber mevcut; Hemera ve Selene'nin etkin publisher/sponsor eşlemesi var; technology_agent_requests henüz uygulanmamış; son migration 0011. 0012-0016 prod'da HENÜZ uygulanmadı. Worker binding kontrolü Orbit issuer/audience + D1 var, eski yazma uçlarını yeniden açan ENABLE_LEGACY_NEWS_ACTIONS binding'i yok. Production veritabanına yazma, token okuma veya deploy yapılmadı.
- Eski Orbit pano geri dönüş kodunda SQL tekrar sorgusu actor_subject alanını SELECT etmediği hâlde karşılaştırıyordu. Düzeltildi; testin SQL'i gerçekten doğrulaması sağlandı. Başka aktörün önceki tekrar yanıtını görmesini reddeden regresyon eklendi. npm run test:orbit 73/73 geçti.
- /arsiv/?sayfa=N gerçek legacy kayıt sayısının sonunu aştığında veya yanlış parametre verildiğinde 404 dönüyor; boş arşiv sayfaları indexlenmiyor. İzole Wrangler SSR + 580 arşiv haberi ile 11 rota kontrolü ve sayfa 20 içeriği geçti. 320px mobil Agent Browser'da arşiv ile Düzeltme Politikası sayfalarında taşma/görsel yok; doğru arşiv canonical query var.
- Düzeltme Politikasındaki eski küçük düzenleme kayıtlı olmayabilir beyanı güncellendi. Yeni teknoloji haberinde her düzeltmenin revision/audit kaydı olduğu, iç gerekçelerin halka açık olmadığı açıklandı.
- Henüz tamamlanmayan aşamalar: gerçek production Orbit imzasıyla staging ve dört ayrı gerçek ajan izinleri, Selene MCP'nin yeni katalogu canlıda görmesi, koordineli production migration+merge, canlı ilk gerçek haber. main ve prod değişmedi.

### Sekizinci checkpoint ek kabul kapısı

- Haber üretim GitHub Actions akışına deploy sonrası salt-okunur /orbit-actions.json kontrolü eklendi. İşlem listesi yalnız altı kanonik haber eylemi olmalı; katalog biçimi sürüm 1 kalmalı; yayımla yalnız metin, kategori, kaynaklar ve doğru altı teknoloji kategorisini içermeli. Eski pano ya da fazla alan sözleşmesiyle deploy yeşil görünmemeli. Cachebust ve no-cache header var, yönlendirme ve dış origin reddediliyor; gerçek yayın eylemi çalıştırılmıyor.
- scripts/newsroom-action-catalog.mjs ve 11 negatif/pozitif regresyon; izole Wrangler Worker'ın gerçek JSON kataloğu ile HTTP 200 doğrulandı.
- Orbit npm run verify, npm run check, gerçek çapraz-repo signer testi; Haber quality + SSR build + Wrangler dry-run, root ve worker npm audit başarıyla yeniden tamamlandı.

### Sekizinci checkpoint son güvenlik denetimi

- Herkese açık /api/orbit-eylem isteğinin imza doğrulamasından önce JSON ayrıştırırken sahte Bearer ile çok büyük gövdeleri veya null/dizi içeriği kabul edebilme açığı düzeltildi. JSON content-type zorunlu; gövde streaming read ile 160 KiB'de kesiliyor, eksik/hatalı nesne ve ek üst-seviye alanlar 400/413/415 ile reddediliyor. Böylece imza doğrulamasından önce gereksiz bellek/CPU tüketimi sınırlandırıldı.
- Altı yeni güvenlik regresyonuyla npm run test:orbit 79/79 başarılı, TypeScript typecheck yeşil. Değişikliklerin production deploy olmadan geçerli olduğunu unutma.

## 15 Kasım 2026 dokuzuncu checkpoint

- Önceki turun /tmp/haber-cp8-* test dosyaları ve derleme artıkları kontrol edildi: temiz. Haber ve Orbit feature branch'leri başlangıçta clean, main ile ayrışma conflict yok. Production verileri ve remote branch'ler değiştirilmedi.
- Kritik CI yayına geçiş boşluğu giderildi: kalite PR iş akışı artık teknoloji yayın/D1, katalog, ilk-açılış smoke ve sayfalama sınır testlerini koşuyor. PR'da gerçek SSR Worker build ve Wrangler deploy --dry-run da eklenerek statik build başarılı olsa bile Cloudflare'da kırılacak sürümün main'den önce yakalanması hedeflendi.
- Production deploy iş akışı kalite job'una paralel ve ondan bağımsız tetiklendiği için yalnız önceki iş akışının yeşili yeterli değildi. Yeni pre-migration zorunlu Orbit kimlik, technology publisher/atomic D1, katalog/ilk-açılış/sayfalama ve TypeScript testleri, Python 3.12 ile newsroom editoryal pytest adımları D1 remote migration + Worker deploy adımlarının ÖNCESİNE eklendi. Her iki GitHub Actions YAML dosyası Node yaml ile parse edildi ve ordering kontrol edildi.
- Ana teknoloji akışı ve her alt kategoride geçersiz/boş ikinci sayfa query'sinin 200 döndürmesi düzeltildi. Artık yayınlanmış gerçek D1 satır sayısına göre yalnız dolu sayfalar açılır. Boş yeni teknoloji döneminde birinci sayfa yine 200; 0, negatif, 01, bilimsel gösterim, NaN, son sayfadan ileri istekler 404. 27 birim sınır testi.
- Count API publicationEra ve techCategory'yi D1 SQL COUNT ile indeksli filtreleyebiliyor; 580 eski haber query'lerinde geriye dönük davranış korunuyor. /, /yeni/, /kategori/[slug]/ ve /yeni/kategori/[slug]/ guard edildi. En üst haberin metinsel etiketi ÖNE ÇIKAN yerine EN YENİ olarak değişti (editoryal tercih işareti yok).
- İzole Wrangler SSR D1'de 580 eski arşiv + 52 sentetik teknoloji haberiyle 24 gerçek HTTP rota sınaması, ikinci sayfa içerik kontrolü, preview noindex ve katalog 200 doğrulandı. 22 Yazılım, 30 Yapay Zekâ sentetik haberiyle kategorilerden ikinci sayfaya geçiş ve üçüncü sayfada 404 kanıtlandı. Hiçbir sentetik haber üretim veritabanına eklenmedi.
- Tam quality (664 statik sayfa), SSR build, Wrangler dry-run, root ve worker npm audit 0, Orbit npm run check, gerçek çapraz-repo ES256 signer + Haber siteAction/D1 testi hepsi geçti. Canlı ilk haber, gerçek dört ajan credential staging ve Selene MCP'nin altı yeni canlı eylemi görmesi henüz bekliyor.
- Dokuzuncu checkpoint final regresyon: izolasyon D1'sindeki 52 sentetik teknoloji haberi kaldırıldı (yalnız yerel test!). Eski 580 kayıtla Astro statik koleksiyon ve gerçek Wrangler SSR D1 HTML denklik testi tekrar edildi: **587 sayfa karşılaştırıldı, 0 atlandı, 0 fark**. Test yalnız eski arşiv, sabit sayfalar ve boş yeni dönem UI karşılaştırır. Production D1'e hiçbir yazma yapılmadı.

## 15 Kasım 2026 onuncu checkpoint

- Başlangıçta Haber feature be213d6, Orbit feature 86a6067 temizdi. AGENTS.md ve iki plan yeniden okundu; production'a push/merge/deploy yapılmadı.
- Orbit `scripts/orbit-slice4-tests.ts` gerçek lokal Worker HTTP kimlik regresyonu: `GET /v1/me/technology-news` anonim 401, askıdaki ajan 403, emekli ajan 403; aktif ama Orbit'te `read_only` yayın modlu ajan kimlik kapısını geçip Haber site client testte bulunmadığı için 503. Bu 503 beklenen staging eksikliği, gerçek canlı haber okuma kanıtı DEĞİL. `npm run test:d1:publication` 68/68 ve tam `npm run verify` geçti.
- Haber `validateTechnologyArticle`: Ajan metninde sahte `## Kaynaklar` / `## Ek kaynaklar` başlığı artık reddedilir; kaynakça yalnız yapısal `kaynaklar` URL dizisinden sistem tarafından üretilir. Aynı girdiyle `bodyMarkdown` kaynakça ekler ve `storedArticleText` yalnız oluşturulmuş kaynakça kısmını keserken gerçek metinsel `## Ayrıntılar` başlığını aynen korur. `test:technology` 15 sözleşme ve tüm SQLite/Orbit JWS E2E kontrolleri geçti.
- Haber tam `npm run quality` 664 statik sayfa, SSR build, Wrangler dry-run ve iki npm audit 0 vulnerability ile geçti. Orbit `npm run verify` site 3462/browser 855, `npm run check` 0 error/warning/hint, çapraz-repo gerçek ES256 signer + Haber D1 testi yeşil.
- Kalan: gerçek Orbit credential staging, Selene MCP'nin yeni altı eylemini ancak koordineli deployment sonrası keşfetmesi, GitHub PR/CI, üretim yedek ve izinli migration/merge. Hiçbir sentetik haber canlıya yayımlanmadı.

## 15 Kasım 2026 onuncu checkpoint: migration ve gerçek ajan HTTP güvenliği

- Orbit yerel gerçek Worker HTTP Haber okuma regresyonu: anonim 401, suspended/retired ajanlar 403, aktif ancak read_only ajan kimlik kapısını geçiyor ve izole ortamda Haber client yokken yalnız servis aşamasında 503 dönüyor. Gerçek agent bearer credential fixture'ıyla çalıştırıldı, canlı hesaba girilmedi.
- Haber sözleşmesi ajan metni içine Kaynaklar veya Ek kaynaklar başlığıyla sistem kaynakçasını taklit etmeyi reddediyor. Yetkili kaynakça yalnız yapısal kaynak URL'lerinden oluşturulur. Full-text API roundtrip, haberin gerçek alt başlıklarını korurken oluşturulmuş kaynak bölümünü tekrarlamıyor. Sözleşme 15 test ve D1/Orbit JWS yayın E2E yeşil.
- Gerçek migration SQL'ini SQLite üstünde çalıştıran beş ayrı Hemera sponsor durum testi eklendi: geçerli, eksik, devre dışı, yayın yetkisi olmayan, sponsor bağlantısı olmayan. Nyx/Asteria publisher ve insan yönetici kaydı yalnız geçerli bağda tohumlanıyor; mevcut Selene kaydı korunuyor. Publisher ile author label eşleşmezse release blocked. 58 SQL/migration kontrolü geçti.
- Kritik release kapısı: üretim migration'ları bittikten sonra yeni Worker deploy edilmeden önce yalnız SELECT yapan D1 aggregate doğrulaması. Dört doğru Orbit actor ve yazar adı aynı sponsorla, bir insan yönetici ve iki atomik tekrar koruma tablosu, minimum 580 tarihsel kayıt zorunlu. Pairwise subject veya token döndürülmüyor. Herhangi biri eksikse deploy durur.
- Gerçek local Wrangler D1 --json çıktısıyla boş yetki seti BLOCKED, dört doğru publisher + insan admin + 580 tarihi kayıt READY, yanlış publisher adı BLOCKED denendi. Parser 15 pozitif/negatif test geçti. GitHub Actions iki workflow YAML parse ve migration sonrası, deploy öncesi gate ordering kontrol edildi.
- Orbit çapraz-repo testinde gerçek ES256 Orbit signing ile Haber siteAction üzerinden altı imzalı istek: ilk teknoloji döneminde boş liste başarıyla dönüyor, geri çekilmiş teknoloji haberinin tam metni 404, kaynaklı haber okuma ve eski arşiv izolasyonu sağlam.
- Haber full quality 664 sayfa, SSR ve Wrangler dry-run; Orbit full verify 3462 site / 855 browser, check 0 ve çapraz-repo test yeşil. Production ve main değiştirilmedi; gerçek credential staging, Selene MCP canlı katalog, onaylı PR/merge/deploy sonraki aşama.

## 15 Kasım 2026 on birinci checkpoint

- Görev kaydı ve AGENTS.md tekrar okundu, iki yerel feature branch başlangıçta temizdi; canlıya veya main'e dokunulmadı.
- Orbit'in Haber'den imzalı haber okuma yolu sertleştirildi: tek haber/liste yanıtı en fazla 256 KiB gerçek stream byte, 15 saniyelik HTTP zaman aşımı; büyük içerik, bozuk JSON/UTF-8, yanlış nesne ve cevap vermeyen upstream güvenli 502 dönüyor. Upstream hata gövdesi ve özel hata metni ajana sızdırılmıyor. Real ES256 transport regresyon testlerine 4 başarısız upstream durum eklendi.
- Haber action katalog indirme yolu da genel Orbit connected-site katmanında 128 KiB gerçek stream byte ve 12 saniye HTTP zaman aşımıyla güvenceye alındı. Aksi halde haber yanıtı timeout'u önceki katalog indirmesini korumuyordu. Katalog testlerinde body header, stream taşması, bozuk JSON, UTF-8 ve HTTP status negatif durumları sınandı.
- Birlikte dağıtım kabul testi Haber scripts/orbit-technology-release-check.mjs: yalnız anonim kamu GET ile Orbit OpenAPI 3.2'de iki yeni credential-protected haber okuma rotası ve altı kategori hazır mı, anonim /v1/me/technology-news isteği 401 mi doğruluyor. Sekiz pozitif/negatif test. Token, grant veya üretim haberi gerekmez. Haber production CI postdeploy smoketest'e eklendi; canlıda henüz çalıştırılmadı.
- Orbit OpenAPI iki haber GET rotası için bozuk/time-out Haber yanıtı 502 ve konfigürasyon eksikliği 503 ayrımını açıkça belirtir; ajan skill.md kaynağına da aynı retry rehberi eklendi; OpenAPI normatif schema testi ve yeni auth/hata doküman regresyonu geçti.
- Haber tam quality (664 sayfa), SSR build ve Wrangler dry-run; Orbit tam verify (3462 site / 855 browser), check 0 error/warning/hint, crossrepo gerçek ES256 altı imzalı okuma ve prod config check 85 doğrulama geçti. Gerçek production credential staging, 4 yayıncı gerçek hesap smoke, Selene MCP yeni altı katalog eylemi ve onaylı PR/merge/deploy halen bekliyor. Hiç üretim verisi değişmedi.

## 15 Kasım 2026 on ikinci checkpoint: D1 kurtarma önkoşulu

- Başlangıçta Haber d8f4b5e ve Orbit 4ab5e4f temizdi; AGENTS ve koordineli yayın planı yeniden okundu.
- Cloudflare plugin SALT-OKUNUR canlı D1 sorgusu: version=production ve Time Travel bookmark mevcut. Bookmark/token/sponsor herhangi bir log veya repo dosyasına yazılmadı. Restore çalıştırılmadı.
- Cloudflare resmi belgeleri: Free 7 gün, Paid 30 gün otomatik Time Travel saklama; hesabın planı tahmin edilmedi. Restoring tüm DB'yi yıkıcı biçimde geriye alır; kod rollback ile aynı değildir.
- Haber GitHub üretim akışına D1 migration'ları ÖNCESİNDE Wrangler Time Travel bookmark varlık kapısı eklendi. Başarısızsa migration başlamaz; gerçek bookmark yazdırılmaz, yalnız UTC kurtarma referans zamanı GitHub job summary'de tutulur. Unit testleri 13/13 ve YAML sıra denetimi başarılı.
- Tam gerçek 580 arşiv haberi, kaynaklar ve etiketlerle eski 0001-0011 yerel SQLite schema üzerinde bellek içi snapshot alındı. Yeni migration 0012-0016 ve sentetik teknoloji haberi uygulandı, sonra snapshot geri açıldı. 580 tarihsel haber içerik hash ve kaynak ilişkileri aynı, sentetik haber kayboldu, eski şema ve SQLite bütünlüğü doğrulandı. Bu yerel test Cloudflare'ın gerçek production Time Travel RESTORE sonucunu garanti etmez.
- D1 recovery için yeni runbook: Worker kod geri dönüşünü önceliklendirme, başarısız migration fail-closed, sonradan yazılan gerçek kayıtların silinme riski, bağımsız export ve açık yıkıcı işlem onayı. Production export/restore ve gerçek ajan staging henüz yapılmadı.

### On ikinci checkpoint: legacy yetkilerin salt-okunur ön denetimi

- Canlı Haber D1'de anonim/özel anahtarları okumadan sadece sayım yapıldı: eski publisher-key digest'leri 0, aktif eski publisher-key 0. Başka bir migration ile zaten kullanılmayan key'leri silmek gereksiz görüldü; migration 0017 EKLENMEDİ.
- Bir etkin insan publisher satırı hâlâ mevcut. Eski Worker üretimde olduğu sürece insan Orbit ID token'ıyla eski yayın ucu kullanımı teorik olarak açık kalabilir; otomatik yayının dondurulması bu nedenle operasyonel yayın koşulu. Yeni sürümde eski iki HTTP uç varsayılan 410; yedek bookmark alınması eski Worker'daki yayın kapısını kendiliğinden kapatmaz.

### On ikinci checkpoint: Orbit-Haber farklı sürüm penceresi

- Orbit tarafına izole katalog geçiş testi eklendi: yeni Orbit + eski Haber kataloğu 503, 600 saniye dolmadan eski cache 503, süre dolunca yeni Haber kataloğu ile 200 boş haber listesi, Haber eski kataloğa rollback olunca yeniden 503. Hiç gerçek ajan credential veya üretim haberi kullanılmadı. Eski pano eylemi asla yeni okuma yerine çalıştırılmadı.

## 15 Kasım 2026 on üçüncü checkpoint, bağımsız yedek provası

- Time Travel bookmark bağımsız yedek olmadığı için ayrı SQL export doğrulayıcısı eklendi. Production yedeği alınması hâlâ ayrı izin ve güvenli saklama gerektiriyor.
- scripts/d1-export-integrity.mjs: D1 SQL yedeğini yalnız bellek içi SQLite'a yükler; en az 580 tarihsel yayımlanmış haber, her haberin kaynağı, kopuk kaynak/slug, migration geçmişi, integrity ve foreign key kontrolü. İçeriği, hassas hesap ve kaynak satırlarını loglamaz.
- SQLite authorizer kötü niyetli ATTACH/DETACH komutunu reddediyor; host üzerinde başka dosya oluşturmuyor. 9 pozitif/negatif bütünlük/güvenlik testi geçti.
- Gerçek yerel Wrangler D1 --local export dosyaları üzerinde eski şema (0011) ve yeni şema (0016) kontrol edildi: 580 haber, 590 kaynak ve migration geçmişi temiz. Üretim D1'e export çağrısı yapılmadı.
- npm run test:d1-export-integrity ve GitHub kalite/production göç öncesi testleri eklendi. Gerçek production export için ancak onaylı operatörün uygulayacağı özel depolama + doğrulama prosedürü cutover dokümanına yazıldı.

### On üçüncü checkpoint: dağıtım sırası ve yedek bütünlüğü güçlendirmesi

- Bağımsız yedek doğrulayıcısı artık satır sayısıyla yetinmez: kaynak koleksiyonundaki 580 tarihsel slug'ın **tamamının** yedekte yayımlanmış eski haber olarak bulunmasını, her birinin kaynaklarını, migration dosya ADLARINI ve teknoloji dönemi tablolarını doğrular. Aynı sayıda ama farklı haberleri içeren yanlış backup reddedilir.
- D1 SQL doğrulayıcısına SQLite authorizer ATTACH/DETACH ve load_extension reddi eklendi; zarar verebilecek dosya yan etkileri engellendi. 14 pozitif/negatif birim test ve gerçek yerel Wrangler export ile hem 0011 hem 0016 şeması başarılı.
- Haber üretim akışındaki önemli sıralama riski kapatıldı: Orbit'in yeni iki güvenli Haber GET rotasını ve anonim 401 kontrolünü doğrulayan PUBLIC GET testi artık **D1 migration'dan ÖNCE** zorunlu. Yanlış sırayla sadece Haber merge edilirse migration başlamaz; aynı test deploy sonrası da korunur. Canlı Orbit henüz eski olduğundan bu kapı şu an bilinçli olarak başarısız olacak.
- scripts/technology-deploy-order-tests.mjs GitHub Actions YAML'deki Orbit ön koşulu -> Time Travel -> migration -> yayıncı/admin doğrulama -> Worker deploy -> canlı kabul sırasını doğrular; yedi farklı kritik gate bozulmasını bilinçli mutate edip reddeder. 8 kontrol geçti. Kalite ve deploy pre-migration birim testlerine eklendi.
- Orbit çapraz-repo testine hazırlanan sahte OpenAPI örneği yerine **gerçek Orbit agentApiContract ile Haber'in gerçek release-contract doğrulayıcısı** bağlandı; iki ajan-korumalı GET, altı kategori ve altı gerçek JWS haber okuma isteği başarılı. Production ve gerçek token kullanılmadı.

## 15-16 Kasım 2026 on dördüncü checkpoint: tekrarlı dağıtım

- İleri D1 migration başlamadan ÖNCE eski 0011 şemasına uyumlu salt-okunur yayıncı ön kontrolü eklendi: Hemera/Selene yetkisi ve ortak sponsor, yanlış imza, devre dışı eski anahtar, beklenmeyen önceden kayıtlı Nyx/Asteria, kopuk kaynak, 580 tarihsel yayımlanmış haber ve migration geçmişini denetler.
- İlk geçişten sonraki main güncellemelerini bozmamak için aynı ön kontrol tam 0016 şemasını ve dört geçerli yayıncıyı da kabul ediyor; yarım kalmış 0012-0015 veya bilinmeyen 0017+ otomatik devam etmiyor. 27 gerçek SQLite güvenlik sınaması geçti.
- Gerçek yerel Wrangler 0011 -> 0016 göçü ve ardından ikinci no-op deployment ön kontrolü başarılı; sahte sponsor uyumsuzluğu BLOCKED. Canlı D1 yalnız Cloudflare plugin SELECT ile okundu: iki sağlam eski publisher, sıfır beklenmeyen Nyx/Asteria kaydı, sıfır aktif eski anahtar, 11 migration, 580 yayımlanmış tarihsel haber, sıfır kopuk kaynak.
- Postmigration readiness SQL'i 580 tarihi satırı değil, 580 yayında olan legacy URL'yi sayıyor. Soft-withdrawn tarihsellik yanlış başarıya yol açmıyor; 60 gerçek SQL migration kontrolü geçti.
- Üretim CI sıra testinde Wrangler SSR gerçek deploy komutunun bulunması da zorunlu hale getirildi; önceki test bu satır kaldırılınca yanlışlıkla yeşil geçiyordu.
- Plan checkbox'larında yerel tamamlanan fazlar işaretlendi, gerçek staging/MCP/üretim işleri halen açık bırakıldı.

## 16 Kasım 2026 on beşinci checkpoint: tam eski URL koruması ve yayın kabulü

- Üretim öncesi/sonrası D1 kabulü yalnız 580 toplam eski haber sayısına bakıyordu. Yeni scripts/technology-legacy-permalinks.mjs, src/content/equinoxHaber içindeki **580 kanonik Markdown slug'ını** tek tek salt-okunur SQL ile eşleştirip dışarıya sadece üç sayım döndürüyor: beklenen, yayındaki ve kaynağı bulunan 580 URL. Göç sonrası sorguda ayrıca publication_era=legacy şartı var.
- 32 yerel SQLite, slug değiştirme, tek haberin taslağa alınması, yanlış kaynak, yanlış dönem ve bozuk JSON/CLI güvenlik testi yeşil. GERÇEK yerel Wrangler 0011 ve 0016 D1 sorgularında 580/580 READY, tek tarihsel haberi taslağa çekince 579/580 BLOCKED.
- Aynı public-slug SQL'i Cloudflare plugin üzerinden GERÇEK canlı Haber D1'de SADECE SELECT olarak çalıştırıldı: expected=580, published=580, sourced=580. Gizli satır, token veya haber gövdesi döndürülmedi; production'a yazılmadı.
- Github deploy now checks exact 580 URL before migration and again after migration before Worker deployment; temp SQL files trap ile temizlenir. CI gate mutation/order testleri 14 kontrol başarılı.
- Üretim sonrası test eski iki HTTP yazma ucunu da 410 Gone şartıyla kapatıyor (hem /api/brief hem /api/publish) ve bilinmeyen haber yolu 404 olmalı. Ağ kontrolleri 5 saniye bağlantı, 15 saniye toplam HTTP timeout alıyor.
- Orbit OpenAPI ve Haber altı-eylem katalog smoke kontrolleri, sınırsız response.text()/json() yerine boyutu streaming sırasında sınırlanan güvenli JSON okuyucuya geçti. Hatalı JSON, UTF-8 ve taşan yanıt kullanıcıya/CI günlüğüne ham içerik sızdırmadan reddediliyor.
- Canlı Orbit yeni API henüz yayınlanmadı, üretim backup export/gerçek credential staging ve Selene MCP canlı keşif hala onaylı release aşamasında. Ana dallara push veya production deploy yapılmadı.

## 16 Kasım 2026 on altıncı checkpoint: kimlik ve erişilebilirlik güvenliği

- Haber scripts/orbit-technology-release-check.mjs OpenAPI security listesinin OR semantiğine göre sıkılaştırıldı. Her iki GET işlemi yalnız tek HTTP Bearer agentCredential gerektirmeli; anonim alternatif, başka kapsam veya auth şeması kabul edilmez. Hem liste hem tekil haber anonim GET çağrısı 401 dönmeli. Yanlış açık tekil haber rotası negatif testte reddedildi.
- Haber Orbit ES256 anahtar keşfi worker/src/identity.ts içinde 8 sn HTTP timeout, yalnız HTTPS ve Orbit issuer-origin JWKS, redirectsiz fetch, streaming boyut sınırları (32 KiB keşif / 64 KiB JWKS), en fazla 16 anahtar ve sanitize edilmiş 503 ile güvenceye alındı. Gerçek kriptoyla sahte issuer, farklı JWKS host, redirect, bozuk JSON, aşırı büyük yanıt ve normal key rotation kontrolleri başarılı.
- Canlı Orbit kamu OIDC keşfi SADECE GET ile doğrulandı: issuer ve JWKS origin kanonik alan adıyla eşleşiyor; özel anahtar veya erişim token'ı alınmadı.
- Yeni görselsiz layout tema toggle düğmesi ilk yüklemede aria-pressed değerini kayıtlı/sistem tercihine göre doğru belirliyor. Sistem teması değişimi ve kapalı tarayıcı depolaması dahil gerçek Astro JS'ini çalıştıran 15 erişilebilirlik testi başarılı.
- Gerçek Orbit OpenAPI ile Haber doğrulayıcısını kullanan çapraz repo testinde altı imzalı JWS okuma yine geçti. Üretim ajan credential staging, Selene MCP canlı katalog ve onaylı deployment hala bekliyor.

### On altıncı checkpoint: imza anahtarı fixture uyumu

- Daha sıkı OIDC discovery issuer doğrulaması tam kalite turunda iki eski izole test fixture'ını bilinçli biçimde kırdı: worker/tools/technology-publication-tests.mjs ve Orbit scripts/orbit-haber-cross-repo-tests.ts sahte JSON'larda jwks_uri sunuyor fakat issuer alanını eksik bırakıyordu. Gerçek canlı Orbit OIDC keşfi bu alanı zaten doğru taşıyor. Güvenlik kontrolü gevşetilmedi; iki test fixture'ına gerçek OIDC issuer eklendi. Böylece Haber local publisher JWS E2E, Orbit gerçek modüllerle imzalı cross-repo altı okuma tekrar yeşil.
- Başka repo kodu veya API sözleşmesi değiştirilmedi. İmza anahtarı fetch katmanı böylece hem doğru sağlayıcı kimliğini hem yanlış host/redirect/büyük response sınırlarını production'da denetlemeye devam edecek.

### On altıncı checkpoint: canlı kamu OIDC uyumluluğu ve negatif mutasyon kanıtı

- Canlı Orbit kamuya açık discovery 842 bayt, JWKS 193 bayt ve 1 açık doğrulama anahtarı içeriyor. Yeni 32/64 KiB streaming ve 16 anahtar limitlerinin altında, GET dışında işlem veya özel anahtar erişimi yok.
- Testlerin doğru nedenle başarısız olup olmadığını görmek için OpenAPI anonim security alternatifi, JWKS dış origin reddi ve tema ilk aria-pressed sync korumaları yerelde birer kez geçici bozularak sınandı. Her üç gerçek test RED oldu; kaynaklar geri alınınca üçü de GREEN. Geçici kopyalar silindi.

### On altıncı checkpoint: bozuk JWT imzasının güvenli reddi

- Açık /api/orbit-eylem HTTP ucunda geçerli başlık/gövdeyle gelen ama hatalı Base64URL imzalı JWT, doğrudan atob/WebCrypto üzerinden uncaught exception üretebiliyordu. JWT 8 KiB ile sınırlandı; gerçek ES256/P-256 imzası 64 bayt olmalı, bozuk/boş/kısa/uzun imza veya WebCrypto istisnası kontrolsüz 500 yerine 401 alıyor.
- Gerçek WebCrypto ile üretilmiş token'lar üzerinden beş yeni olumsuz kontrol eklendi. worker/tools/orbit-token-tests.mjs 65/65 ve imzalı teknoloji yayın E2E tekrar başarılı; gerçek kullanıcı/token/canlı veritabanı kullanılmadı.

## 16 Kasım 2026 on yedinci checkpoint: JWT null, süre ve JWKS eşzamanlılığı

- Haber doğrulayıcısına imzasız bir null JSON JWT header verildiğinde TypeError ile hata fırlatıldığı yerelde gerçekten yeniden üretildi. Header ve claims değerleri null/dizi/ilkel tipse artık 401 dönülüyor. Gerçek /api/orbit-eylem HTTP giriş noktası testi de 401 ve 0 DB yazımı kanıtlıyor.
- Orbit'in 60 saniyelik imzalı eylem belgesi sınırı Haber tarafında doğrulanıyor: geçerli tam 60sn eylemi kabul, eksik/geçersiz iat, exp < iat, 61sn veya çok uzun eylem reddediliyor. Normal uzun ömürlü OIDC ID token sözleşmesi değişmedi.
- Geçersiz ECDSA imza biçimi JWKS'e ağ isteği atmadan reddediliyor. Altı paralel bilinmeyen kid isteği eskiden 6 keşif + 6 JWKS indirmesi başlatıyordu (RED ile kanıtlandı); artık tek bir devam eden fetch paylaşılarak 1+1 yapılıyor (GREEN). Cached anahtarlar servis kesintisinde çalışmayı sürdürüyor; aynı anda beş JWKS outage isteği tek 503 kaynağına indiriliyor ve hata sonrası yeni deneme tekrardan ağ isteği yapabiliyor.
- WebCrypto gerçek imza ve yerel API negatif testleri 88 kimlik ve 82 eylem kontrolü geçti; teknoloji yayın E2E de başarılı. İki repo ve ana üretim verileri izinsiz değiştirilmedi; gerçek credential/staging ve release onayı hâlâ bekleniyor.

### On yedinci checkpoint: gerçek yerel HTTP kabulü

- Yeni SSR Worker gerçek yerel Wrangler üzerinde çalıştırıldı; yalnız izole test sunucusuna kamuya açık Orbit issuer adresi verildi. HTTP POST /api/orbit-eylem, JSON null JWT header karşısında 401 ve sanitize edilmiş hata döndürdü (eski kod 500 üretebiliyordu). İlk deneme yerel ORBIT_ISSUER eksikliği nedeniyle güvenli 503 döndü; üretim binding'i veya canlı veri değiştirilmeden yerel test konfigürasyonu düzeltildi. Sunucu, test D1 state'i ve geçici dosyalar kapatılıp silindi.

### On yedinci checkpoint: negatif mutasyon ve HTTP son doğrulama

- Eylem JWT süresini kontrol eden koşul geçici olarak 60 saniyeden 6000 saniyeye gevşetildi. Gerçek JWT testi hem 61 saniyelik hem aşırı uzun eylemin yanlış kabulünü RED olarak yakaladı. Kaynak geri alındı, testler 88/88 tekrar GREEN; geçici kopya silindi.
- Tam Haber quality, 664 statik sayfa, SSR derleme, Wrangler --dry-run, root ve worker npm audit 0; Orbit verify (3462 site/855 browser), check (219 dosya 0 hata), gerçek iki-repo ES256 6 okuma ve production config 85 başarıyla tamamlandı.
- Testler yalnız yerel ve kamuya açık test fixture üzerinde yapıldı. Kullanıcı onayı gerektiren gerçek prod D1 export, Orbit/Haber PR-merge-deploy, gerçek ajan credential staging ve Selene MCP canlı keşfi hâlâ bekliyor.

## 16 Kasım 2026 on sekizinci checkpoint: gerçek 60 saniyelik imza süresi

- Ortak OIDC doğrulayıcısının 60 saniyelik exp toleransı, yeni Orbit eylem belgesinin yalnız exp - iat <= 60 şartıyla birleştiğinde fiilen yaklaşık 120 saniyelik kullanım penceresi oluşturuyordu. Yerel gerçek ES256 JWT testi bu hatayı doğruladı: 1 ve 20 saniye önce sona eren eylemler kabul ediliyordu; 30 saniye sonraya düzenlenen belge de erken kabul ediliyordu.
- Haber'in action-specific doğrulamasına exp > now kesin süre sonu şartı ve yalnız başlangıç tarafında 5 saniyelik küçük saat toleransı eklendi. Normal OIDC ID token saat toleransı korunuyor. Gerçek 60 saniyelik eylem ve küçük saat farkı kabul ediliyor.
- Kesin süre sonu koşulu geçici olarak silindiğinde yeni negatif regresyonlar RED, geri konduğunda 92/92 GREEN. İzole teknoloji yayın E2E yine başarılı. Hiçbir üretim token'ı veya veritabanı kaydı kullanılmadı.
- Wrangler D1 execute --file komutu GitHub'ın kullandığı .sql uzantısız mktemp dosyasıyla da gerçek yerel Wrangler üzerinde başarıyla test edildi; prod D1 etkilenmedi.

### On sekizinci checkpoint: sabit sayfayla çakışan haber URL'leri

- Haber yayımlarken slug yalnız articles tablosunda kontrol ediliyordu. Örneğin geçerli başlıklı "İletişim" haberi 201 ile DB'ye yazılabiliyor, ama /iletisim/ statik iletişim sayfasının adresi olduğundan haberin gerçek URL'sinde iletişim sayfası görünüyordu.
- Yeni teknoloji yayını kök statik sayfalar ve SSR injectRoute namespace'leri için reserved slug listesi kullanıp böyle başlıkları D1'e yazmadan 422 ile reddediyor. worker/tools/technology-publication-tests.mjs gerçek src/pages ve astro.config.ssr.mjs dosyalarını tarayarak yeni rota eklenip rezervasyon unutulursa kırılıyor.
- Yayın guard'ı kapatılınca /iletisim/ haberi testte 201 döndü (beklenen 422 yerine RED); reserved listesinden iletisim çıkınca Astro route testi RED. Her iki değişiklik geri alındığında gerçek D1+JWS yayın testi GREEN. Eski 580 URL ve içerik değişmedi.

- Gerçek yerel SSR HTTP provasında önce boş izole D1 şeması nedeniyle 500 çıktı. Ardından aynı test veritabanına Wrangler ile 0001-0016 migration'ları uygulanınca /iletisim/, /hakkimizda/, /yazarlar/ üçü de 200 döndü. /iletisim/ HTML başlığı sabit iletişim sayfasını doğruladı; bu da çakışmanın gerçek rota düzeyinde yaşandığını gösteriyor. Yerel sunucu ve geçici D1 temizlendi, prod etkilenmedi.

## 16 Kasım 2026 on dokuzuncu checkpoint: staging mimari engeli

- İki yerel repo ve mevcut staging/deploy yapılandırmaları salt-okunur incelendi. Orbit'in var olan staging Worker'ı ayrı workers.dev issuer'ına ve ayrı D1'e sahip. Ancak yeni Haber okuma köprüsündeki HABER_SITE_CLIENT_ID / ORIGIN / ACTION_URL sabitleri yalnız PRODUCTION Haber adresine işaret ediyor. Haber'in wrangler.ssr.jsonc dosyası da production custom domain ve production D1 içeriyor.
- Dolayısıyla Orbit'in mevcut staging:verify ve staging:slice4:e2e kontrolleri, yeni Haber 2.0 için iki gerçek staging Worker arasında imzalı ajan okuma kabulü yapmış sayılmaz. Staging isteğini production Haber'e yönlendirmek doğru veya yetkili bir test yöntemi değildir.
- Gerçek staging için ayrı Haber staging Worker ve staging D1; staging issuer/audience ve ayrı site client kaydı; yalnız staging'de çalışan sabit, fail-closed first-party hedef seçimi; staging ajan kimliğiyle iki-Worker gerçek HTTP; anonim/askıdaki ajan ve yetkisiz yazmanın reddi; 580 eski URL kabulü gerekir. Production hedef sabitleri asla istekten veya dinamik grant'ten seçilemez.
- Bu aşama onay ve staging kaynakları/kimlik bilgileri gerektiriyor. Hiçbir staging/production deploy, credential veya D1 yazımı yapılmadı; bu aşamanın tamamlandığı iddia edilmedi.

## 16 Kasım 2026 yirminci checkpoint: bağımsız D1 yedek onayı

- Main otomatik üretim deploy'u eskiden yalnız Time Travel kontrolüyle forward-only D1 migration başlatabiliyordu; bağımsız SQL yedeğinin onayını zorunlu tutmuyordu.
- Yeni fail-closed deploy kapısı, eski 0011 şemasından 0016'ya veya daha sonra eklenen bir migration'a geçerken yalnız gerçek main commit SHA'sı, son 3 saatlik UTC onay zamanı ve bağımsız SQL yedeğinin 64 haneli SHA-256 değeriyle ilerler. CI yedek dosyasını görmez; bu ancak gerçek yedek+offline integrity+restore yapıldıktan sonra girilmesi gereken OPERATÖR onayıdır.
- D1 preflight mevcut canlı şemayı okuyup local migration listesini kontrol ediyor. Geçerli 0016 ve bekleyen migration yoksa normal deploy yedek onayını yeniden istemez; yeni 0017 dosyası veya eski 0011 yeniden onay gerektirir; çıktı yoksa fail-closed.
- GitHub production environment değişkenleri ve operatör adımları docs/TECHNOLOGY_NEWSROOM_CUTOVER.md'de açıklanıyor. Main'e ilk merge sonrası workflow bilinçli biçimde durabilir; gerçek main SHA için onay girildikten sonra elle tekrar çalıştırılmalıdır. Bu aşamada canlı D1 yedeği alınmadı, üretim verisi değiştirilmedi.

- Gerçek migration klasörüne geçici 0017 test dosyası eklenerek üretim preflight CLI'si sınandı: 0016 tamamlanmış ve bekleyen migration yokken backup_required=false, yerel 0017 dosyası eklenince backup_required=true. Geçici SQL dosyası ve sonuçlar silindi. Gerçek üretim D1'e erişilmedi.

## 16 Kasım 2026 yirmi birinci checkpoint: Orbit staging hedef izolasyonu

- Orbit'in yerel Haber 2.0 feature dalında readHaberAsOrbitAgent için fail-closed staging hedef ayrımı yapıldı. Production hâlâ sabit haber.sametbasbug.dev ve orbit-haber site client'ına bağlı. Sadece ORBIT_ENVIRONMENT=staging, bilinen staging issuer ve açıkça doğrulanmış aynı Cloudflare hesabının haber-...-staging.samett33710.workers.dev HTTPS origin'i varsa ayrı orbit-haber-staging client ID kullanılır. Kullanıcı/ajan isteği hedef seçemez; local/test/eksik/yanlış staging konfigürasyonu production'a fallback yapmaz.
- Gerçek ES256 imzalı staging issuer/audience ve iki repo arasında gerçek Haber siteAction doğrulayıcısıyla 3 staging okuma, kaynak URL'leri, gizli site grant'e ihtiyaç duymayan ajan, bilinmeyen 404, DB write yok ve production'a ağ isteği yokluğu izole bellekte sınandı. Üç kasıtlı güvenlik mutasyonu RED, restore GREEN. Production imzalı altı-okuma testi değişmeden geçti.
- BU CANLI STAGING DEĞİLDİR. Haber staging Worker/D1 ve staging site client hâlâ açılmadı, wrangler.staging.jsonc'a hedef konmadı, gerçek ajan bearer ile kabul yapılmadı. Dış kaynak/credential/deploy için ayrıca açık yetki gereklidir.

- Ek staging kayıt detayı: Orbit site-client declaration environment şeması staging değerini desteklemiyor, staging client ayrı orbit-haber-staging kimliğiyle development olarak kayıt edilecek. Redirect URI, openid scope, action ve katalog adresleri ayrı staging origin'iyle eşleşmeli; gerçek kayıt henüz yok.
- Üretim kodunda da bilinen üretim Orbit issuer kontrolü eklendi. Yanlışlıkla ORBIT_ENVIRONMENT=production yazılmış olsa bile staging issuer'ı ile production Haber'e imzalı token gitmesi 503 ile engelleniyor. Canlı/dark-launch üretim issuer seçenekleri destekleniyor.

## 16 Kasım 2026 checkpoint 22: staging Wrangler güvenli kaynak ayrımı

- Production wrangler.ssr.jsonc canlı D1/R2 ve custom domain taşıdığı için staging kurulumunda yanlış kullanılmamalı. Yeni salt-okunur scripts/technology-staging-config-check.mjs gelecekte onayla sağlanacak staging JSONC dosyasını GERÇEK production config ile kıyaslıyor. Worker adı tam haber-site-staging; ayrı DB UUID, ayrı haber-gorseller-staging R2, yalnız workers.dev ve staging Orbit issuer/audience/client zorunlu. Production D1/R2, custom domain, cron, inline secret ve legacy override reddediliyor.
- Kontrol npm run test:staging-config ile local quality, PR quality ve production ön-migration testlerinde zorunlu. 34 pozitif/negatif sınama, gerçek CLI provası, production D1 UUID'si ve R2 redleri mevcut. D1-ID/issuer/domain korumaları tek tek kaldırıldığında testler RED, kaynaklar geri alınınca GREEN. Orbit cross-repo staging testi Haber validator'ını gerçekten import edip iki repo arasında staging Worker origin ve client ID tutarlılığını kanıtlıyor.
- Yeni staging D1, R2, Worker, Orbit site client veya gerçek staging config HENÜZ oluşturulmadı. Dış provisioning, remote migration, secret ve deployment için ayrı onay gerekiyor. Gerçek staging kabulünde staging build canonical/noindex ve gerçek aktif/suspended ajan testleri ayrıca zorunlu.

- Ayrıca gerçek Cloudflare Wrangler ile geçici saf staging JSONC dosyası oluşturulup deploy --dry-run denendi. Bundle başarılı; staging DB/R2 ve orbit-haber-staging audience görünür; Wrangler --dry-run ile sonlandı. D1 UUID'si sentetikti, geçici config silindi, canlı deploy/D1/R2 yapılmadı.

## 16 Kasım 2026 checkpoint 23: staging bağlantıları ve SEO ayrımı

- Gerçek ES256 iki-repo staging testi Haber API'sinin URL alanının üretim adresini döndürdüğünü RED olarak ortaya çıkardı. Yeni haber yayını, liste ve detay URL'leri artık doğrulanmış Orbit issuer ve audience ikilisine bağlı. Staging ayrı staging adresini, production üretim adresini üretir; yanlış/çapraz kimlikler reddedilir. Gerçek staging ve production signed crossrepo testleri GREEN; URL'yi eski sabite çevirme mutasyonu RED.
- Yeni build:staging komutu ayrı ve doğrulanmış staging config zorunlu kılıyor. Site canonical ve haber adreslerini staging'e ayarlıyor; iki Astro layout noindex meta veriyor, üretilmiş robots.txt Disallow / ve _headers X-Robots-Tag noindex içeriyor. Production public/robots.txt dokunulmadan kalıyor. Staging SSR middleware gerçek staging Orbit issuer/audience kontrolünden sonra tüm yanıtları noindex işaretliyor, yanlış konfigürasyon 503.
- 22 SEO testi quality, PR ve production ön-migration akışında; Allow / mutasyonu RED. Gerçek izole yerel Wrangler staging HTTP testinde /, /hakkimizda/, /arsiv/, /robots.txt ve sitemap 200, staging canonical/noindex/Disallow doğru. Normal production SSR ayrı yerel D1 ile yeniden sınandı: production canonical, index ve Allow / korunuyor. Geçici sunucular ve local D1 temizlendi. Canlı staging veya production değişmedi.

- Çalışma anı ikinci koruma gerçek yerel HTTP ile negatif test edildi: staging build'e kasıtlı yanlış production audience verildi; yapılandırma denetleyicisi reddetti, yalnız local Worker'da denendiğinde /, /hakkimizda/, /arsiv/ 503, no-store ve noindex döndü. Production/staging uzaktaki kaynaklara erişilmedi.

## 16 Kasım 2026 checkpoint 24: gizli staging kaynak bağı engeli

- Staging Wrangler doğrulayıcısındaki gerçek boşluk altı farklı yerel config ile gösterildi: production D1'i preview_database_id, production R2'yi preview_bucket_name olarak vermek veya üretim Worker service binding, ek KV, asset ayarı ve account_id eklemek eski doğrulayıcıdan HATALI şekilde geçiyordu.
- Artık staging top-level ve iç içe D1/R2/assets anahtarları tam allowlist ile doğrulanıyor; ek service/KV/queue/preview/live kaynaklar ve beklenmeyen compatibility flag yasak. Meşru yeni ayar olursa bilinçli inceleme ve test gerekiyor. 49 olumlu/olumsuz durum ve gerçek CLI testleri yeşil; top-level, D1 ve R2 korumaları kasıtlı kaldırıldığında RED ve restore GREEN.
- İzole yerel Wrangler staging Worker tam 0016 D1 migrasyonlarıyla çalıştırıldı. robots.txt, orbit-actions.json, favicon, Astro CSS, iki sitemap, ana sayfa, hakkimizda ve 404 dahil dokuz gerçek HTTP yanıtının tamamında X-Robots-Tag noindex doğrulandı. İlk D1'siz provadaki sitemap 404 eksik yerel migrasyondan kaynaklanıyordu; tam D1 ile 200 doğrulandı.
- Denetim, repodaki üretim config ile kıyaslar; canlı Cloudflare resource inventory kanıtı değildir. Gerçek staging açılmadan önce ayrı yetkili operatör canlı hesap/D1/R2 kimliklerini de kontrol etmeli. Üretim veya gerçek staging kaynaklarına bu turda dokunulmadı.

- CP24 ek bulgusu: PUBLIC_HABER_STAGING=true bayrağı üretim PUBLIC_SITE_URL ile kullanıldığında SSR ve statik Astro config daha önce derlemeyi hatalı kabul ediyordu. Artık SSR staging bayrağı yalnız iki URL de staging adresiyse, production bayrağı yalnız production URL'leriyse geçer. Statik Pages derlemesi staging bayrağını ve staging URL'lerini reddeder. GitHub'ın dört production build adımında bayrak açıkça false. 9 gerçek config import senaryosu ve 2 negatif koruma mutasyonu RED/GREEN; deployment ordering regresyonu bunları CI YAML'ında da denetliyor. Bu kontrol gerçek D1/R2 izolasyonu ve backup onayının yerine geçmez.

## 16 Kasım 2026 checkpoint 25: staging/production derleme paketleri ayrıldı

- Gerçek yerel negatif prova, staging noindex/Disallow paketi `dist-ssr/`
  içindeyken production Wrangler dry-run'ının bunu production DB/R2 binding'leriyle
  KABUL ETTİĞİNİ gösterdi. Yalnız `--dry-run` kullanıldı, uzakta deploy yok.
- SSR Astro staging paketi artık `dist-ssr-staging/`, production paketi
  `dist-ssr/` altında. Staging config doğrulayıcısı farklı `main` ve
  `assets.directory` alanlarını zorunlu kılıyor; build:staging noindex
  dosyalarını yalnız stage çıktısında değiştiriyor. İkisi `.gitignore` içinde.
- Yalnız staging çıktısı varken üretim Wrangler dry-run giriş dosyasını
  bulamadığı için BLOKLANDI. Gerçek stage Wrangler dry-run sahte ayrı
  D1/R2/audience ile başarılı. Üretim ayrıca derlendiğinde iki çıktı ayrı
  kalıyor, stage dosyalarının SHA-256 değerleri değişmiyor, prod robots
  `Allow: /`, staging robots `Disallow: /` davranışı korunuyor.
- Regresyonlarda 51 staging config, 32 SEO/config import testi ve gerçek
  Orbit ES256 staging cross-repo fixture doğrulandı. Astro outDir ve
  staging Wrangler entry korumalarının her biri yerelde kaldırılıp RED,
  geri alınarak GREEN kanıtlandı. Gerçek staging JSONC, göreli Wrangler
  yolları nedeniyle repo kökünden kullanılmalı; `/tmp` içindeki config
  gerçek bundler'ın dosya yollarını farklı çözdüğünden uygun değil.
- Canlı staging kaynakları, production backup/deploy ve gerçek ajan
  credential kabulü hâlâ açık/onay gerektiren adımlar; hiçbir uzaktaki
  sisteme yazılmadı.
- Ayrı staging klasörüyle yeniden oluşturulan gerçek yerel Wrangler D1
  üzerinde `/`, `/robots.txt`, `/orbit-actions.json`, `/sitemap-index.xml`
  200; bilinmeyen haber 404 döndü. Beş yanıtın tümü noindex/nofollow,
  ana sayfa staging canonical, robots Disallow / içeriyordu. Yerel Worker,
  fixture ve test konfigürasyonu kapatılıp silindi.

## 16 Kasım 2026 checkpoint 27: gerçek staging kaynakları hazır, dağıtım bekliyor

- Kullanıcının yalnız staging altyapısı kurma onayıyla Cloudflare'da ayrı
  `haber-site-staging` Worker kaydı (deploy edilmemiş, public route kapalı),
  `haber-site-staging` D1 ve `haber-gorseller-staging` R2 oluşturuldu. Canlı
  Haber/Orbit ve 580 tarihî haber etkilenmedi; staging D1'e migration veya
  haber/test kaydı yazılmadı.
- Haber repo köküne gerçek ve ayrı D1 UUID'siyle `wrangler.staging.jsonc`
  eklendi. İki kaynağın production'dan bağımsızlığı Cloudflare API ile tekrar
  doğrulandı. 54 staging konfigürasyon testi, 32 SEO testi, gerçek staging
  SSR build ve Wrangler `--dry-run` başarılı.
- Kritik ek koruma: önceki denetim Orbit'in staging D1 UUID'sini Haber D1
  olarak yanlışlıkla kabul ediyordu (gerçek negatif prova). Denetim artık
  yalnız oluşturulmuş Haber staging D1 kimliğine izin veriyor; sahte UUID
  veya Orbit staging UUID'si testte reddediliyor. Orbit iki-repo ES256
  fixture bu doğrulanmış kimliğe uyarlandı.
- Orbit staging `orbit-haber-staging` site client kaydı henüz yok. Gerçek
  client secret, kayıt, staging Worker dağıtımı, D1 migrasyonları ve canlı
  ajan testleri ayrı yetki/kimlik aşamalarıdır. Production ve main dallarına
  push, merge veya deploy yapılmadı.

## 16 Kasım 2026 checkpoint 28: staging Worker canlı, Orbit kimliği bekliyor

- Haber staging D1 üzerinde 0001-0011 migration çalıştırıldı, Git'teki 580
  tarihî haber ve 590 kaynak yalnız staging'e aktarıldı. Yalnız staging için
  gerçek Orbit sponsoruna bağlanmayan geçici iki yayıncı satırı oluşturuldu,
  ardından 0012-0016 migration'lar tamamlandı. Bunlar gerçek ajan kabulü
  sayılmaz; yeni dönemin canlı yayın kaydı oluşturulmadı.
- Haber staging Worker gerçek Cloudflare'da ayrı D1/R2 bağlı biçimde dağıtıldı;
  public workers.dev adresi etkin, robots.txt Disallow /, bütün sayfalarda
  X-Robots-Tag noindex. 580 eski haber URL'sinin **580/580** tamamı HTTP 200,
  staging canonical ve noindex kontrolünden geçti. Bilinmeyen haber 404.
- Orbit staging hesabında `platform_owner` oturumu yok; tarayıcı Google ile
  yeniden giriş istiyor. Anahtar kasasına otomasyon erişimi güvenlik kontrolü
  tarafından engellendi. Mevcut güvenlik korumaları atlanmadı. Gerçek staging
  site client, token ve ajan uçtan uca testleri açık. Production değişmedi.

## 16 Kasım 2026 checkpoint 29: editoryal tasarım yeniden kuruldu

Kullanıcı, staging arayüzünün aşırı yapay ve genel geçer ürün tanıtımına
benzediğini belirtti. Bu geri bildirimin ardından ana sayfa, global masthead,
haber detayı, kategori, tarihsel arşiv ve yayın masası bileşenleri yeniden
kurgulandı. Artık pazarlama sloganı, yuvarlak ajan tanıtım kartları ve anlamsız
numaralar yok. Görselsiz haber yayını için Georgia temelli sakin manşetler,
ince gazete ayraçları, sıcak kâğıt/kontrastlı koyu tema ve açık kaynak/yazar
metaverisi kullanılıyor. Haber akışı boşken okuyucu, yeni haber gibi
sunulMAYAN ve etiketi açık tarihsel teknoloji arşivinden gerçek başlıklara
ulaşıyor. Tasarım sözleşmesi docs/EDITORIAL_DESIGN.md'de ve
scripts/technology-editorial-design-tests.mjs testinde tutuluyor.

Bu değişiklikler yalnız Haber staging üzerinde doğrulanıyor; canlı üretim
sayfası ve production D1 hiç değiştirilmedi. Orbit sponsor girişi ve gerçek
imzalı ajan E2E kapısı ayrı olarak açık kalıyor.
