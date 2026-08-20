/* `newsroom/newsroom/accept.py` çevirisi.
 *
 * Buradaki her kontrol mekaniktir: bir alan var ya da yok, metin Türkçe ya da
 * değil, paragraf sayısı aralıkta ya da değil. Haberin *iyi* olup olmadığı
 * burada ölçülmez; o `newsroom/POLICY.md` işidir.
 *
 * Eşikler Python tarafındakilerle aynı olmak zorunda ve `tools/parity-accept.mjs`
 * bunu korpusun tamamında denetler. Sayıların neden bu sayılar olduğu
 * `accept.py`'nin başındaki dağılım notunda yazılı; burada tekrar edilmiyor ki
 * tek bir yerde güncellensin.
 */

import { bodyIsTurkish, looksUntranslated } from "./lang.ts";

export const CATEGORIES = ["Siyaset", "Ekonomi", "Teknoloji", "Bilim"] as const;
export type Category = (typeof CATEGORIES)[number];

export const MIN_BODY_LENGTH = 600;
export const MIN_PARAGRAPHS = 3;
export const MAX_PARAGRAPHS = 5;
export const MIN_TAGS = 2;
export const MAX_TAGS = 6;
export const MIN_DESCRIPTION_LENGTH = 40;

export const REQUIRED_FIELDS = [
  "candidateId", "title", "description", "category", "body",
  "tags", "heroPrompt", "heroAlt", "heroQuery",
] as const;

const INTERNAL_MARKERS =
  /manual-review|source-profile|asteria-editorial|autopublish|queue[_-]?id|editoryal not|pre-reject|duplicate-publish-gate/i;

const BULLET_RE = /^\s*(?:[-*•]|\d+[.)])\s+/m;
const PARAGRAPH_SPLIT_RE = /\n\s*\n/;

export interface AcceptError {
  candidateId: string | null;
  code: string;
  message: string;
}

export function paragraphsOf(body: string): string[] {
  return body
    .trim()
    .split(PARAGRAPH_SPLIT_RE)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

export interface BoardEntry { id: string; title?: string; [key: string]: unknown }

/** Python'daki `if not selection.get(name)` ile aynı: yokluk, boş dizgi ve
 *  boş dizi hepsi "eksik" sayılır. JS'te bu farkı gözden kaçırmak kolay. */
function isBlank(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "number") return value === 0;
  if (typeof value === "boolean") return !value;
  return false;
}

export function validateSelection(
  selection: Record<string, unknown>,
  board: Map<string, BoardEntry>,
): AcceptError[] {
  const errors: AcceptError[] = [];
  const candidateId = (selection.candidateId as string) ?? null;
  const fail = (code: string, message: string) =>
    errors.push({ candidateId, code, message });

  const missing = REQUIRED_FIELDS.filter((name) => isBlank(selection[name]));
  if (missing.length > 0) {
    fail("missing_fields", `eksik alan: ${missing.join(", ")}`);
    return errors;
  }

  const entry = candidateId === null ? undefined : board.get(candidateId);
  if (entry === undefined) {
    fail("unknown_candidate", `panoda olmayan aday: ${candidateId}`);
    return errors;
  }

  const category = selection.category as string;
  if (!(CATEGORIES as readonly string[]).includes(category)) {
    fail("bad_category", `geçersiz kategori: ${category}`);
  }

  const body = String(selection.body);
  const title = String(selection.title);
  const description = String(selection.description);

  // Uzunluk kapısı kalite değil kırpılma korumasıdır. Python `len()` kod
  // noktası sayar, JS `.length` UTF-16 kod birimi sayar; BMP dışı karakter
  // (emoji vb.) içeren bir gövdede ikisi ayrışır. Haber metninde beklenmez ama
  // eşik bir kapı olduğu için varsayıma bırakılmıyor.
  const bodyLength = [...body].length;
  if (bodyLength < MIN_BODY_LENGTH) {
    fail("body_truncated", `gövde ${bodyLength} karakter, en az ${MIN_BODY_LENGTH}`);
  }

  const count = paragraphsOf(body).length;
  if (count < MIN_PARAGRAPHS || count > MAX_PARAGRAPHS) {
    fail("paragraph_count", `${count} paragraf, izin verilen ${MIN_PARAGRAPHS}-${MAX_PARAGRAPHS}`);
  }

  if (BULLET_RE.test(body)) {
    fail("bullet_list", "gövdede madde işaretli liste var");
  }

  const turkish = bodyIsTurkish(body);
  if (!turkish.ok) fail("not_turkish", `gövde: ${turkish.reason}`);

  const sourceTitle = String(entry.title ?? "");
  for (const [name, value] of [["title", title], ["description", description]] as const) {
    const check = looksUntranslated(value, sourceTitle);
    if (check.untranslated) fail("untranslated", `${name}: ${check.detail}`);
  }

  const descriptionLength = [...description].length;
  if (descriptionLength < MIN_DESCRIPTION_LENGTH) {
    fail("description_too_short", `description ${descriptionLength} karakter, en az ${MIN_DESCRIPTION_LENGTH}`);
  }

  if (title.trim().toLowerCase() === description.trim().toLowerCase()) {
    fail("description_repeats_title", "description başlığın tekrarı");
  }

  const tags = selection.tags;
  if (!Array.isArray(tags) || tags.length < MIN_TAGS) {
    fail("too_few_tags", `en az ${MIN_TAGS} etiket gerekli`);
  } else if (tags.length > MAX_TAGS) {
    fail("too_many_tags", `${tags.length} etiket, üst sınır ${MAX_TAGS}`);
  }

  for (const name of ["body", "title", "description", "heroAlt"]) {
    if (INTERNAL_MARKERS.test(String(selection[name] ?? ""))) {
      fail("internal_leak", `${name} içinde iç not/metadata izi var`);
    }
  }

  return errors;
}

export interface AcceptResult {
  accepted: Record<string, unknown>[];
  errors: AcceptError[];
  declinedReason: string | null;
}

/** Seçim yapılmamış olması hata değildir: `POLICY.md` §7 yayımlanabilir aday
 *  yoksa yayımlamamayı açıkça istiyor. */
export function validate(payload: unknown, brief: Record<string, any>): AcceptResult {
  const result: AcceptResult = { accepted: [], errors: [], declinedReason: null };

  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    result.errors.push({ candidateId: null, code: "bad_payload", message: "yanıt bir nesne değil" });
    return result;
  }

  const body = payload as Record<string, unknown>;
  const selections = body.selections ?? [];

  if (!Array.isArray(selections)) {
    result.errors.push({ candidateId: null, code: "bad_payload", message: "selections bir liste değil" });
    return result;
  }

  if (selections.length === 0) {
    result.declinedReason = String(body.note || "gerekçe bildirilmedi");
    return result;
  }

  const allowed = Number(brief?.task?.selectCount ?? 1);
  if (selections.length > allowed) {
    result.errors.push({
      candidateId: null, code: "too_many_selections",
      message: `${selections.length} seçim döndü, izin verilen ${allowed}`,
    });
    return result;
  }

  const board = new Map<string, BoardEntry>(
    (brief?.board ?? []).map((entry: BoardEntry) => [entry.id, entry]),
  );

  const seen = new Set<string>();
  for (const selection of selections) {
    if (typeof selection !== "object" || selection === null || Array.isArray(selection)) {
      result.errors.push({ candidateId: null, code: "bad_payload", message: "seçim bir nesne değil" });
      continue;
    }

    const candidateId = (selection as Record<string, unknown>).candidateId as string;
    if (seen.has(candidateId)) {
      result.errors.push({ candidateId, code: "duplicate_selection", message: "aynı aday iki kez seçildi" });
      continue;
    }
    seen.add(candidateId);

    const errors = validateSelection(selection as Record<string, unknown>, board);
    if (errors.length > 0) result.errors.push(...errors);
    else result.accepted.push(selection as Record<string, unknown>);
  }

  return result;
}
