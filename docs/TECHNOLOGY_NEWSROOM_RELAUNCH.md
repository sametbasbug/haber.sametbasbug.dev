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
