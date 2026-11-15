/* Orbit'ten gelen ajan eylemlerini karşılar.
 *
 * Bu ucu ajan çağırmıyor, ORBIT çağırıyor. Ajanın elinde Haber'e ait bir
 * anahtar yok ve olmamalı: saklama yeri olmayan istemcilerde çalışmaz, ve
 * insan Orbit panelinden erişimi kapattığında ortada yaşamaya devam eden bir
 * anahtar kalmamalı. Kontrat:
 * `orbit-project/docs/baglisite-ajan-eylemleri.md`.
 *
 * İşlemler yayının KENDİ yoluna bağlanıyor (`writeBriefAs` / `publishAs`).
 * Ayrı bir yayın yolu açsaydık kabul sözleşmesi, tekrar kapıları ve render
 * kontrolleri iki yerde durur, biri er geç ötekinden geri kalırdı.
 */
import {
  listPublished,
  publishAs,
  readBoardAs,
  restoreAs,
  withdrawAs,
  writeBriefAs,
  type Env,
} from "./index.ts";
import { editTechnologyAs, listTechnologyAs, publishTechnologyAs, readTechnologyAs, setTechnologyPublicationState, replayTechnologyAgentRequest } from "./technology-publication.ts";
import { authorizeAction, verifyOrbitActionToken, type Identity } from "./identity.ts";

/** Version 2: the ONLY advertised Haber actions. */
export const OPERATIONS = [
  "haber.yayinla",
  "haber.haberleriOku",
  "haber.haberOku",
  "haber.duzenle",
  "haber.yayindanKaldir",
  "haber.yayinaAlGeri",
] as const;

/** Historical two-step newsroom, disabled in deployed builds.
 * Retained only for controlled rollback tests; never in public catalog. */
export const LEGACY_OPERATIONS = [
  "haber.panoYaz",
  "haber.panoOku",
  "haber.legacyYayinla",
  "haber.legacyYayindanKaldir",
  "haber.legacyYayinaAlGeri",
  "haber.yayinlariOku",
] as const;

const TECHNOLOGY_MUTATIONS = new Set<string>([
  "haber.yayinla", "haber.duzenle",
  "haber.yayindanKaldir", "haber.yayinaAlGeri",
]);


/* İKİ YETKİ KATMANI VAR VE BU YENİ BİR KURAL — yazıldığı yer burası.
 *
 *   yazma ve iç durum → `publishers` satırı gerekiyor
 *   yayımlanmış haberi okuma → bağlı olmak yeterli, satır gerekmiyor
 *
 * Alttaki katmanın gerekçesi: Orbit ekosistemindeki başka bir ajan "bugünün
 * haberlerini getir" diyebilmeli ve bunun için yayıncı listesine girmesi
 * saçma olurdu. Ama "herkese açık" da değil — belge yine Orbit imzalı, yani
 * karşı tarafta bir Orbit kimliği ve insanın açtığı bir ajan erişimi var.
 * Yani "önüne gelen" değil, "Orbit'te kimliği olan".
 *
 * Bu listeye bir işlem eklemek onu izin duvarının DIŞINA çıkarmaktır; yazma
 * yapan hiçbir işlem buraya girmemeli. */
const YETKI_GEREKTIRMEYENLER = new Set<string>([
  "haber.haberleriOku", "haber.haberOku", "haber.yayinlariOku",
]);

/* Tekrar kaydı tutulmayan işlemler.
 *
 * Okuma işleminde tekrar diye bir sorun yok: ikinci kez çalışması zararsız ve
 * taze cevap bayat cevaptan iyidir. Kayıt tutsaydık her okuma bir satır
 * yazardı — okuma yolunu yazma yoluna çevirmek olurdu. */
const KAYITSIZ = new Set<string>([
  "haber.haberleriOku", "haber.haberOku", "haber.yayinlariOku", "haber.panoOku",
]);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/* Her reddetme günlüğe yazılıyor.
 *
 * Orbit sitenin hata GÖVDESİNİ ajana taşımıyor — bilerek, çünkü içeriğini
 * bilmediği bir metni kendi cevabı gibi göstermek olurdu. Doğru karar ama
 * teşhisi kör bırakıyor: ajan "site 400 döndü" görüyor, sebebini görmüyor.
 * Sebebi buraya yazıyoruz. */
function reddet(status: number, mesaj: string): Response {
  console.error(`orbit-eylem reddetti: ${status} ${mesaj}`);
  return json({ error: mesaj }, status);
}

/* İmzası doğrulanmış bir isteğin reddi ayrıca VERİTABANINA yazılıyor.
 *
 * Sebebi: reddedilen deneme ajanın ekranında içeriksiz bir 502 olarak
 * görünüyor, yani "kim denedi" sorusunun cevabı yalnız bizde olabilir. Site
 * başkalarına açıldığında bu tek denetim izi.
 *
 * Kapı `verified`: imzasız istekler buraya HİÇ gelmiyor, yalnız Worker
 * günlüğüne düşüyor. `/api/orbit-eylem` herkese açık bir adres ve imzasız çöp
 * her istekte bir satır yazdırabilseydi bu bir yazma silahı olurdu.
 *
 * Yazma başarısız olursa istek reddedilmeye devam ediyor: denetim izi
 * tutulamaması güvenlik kararını değiştirmez, sadece kaydı eksiltir. */
async function denetimeYaz(
  env: Env,
  verified: { subject: string; actorSubject: string; operation: string },
  operationId: string,
  status: number,
  reason: string,
): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO orbit_action_denials
         (subject, actor_subject, operation_id, document_operation, status, reason, created_at)
       VALUES (?,?,?,?,?,?,?)`,
    ).bind(
      verified.subject,
      verified.actorSubject,
      operationId.length > 0 ? operationId : null,
      verified.operation,
      status,
      reason,
      new Date().toISOString(),
    ).run();
  } catch (error) {
    console.error(`orbit-eylem: reddetme kaydedilemedi: ${String(error)}`);
  }
}

async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* Yayın hattının verdiği KARAR ile ARIZA farklı şeyler ve farklı taşınmalı.
 *
 * "Bu haber zaten yayında" (409) ya da "kabul sözleşmesine uymuyor" (422) bir
 * arıza değil, yayın kapılarının çalıştığının kanıtı — ajanın öğrenmesi
 * gereken bilgi. HTTP hatası olarak dönersek Orbit gövdeyi düşürüyor ve ajana
 * içeriksiz bir 502 gidiyor: aynı denemeyi tekrar tekrar yapmaya davet. Bu
 * yüzden aşağıdaki durumlar 2xx gövdesine sarılıp `uygulandi: false` ile
 * taşınıyor.
 *
 * Liste AÇIK UÇLU DEĞİL ve bunu bir test öğretti: önce "4xx'in tamamı" diye
 * yazmıştım ve `403 bu kimlik pano yazamaz` da karara dönüşüyordu. Yetki
 * eksikliği bir editoryal karar değil; "sarıldı" demek, kapalı bir kapıyı
 * kapanmamış gibi göstermekti. Yetki ve yapılandırma hataları, 5xx gibi,
 * reddetme olarak çıkıyor. */
const KARAR_DURUMLARI = new Set([400, 404, 409, 413, 422]);

async function sonucaCevir(
  response: Response,
  reddetVeYaz: (status: number, mesaj: string) => Promise<Response>,
): Promise<{ output: Record<string, unknown> } | Response> {
  const govde = await response.json<any>().catch(() => ({}));
  if (response.ok) return { output: { uygulandi: true, ...govde } };

  /* Editoryal karar denetim izine yazılmıyor: reddedilmedi, cevaplandı.
   * Ajan sebebini gövdede görüyor ve "kim denedi" sorusu doğmuyor. */
  if (KARAR_DURUMLARI.has(response.status)) {
    console.error(`orbit-eylem: yayın kapısı reddetti ${response.status} ${JSON.stringify(govde).slice(0, 300)}`);
    return { output: { uygulandi: false, durum: response.status, ...govde } };
  }
  return reddetVeYaz(response.status, `yayın hattı reddetti: ${JSON.stringify(govde).slice(0, 300)}`);
}

export async function siteAction(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("yalnız POST", { status: 405, headers: { allow: "POST" } });
  }
  if (!env.ORBIT_ISSUER || !env.ORBIT_AUDIENCE) {
    return reddet(503, "ajan eylemleri yapılandırılmamış");
  }

  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return reddet(401, "yetkilendirme başlığı yok");

  const idempotencyKey = request.headers.get("idempotency-key") ?? "";
  if (idempotencyKey.length === 0 || idempotencyKey.length > 128) {
    return reddet(400, "Idempotency-Key gerekli");
  }

  // Do not parse an unbounded JSON body BEFORE verifying the signed token.
  // This is a public HTTP endpoint: a fake Bearer header must not let a
  // remote caller force large memory allocations or crash on JSON null.
  // New publication accepts at most 25K characters + eight source URLs;
  // 160 KiB leaves room for UTF-8 text without accepting enormous payloads.
  const MAX_ACTION_BYTES = 160 * 1024;
  if (!/^application\/json(?:\s*;|$)/iu.test(request.headers.get("content-type") ?? "")) {
    return reddet(415, "JSON content-type gerekli");
  }
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null && (!/^\d+$/u.test(declaredLength)
    || Number(declaredLength) > MAX_ACTION_BYTES)) {
    return reddet(413, "eylem gövdesi çok büyük");
  }

  let body: { operationId?: unknown; input?: unknown };
  try {
    if (!request.body) return reddet(400, "gövde eksik");
    const reader = request.body.getReader();
    const parts: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_ACTION_BYTES) {
        await reader.cancel().catch(() => undefined);
        return reddet(413, "eylem gövdesi çok büyük");
      }
      parts.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) {
      bytes.set(part, offset);
      offset += part.byteLength;
    }
    const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return reddet(400, "gövde nesne olmalı");
    }
    const fields = parsed as Record<string, unknown>;
    if (Object.keys(fields).some((field) => field !== "operationId" && field !== "input")
      || !fields.input || typeof fields.input !== "object" || Array.isArray(fields.input)) {
      return reddet(400, "eylem yalnız operationId ve input nesnesi taşımalı");
    }
    body = fields;
  } catch {
    return reddet(400, "gövde JSON değil");
  }
  const operationId = typeof body.operationId === "string" ? body.operationId : "";
  const input = body.input as Record<string, unknown>;

  const verified = await verifyOrbitActionToken(
    authorization.slice(7).trim(),
    env.ORBIT_ISSUER,
    env.ORBIT_AUDIENCE,
  );
  if ("error" in verified) return reddet(verified.status, verified.error);

  /* Belgedeki işlem gövdedekiyle aynı olmak ZORUNDA. Aksi halde "pano yaz"
   * için alınmış bir belge, gövdesi değiştirilerek "yayımla"ya çevrilirdi. */
  /* Buradan sonraki her reddetme denetim izine de yazılıyor: belge doğrulandı,
   * yani istek gerçekten Orbit'ten geliyor ve arkasında bir kimlik var. */
  const reddetVeYaz = async (status: number, mesaj: string) => {
    await denetimeYaz(env, verified, operationId, status, mesaj);
    return reddet(status, mesaj);
  };

  if (verified.operation !== operationId) {
    return reddetVeYaz(403, "belge bu işlem için verilmemiş");
  }
  const isLegacy = (LEGACY_OPERATIONS as readonly string[]).includes(operationId);
  if (!(OPERATIONS as readonly string[]).includes(operationId) && !isLegacy) {
    return reddetVeYaz(404, `bilinmeyen işlem: ${operationId}`);
  }
  // Legacy is not exposed at production. A controlled explicit override is
  // needed only for historical regression/rollback exercises.
  if (isLegacy && (env as Env & { ENABLE_LEGACY_NEWS_ACTIONS?: string }).ENABLE_LEGACY_NEWS_ACTIONS !== "1") {
    return reddetVeYaz(404, "eski haber eylemi kullanımdan kaldırıldı");
  }

  const yetkiGerekiyor = !YETKI_GEREKTIRMEYENLER.has(operationId);
  const auth = yetkiGerekiyor ? await authorizeAction(verified, env) : null;
  if (auth && !auth.ok) return reddetVeYaz(auth.status, auth.error);

  const atomicTechnologyWrite = TECHNOLOGY_MUTATIONS.has(operationId);
  const kayitTut = !KAYITSIZ.has(operationId) && !atomicTechnologyWrite;
  const inputDigest = await digest(JSON.stringify({ operationId, input }));

  // Agent technology writes no longer rely on the *post-mutation* legacy log.
  // Their output receipt is inserted in the same D1 transaction as the news.
  if (atomicTechnologyWrite && auth?.ok) {
    auth.identity.agentRequest = { key: idempotencyKey, fingerprint: inputDigest };
    const receipt = await replayTechnologyAgentRequest(auth.identity, env.DB);
    if (receipt) {
      if (receipt.status === 409) return reddetVeYaz(409, "aynı anahtar başka ajan veya istek tarafından kullanıldı");
      return json({ status: "replayed", output: await receipt.json() });
    }
  }

  /* Tekrar mı? Aynı anahtar + aynı gövde ise ilk çalışmanın cevabı dönüyor.
   * Yayının kendi kapıları çoğu tekrarı zaten durdurur ama 409 ile — ajan
   * için "başarısız" demektir. Burada ilk cevabın aynısı dönüyor. */
  const gecmis = kayitTut
    ? await env.DB.prepare(
      "SELECT actor_subject, input_digest, output FROM orbit_action_log WHERE subject = ? AND idempotency_key = ?",
    ).bind(verified.subject, idempotencyKey).first<any>()
    : null;

  if (gecmis) {
    /* Aynı anahtar FARKLI gövdeyle geldi: bu bir tekrar değil, çakışma.
     * Sessizce ilk cevabı döndürmek, ajanın yaptığını sandığı işin hiç
     * yapılmaması olurdu. */
    if (gecmis.input_digest !== inputDigest || gecmis.actor_subject !== verified.actorSubject) {
      return reddetVeYaz(409, "aynı Idempotency-Key farklı bir istekle kullanıldı");
    }
    return json({ status: "replayed", output: JSON.parse(gecmis.output) });
  }

  const response = await calistir(operationId, auth?.identity, input, env);
  const wasReplayed = response.headers.get("x-haber-idempotency-replay") === "1";

  const sonuc = await sonucaCevir(response, reddetVeYaz);
  if (sonuc instanceof Response) return sonuc;

  if (!kayitTut) return json({ status: wasReplayed ? "replayed" : "applied", output: sonuc.output });

  /* Kayıt yazmadan önce iş bitmiş oluyor ve bu sıra bilerek: kaydı önce
   * yazsaydık, yayın çökerse ajan "yapıldı" cevabını sonsuza kadar tekrar
   * okurdu. Ters sırada en kötü ihtimal, kayıt yazılamazsa aynı işin ikinci
   * kez denenmesi — ve orada yayının kendi tekrar kapıları devrede. */
  await env.DB.prepare(
    `INSERT OR IGNORE INTO orbit_action_log
       (subject, idempotency_key, operation_id, input_digest, output, actor_subject, created_at)
     VALUES (?,?,?,?,?,?,?)`,
  ).bind(
    verified.subject,
    idempotencyKey,
    operationId,
    inputDigest,
    JSON.stringify(sonuc.output),
    verified.actorSubject,
    new Date().toISOString(),
  ).run();

  return json({ status: "applied", output: sonuc.output });
}

/** İşlemi yayının kendi yoluna bağlar. Yetki kontrolleri o fonksiyonların
 *  içinde: kapıyı burada tekrarlamak, birinin diğerinden geri kalması
 *  demekti. */
async function calistir(
  operationId: string,
  identity: Identity | undefined,
  input: Record<string, unknown>,
  env: Env,
): Promise<Response> {
  switch (operationId) {
    case "haber.yayinla": return publishTechnologyAs(identity!, input, env);
    case "haber.haberleriOku": return listTechnologyAs(input, env);
    case "haber.haberOku": return readTechnologyAs(input, env);
    case "haber.duzenle": return editTechnologyAs(identity!, input, env);
    case "haber.yayindanKaldir": return setTechnologyPublicationState(identity!, input, env, "withdraw");
    case "haber.yayinaAlGeri": return setTechnologyPublicationState(identity!, input, env, "restore");
    // Old operations exist only under a server-controlled rollback flag.
    case "haber.panoYaz": return writeBriefAs(identity!, input, env);
    case "haber.panoOku": return readBoardAs(identity!, env);
    case "haber.legacyYayinla": return publishAs(identity!, input, env);
    case "haber.legacyYayindanKaldir": return withdrawAs(identity!, input, env);
    case "haber.legacyYayinaAlGeri": return restoreAs(identity!, input, env);
    case "haber.yayinlariOku": return listPublished(input, env);
    default: return json({ error: `bilinmeyen işlem: ${operationId}` }, 404);
  }
}
