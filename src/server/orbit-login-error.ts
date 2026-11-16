/**
 * OAuth callbacks carry a one-use authorization code in the query string.
 * Redirect error cases to a fixed route, never retaining code/state or
 * the short-lived PKCE cookie on an error page.
 */
export const LOGIN_ERRORS = {
  config: { status: 503, title: 'Giriş şu anda kullanılamıyor', message: 'Orbit bağlantısı henüz hazır değil. Bir süre sonra yeniden deneyebilirsin.' },
  params: { status: 400, title: 'Giriş bağlantısı eksik', message: 'Orbit’ten gelen giriş bağlantısı eksik görünüyor. Girişi yeniden başlatabilirsin.' },
  expired: { status: 400, title: 'Giriş süresi doldu', message: 'Bu giriş denemesi artık geçerli değil. Yeni bir giriş başlatabilirsin.' },
  state: { status: 400, title: 'Giriş doğrulanamadı', message: 'Giriş isteğiyle dönüş bilgileri eşleşmedi. Güvenliğin için işlemi durdurduk.' },
  token: { status: 502, title: 'Giriş tamamlanamadı', message: 'Orbit bağlantısı kurulsa da giriş tamamlanamadı. Daha sonra yeniden deneyebilirsin.' },
  verification: { status: 401, title: 'Kimlik doğrulanamadı', message: 'Orbit kimliği doğrulanamadı. Girişi yeniden başlatabilirsin.' },
  identityUnavailable: { status: 503, title: 'Doğrulama geçici olarak kullanılamıyor', message: 'Orbit’in kimlik doğrulama hizmetine şu anda ulaşılamıyor.' },
} as const;

export type LoginErrorKind = keyof typeof LOGIN_ERRORS;

export function loginErrorRedirect(kind: LoginErrorKind, clearCookie: string): Response {
  const headers = new Headers({
    location: '/giris/hata/?tur=' + kind,
    'cache-control': 'private, no-store',
    'referrer-policy': 'no-referrer',
    'x-robots-tag': 'noindex, nofollow',
  });
  if (clearCookie) headers.append('set-cookie', clearCookie);
  return new Response(null, { status: 303, headers });
}

export function loginErrorKind(raw: string | null): LoginErrorKind {
  if (raw && Object.hasOwn(LOGIN_ERRORS, raw)) return raw as LoginErrorKind;
  return 'params';
}
