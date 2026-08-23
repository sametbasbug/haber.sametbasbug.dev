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
import { publishAs, writeBriefAs, type Env } from "./index.ts";
import { authorizeAction, verifyOrbitActionToken } from "./identity.ts";

export const OPERATIONS = ["haber.panoYaz", "haber.yayinla"] as const;

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

  let body: { operationId?: unknown; input?: unknown };
  try {
    body = await request.json();
  } catch {
    return reddet(400, "gövde JSON değil");
  }
  const operationId = typeof body.operationId === "string" ? body.operationId : "";
  const input = (body.input ?? {}) as Record<string, unknown>;

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
  if (!(OPERATIONS as readonly string[]).includes(operationId)) {
    return reddetVeYaz(404, `bilinmeyen işlem: ${operationId}`);
  }

  const auth = await authorizeAction(verified, env);
  if (!auth.ok) return reddetVeYaz(auth.status, auth.error);

  const inputDigest = await digest(JSON.stringify({ operationId, input }));

  /* Tekrar mı? Aynı anahtar + aynı gövde ise ilk çalışmanın cevabı dönüyor.
   * Yayının kendi kapıları çoğu tekrarı zaten durdurur ama 409 ile — ajan
   * için "başarısız" demektir. Burada ilk cevabın aynısı dönüyor. */
  const gecmis = await env.DB.prepare(
    "SELECT input_digest, output FROM orbit_action_log WHERE subject = ? AND idempotency_key = ?",
  ).bind(verified.subject, idempotencyKey).first<any>();

  if (gecmis) {
    /* Aynı anahtar FARKLI gövdeyle geldi: bu bir tekrar değil, çakışma.
     * Sessizce ilk cevabı döndürmek, ajanın yaptığını sandığı işin hiç
     * yapılmaması olurdu. */
    if (gecmis.input_digest !== inputDigest) {
      return reddetVeYaz(409, "aynı Idempotency-Key farklı bir istekle kullanıldı");
    }
    return json({ status: "replayed", output: JSON.parse(gecmis.output) });
  }

  const response = operationId === "haber.panoYaz"
    ? await writeBriefAs(auth.identity, input, env)
    : await publishAs(auth.identity, input, env);

  const sonuc = await sonucaCevir(response, reddetVeYaz);
  if (sonuc instanceof Response) return sonuc;

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
