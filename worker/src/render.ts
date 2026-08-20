/* Render-on-write.
 *
 * Markdown okuma anında değil yazma anında HTML'e çevrilir. Üç gerekçe:
 *
 * 1. Astro build kapısının verdiği garanti korunur. Statik sistemde "bu haber
 *    gerçekten render oluyor" sorusunu `npm run build` cevaplıyordu. Burada
 *    aynı soruyu render'ın kendisi cevaplıyor: çevrim düşerse D1'e hiçbir şey
 *    yazılmaz ve yarım bir yayın ortada kalmaz.
 * 2. Okuma yolunda ayrıştırma maliyeti kalmaz.
 * 3. Düzeltmede yeniden render doğal olarak olur — `body_md` gerçek kaynak,
 *    `body_html` ondan türetilmiş çıktı.
 *
 * ————————————————————————————————————————————————————————————————
 * NEDEN `unified`, NEDEN `satteri` DEĞİL
 *
 * Sitenin bugünkü işlemcisi `satteri` (Astro 7 varsayılanı). İlk tercih onu
 * Worker'da da kullanmaktı — aynı paket, yapısal fidelity. Çalışmıyor ve
 * nedeni mimari: `satteri` bir napi native modülü; Workers derlemesi
 * `wasm32-wasi` varyantına düşüyor, o varyant da paylaşımlı
 * `WebAssembly.Memory` (SharedArrayBuffer), çalışma anında `fetch` ile wasm
 * yükleme ve dosya sistemi vekili için Web Worker istiyor. workerd'de üçü de
 * yok. Ölçüldü: modül derleniyor ama ilk render'da
 * `TypeError: createMdastHandle is not a function`.
 *
 * Astro'nun satteri'yi bir Worker içinde çalıştırdığı bir yol da zaten yok;
 * Cloudflare adaptöründe bile içerik markdown'ı build anında, Node üzerinde
 * derleniyor.
 *
 * `unified` Astro'nun desteklediği ikinci işlemci ve saf JS. Çıktı denkliği
 * varsayılmadı, ölçüldü: arşivdeki **587 haberin 587'sinde** üretilen HTML,
 * sitenin canlı `dist/` çıktısıyla birebir aynı — tek fark URL'lerdeki `&`
 * kaçışının biçimi (`&amp;` / `&#x26;`), ki ikisi de geçerli HTML ve tarayıcıda
 * aynı karaktere çözülüyor. `tools/parity-render.mjs` bunu her koşuda yeniden
 * ölçer.
 *
 * Açık karar: site de `unified()` işlemcisine alınırsa sistemde tek bir
 * renderer kalır ve bu kozmetik fark da kaybolur. Bugün agree eden iki
 * işlemci yarın ayrışabilir; tek işlemci ayrışamaz.
 * ———————————————————————————————————————————————————————————————— */

import { createMarkdownProcessor } from "@astrojs/markdown-remark";

/* Renderer değiştiğinde artır. Satırlardaki `render_version` hangi haberin
 * bayat HTML taşıdığını söyler; bu sorgulanabilir olsun diye sayı satırda
 * duruyor, kodda değil. */
export const RENDER_VERSION = 1;

type Processor = Awaited<ReturnType<typeof createMarkdownProcessor>>;

let processorPromise: Promise<Processor> | null = null;

function processor(): Promise<Processor> {
  /* Tek sefer kurulur ve isolate boyunca paylaşılır: kurulum CPU maliyeti ve
   * her istekte tekrarlanması anlamsız. */
  processorPromise ??= createMarkdownProcessor({
    /* Sözdizimi vurgulaması kapalı. Arşivdeki 587 haberin **hiçbirinde** kod
     * bloğu yok (ölçüldü) ve POLICY.md gövdede madde işaretli listeyi bile
     * yasaklıyor. Shiki'nin dilbilgisi yükünü hiç kullanılmayacak bir özellik
     * için Worker'a taşımıyoruz. Bir gün kod bloklu haber gerekirse bu satır
     * geri açılır — o zamana kadar kapalı olduğu burada yazılı. */
    syntaxHighlight: false,
  });
  return processorPromise;
}

export interface RenderResult {
  html: string;
  headings: { depth: number; slug: string; text: string }[];
  renderVersion: number;
}

/** Haber gövdesini HTML'e çevirir.
 *
 * Girdi, markdown dosyasında frontmatter'dan *sonra* gelen metnin tamamıdır —
 * "## Kaynaklar" bölümü dahil. Arşivdeki dosyalarla birebir aynı girdi olsun
 * diye böyle: aynı girdi, aynı işlemci, aynı çıktı. */
export async function renderBody(markdown: string): Promise<RenderResult> {
  const result = await (await processor()).render(markdown);
  return {
    html: result.code,
    headings: result.metadata.headings as RenderResult["headings"],
    renderVersion: RENDER_VERSION,
  };
}
