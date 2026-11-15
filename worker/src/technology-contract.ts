/**
 * Equinox Haber 2.0: modelden yalnız üç alan alan yayın sözleşmesi.
 * Kimlik, saat, başlık, URL, özet, etiket ve görsel girdisi yoktur.
 * Eski haber kabul sözleşmesine dokunmaz: 580 legacy URL çalışmaya devam eder.
 */
export const TECHNOLOGY_CATEGORIES = [
  "yapay-zeka",
  "yazilim",
  "donanim",
  "siber-guvenlik",
  "dijital-dunya",
  "teknoloji-sektoru",
] as const;

export type TechnologyCategory = (typeof TECHNOLOGY_CATEGORIES)[number];

export interface TechnologyInput {
  metin: string;
  kategori: TechnologyCategory;
  kaynaklar: string[];
}

export interface TechnologyArticle extends TechnologyInput {
  baslik: string;
  ozet: string;
  body: string;
  sources: { name: string; url: string }[];
}

export interface ContractResult {
  errors: string[];
  article?: TechnologyArticle;
}

const MAX_ARTICLE_LENGTH = 25000;
const MAX_TITLE_LENGTH = 160;
const MAX_SUMMARY_LENGTH = 260;
const MAX_SOURCES = 8;
const BLOCKED_HOSTS = /(?:^localhost$|\.localhost$|\.local$|\.internal$|\.test$|^127\.|^10\.|^192\.168\.|^169\.254\.|^0\.|^172\.(?:1[6-9]|2\d|3[01])\.|^\[?(?:::1|fc[0-9a-f]{2}:|fd[0-9a-f]{2}:|fe80:)\]?)/iu;

export function normalizeSourceUrl(raw: string): string | null {
  if (raw.length > 2048 || raw.trim() !== raw) return null;
  try {
    const url = new URL(raw);
    if (!["https:", "http:"].includes(url.protocol)
      || !url.hostname.includes(".")
      || url.username || url.password || url.port
      || BLOCKED_HOSTS.test(url.hostname)) return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_.+|fbclid|gclid)$/iu.test(key)) url.searchParams.delete(key);
    }
    return url.toString().replaceAll("(", "%28").replaceAll(")", "%29");
  } catch {
    return null;
  }
}

export function validateTechnologyArticle(input: unknown): ContractResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { errors: ["girdi üç alanlı bir nesne olmalı"] };
  }
  const payload = input as Record<string, unknown>;
  const errors: string[] = [];
  const allowed = new Set(["metin", "kategori", "kaynaklar"]);
  for (const key of Object.keys(payload)) {
    if (!allowed.has(key)) errors.push(`izin verilmeyen alan: ${key}`);
  }

  if (typeof payload.metin !== "string"
    || payload.metin.length > MAX_ARTICLE_LENGTH
    || payload.metin.trim().length < 100) {
    errors.push("metin 100-25000 karakter uzunluğunda Markdown olmalı");
  }
  if (!(TECHNOLOGY_CATEGORIES as readonly unknown[]).includes(payload.kategori)) {
    errors.push("kategori geçerli bir teknoloji alt kategorisi olmalı");
  }

  const rawSources = payload.kaynaklar;
  if (!Array.isArray(rawSources) || rawSources.length === 0 || rawSources.length > MAX_SOURCES) {
    errors.push("kaynaklar 1-8 adres içeren bir dizi olmalı");
  }
  const sources: { name: string; url: string }[] = [];
  if (Array.isArray(rawSources)) {
    const urls = new Set<string>();
    for (const source of rawSources.slice(0, MAX_SOURCES)) {
      const normalized = typeof source === "string" ? normalizeSourceUrl(source) : null;
      if (!normalized) {
        errors.push("kaynak güvenli HTTP(S) bağlantısı olmalı");
        continue;
      }
      if (urls.has(normalized)) {
        errors.push("aynı kaynak iki kez verilemez");
        continue;
      }
      urls.add(normalized);
      sources.push({ name: new URL(normalized).hostname.replace(/^www\./u, ""), url: normalized });
    }
  }

  if (typeof payload.metin !== "string" || errors.length > 0) return { errors };
  const text = payload.metin.trim();
  const lines = text.split(/\r?\n/u);
  const heading = /^# (.+)$/u.exec(lines[0] ?? "");
  const baslik = heading?.[1]?.trim() ?? "";
  if (baslik.length < 8 || baslik.length > MAX_TITLE_LENGTH || /[#\[\]<>]/u.test(baslik)) {
    errors.push("metnin ilk satırı 8-160 karakterlik tek bir '# Başlık' olmalı");
  }

  const body = lines.slice(1).join("\n").trim();
  if (body.length < 70) errors.push("başlığın ardından haber metni bulunmalı");
  if (/<(?:[!/?]|[a-z])/iu.test(body)) {
    errors.push("haber metninde ham HTML kullanılamaz");
  }
  if (/!\s*\[/u.test(body)) {
    errors.push("haber metninde görsel kullanılamaz");
  }
  if (/^\s*# /mu.test(body)) errors.push("metnin içinde ikinci bir H1 başlık olamaz");
  // Official citations are generated from structured kaynaklar. An agent
  // cannot inject a second, misleading source heading into its prose.
  if (/^\s*##\s+(?:Kaynaklar|Ek kaynaklar)\s*#*\s*$/gimu.test(body)) {
    errors.push("kaynakça başlığını sistem oluşturur; metne eklenemez");
  }

  const firstParagraph = body.split(/\n\s*\n/u).map((x) => x.replace(/\s+/gu, " ").trim()).find(Boolean) ?? "";
  const ozet = firstParagraph.length <= MAX_SUMMARY_LENGTH
    ? firstParagraph
    : `${firstParagraph.slice(0, MAX_SUMMARY_LENGTH - 1).trimEnd()}…`;
  if (errors.length > 0) return { errors };

  return {
    errors: [],
    article: {
      metin: text,
      kategori: payload.kategori as TechnologyCategory,
      kaynaklar: sources.map((x) => x.url),
      baslik,
      ozet,
      body,
      sources,
    },
  };
}
