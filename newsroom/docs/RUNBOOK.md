# İşletim

Asteria'nın zamanlanmış Codex görevinde izlediği akış. Editoryal kurallar burada
değil `POLICY.md` içindedir; bu belge yalnız mekaniği anlatır.

## Kurulum

Repo kökünden, bir kez:

```bash
python3 -m venv newsroom/.venv
newsroom/.venv/bin/pip install -e "newsroom[test]"
```

Pexels yedeği kullanılacaksa anahtar `.env` dosyasına konur (`.gitignore`
kapsamındadır, repoya girmez):

```bash
PEXELS_API_KEY=...
```

## Çevrim

Saat başı bir çevrim, çevrim başına bir haber. Üç adım:

### 1. Panoyu al

```bash
newsroom/.venv/bin/newsroom prepare
```

Tam brief'i stdout'a JSON olarak basar ve `newsroom/data/current-brief.json`
dosyasına yazar. `--summary` yalnız özet basar, brief yine diske yazılır.

Brief şunları taşır:

- `policy` — okunacak politika dosyasının yolu ve içerik parmak izi
- `task.selectCount` — kaç haber seçilebileceği
- `board[]` — adaylar; her birinde `id`, kaynak, URL, başlık ve çıkarılmış
  kaynak metni (`sourceText`)
- `liveContext` — son yayınların kaynak, kategori ve etiket dağılımı
- `pipeline` — havuz büyüklüğü ve mekanik eleme sayıları

Kaynak metni brief'in içinde geldiği için haber sayfasına ayrıca gitmek
gerekmez.

`sourceText` **4000 karakterde kesilir** (`brief.BRIEF_TEXT_LIMIT`); bu bağlam
maliyetini sınırlar. Kesilme olduysa aday üzerinde `sourceTextTruncated: true`
yazar. Kesilmiş bir metnin devamı tahmin edilmez: gövde yalnız elindeki metne
dayanır, eksik kalan kısım haberin özüne aitse haber geçilir.

### 2. Oku, seç, yaz

`POLICY.md` okunur ve panodan en fazla `selectCount` haber seçilir.

Yayımlanabilir aday yoksa seçim yapılmaz. Bu bir başarısızlık değildir
(`POLICY.md` §7).

Yanıt biçimi:

```json
{
  "selections": [
    {
      "candidateId": "panodaki id",
      "title": "Türkçe başlık",
      "description": "Türkçe açıklama",
      "category": "Siyaset | Ekonomi | Teknoloji | Bilim",
      "body": "Haber gövdesi, paragraflar boş satırla ayrılmış",
      "tags": ["etiket", "etiket"],
      "heroPrompt": "Görsel yönergesi",
      "heroAlt": "Türkçe alternatif metin",
      "heroImagePath": "/mutlak/yol/uretilen-gorsel.png"
    }
  ],
  "note": "Seçim yapılmadıysa gerekçe"
}
```

`heroImagePath` isteğe bağlıdır. Görsel üretildiyse dosyanın mutlak yolu
verilir; boyut ve biçim önemli değildir, sistem 1200×675 WebP'ye kendisi çevirir.

Kaynak alanı yoktur ve olmayacaktır: Kaynaklar bölümünü sistem panodaki adayın
kendi yayınından yazar (`POLICY.md` §5).

`selections` birden fazla haber taşıyabilir, ama **yayın haber başına
atomiktir, koşu başına değil.** Her haber kendi kapılarından geçer ve kendi
commit'ini alır; ikincisi düşerse birincisi yayında kalır. Yarım bırakılmayan
şey tek bir haberdir. Bugün `selectCount` 1 olduğu için bu ayrım pratikte
görünmez; 2'ye çıkılırsa geçerli davranış budur.

### 3. Yayına al

```bash
newsroom/.venv/bin/newsroom publish --response yanit.json
```

Yanıtı sözleşmeye karşı doğrular, markdown'ı yazar, hero'yu yerleştirir,
denetimleri ve Astro build'i çalıştırır, dar kapsamlı commit atar.

**Push yapmaz.** Yayına alma ayrı ve açık bir adımdır.

Çıkış kodu 0 ise iş tamamdır. Değilse çıktıdaki `contractErrors` (sözleşme
ihlali) veya `problems` (doğrulama) alanları neyin düştüğünü söyler.

## Hero sırası

1. Slug için görsel zaten varsa yeniden üretilmez
2. `heroImagePath` verilmişse normalize edilir
3. Yoksa Pexels'ten stok görsel alınır
4. O da olmazsa haber hero'suz yayımlanır

Dördüncü adım kasıtlıdır: görsel üretilemedi diye yayın durmaz. Codex kotası
Nyx ile paylaşıldığı için birinci adım önemlidir — var olan görseli yeniden
üretmek doğrudan Nyx'ten kota çalar.

## Kapılar

`publish` şunlar geçmeden commit atmaz:

- kabul sözleşmesi: şema, Türkçe dil ölçümü, gövde derinliği, paragraf sayısı,
  kaynak başlığının çevrilmiş olması, iç not sızıntısı olmaması
- içerik denetimi: frontmatter geçerliliği, Kaynaklar bölümü, kategori
- görsel denetimi: `heroImage` gerçekten var olan bir dosyayı gösteriyor mu
- kapsam: çalışma ağacında yalnız o haberin dosyaları değişmiş olmalı
- Astro build

Bir kapı düşerse yazılan dosya ve üretilen görsel silinir, commit atılmaz.
Yarım kalmış bir yayın bırakılmaz.

## Durum

```bash
newsroom/.venv/bin/newsroom status
```

Çevrimler arası durum `newsroom/data/` altındadır ve git dışıdır:

- `state.json` — kaynak çekim zamanları, adayların panoda görünme sayısı,
  kullanılmış Pexels foto kimlikleri
- `candidates.json` — aday deposu
- `current-brief.json` — son üretilen brief

Depo silinirse sistem çalışmayı sürdürür; yalnız bir sonraki toplama turuna
kadar pano daralır.

## Sorun giderme

**Pano boş geliyor.** Depodaki adayların tamamı elenmiş olabilir (24 saatlik
tazelik penceresi) ya da hepsi zaten yayımlanmıştır. `prepare` çıktısındaki
`pipeline.mechanicallyFiltered` neyin elendiğini söyler.

**Aynı slug zaten yayında.** Aynı başlık ikinci kez yazılmak istenmiş demektir.
Sistem üzerine yazmaz; bu bir tekrar yayın işaretidir.

**"bu kaynak zaten yayında" / "aynı haber zaten yayında".** Tekrar kontrolü
pano kurulurken bir kez, yayın anında bir kez daha yapılır. İkinci kontrolün
düşmesi brief'in eskidiğini gösterir: araya başka bir çevrim girmiş olabilir.
`prepare` yeniden çalıştırılır.

**Aday `undated` koduyla eleniyor.** Beslemede yayın tarihi yok. Tazelik kapısı
ölçemediği yaşı varsaymaz. Bütün bir kaynak birden bu koda düşüyorsa besleme
biçimi bozulmuş demektir; `sources.yaml` tarafına bakılır.

**Kapsam kapısı düşüyor.** Çalışma ağacında yayınla ilgisiz değişiklikler var.
Çevrim başlamadan ağaç temiz olmalıdır.

## Testler

```bash
cd newsroom && .venv/bin/python -m pytest tests/ -q
```

Testler ağa çıkmaz ve sağlayıcı çağırmaz.
