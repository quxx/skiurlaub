export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public retryAfter?: number,
  ) {
    super(message);
  }
}
export function json(data: unknown, status = 200, headers?: HeadersInit) {
  const result = new Response(JSON.stringify(data), { status, headers });
  result.headers.set('Content-Type', 'application/json; charset=utf-8');
  result.headers.set('Cache-Control', 'no-store');
  result.headers.set('X-Content-Type-Options', 'nosniff');
  result.headers.set('Referrer-Policy', 'no-referrer');
  return result;
}
export async function body(
  request: Request,
  maxBytes = 4096,
): Promise<unknown> {
  if (
    !request.headers
      .get('content-type')
      ?.toLowerCase()
      .startsWith('application/json')
  )
    throw new HttpError(415, 'JSON_REQUIRED', 'JSON-Anfrage erforderlich.');
  const reader = request.body?.getReader();
  if (!reader)
    throw new HttpError(400, 'INVALID_BODY', 'Anfrage ist unvollständig.');
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    length += part.value.length;
    if (length > maxBytes) {
      await reader.cancel();
      throw new HttpError(413, 'BODY_TOO_LARGE', 'Anfrage ist zu groß.');
    }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new HttpError(400, 'INVALID_BODY', 'Ungültige Anfrage.');
  }
}
export function checkWriteOrigin(request: Request, origin: string) {
  if (isNativeRequest(request)) return;
  if (
    request.headers.get('origin') !== origin ||
    request.headers.get('x-skiurlaub-request') !== '1'
  )
    throw new HttpError(403, 'ORIGIN_DENIED', 'Anfrage nicht erlaubt.');
}

// Native HTTP has no browser origin/cookie context. The header is a transport
// selector, never an identity proof; private endpoints still require an app session.
export function isNativeRequest(request: Request): boolean {
  return (
    request.headers.get('x-skiurlaub-client') === 'android' &&
    request.headers.get('x-skiurlaub-request') === '1' &&
    !request.headers.has('origin') &&
    !request.headers.has('cookie') &&
    !request.headers.has('sec-fetch-site')
  );
}
