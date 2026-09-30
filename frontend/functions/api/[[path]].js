const jsonHeaders = { 'content-type': 'application/json; charset=utf-8' };

export async function onRequest(context) {
  const backendBase = context.env.BACKEND_API_URL?.trim().replace(/\/+$/, '');
  if (!backendBase) {
    return new Response(JSON.stringify({ error: 'API backend is not configured.' }), {
      status: 503,
      headers: jsonHeaders,
    });
  }

  let backendUrl;
  try {
    backendUrl = new URL(`${backendBase}${new URL(context.request.url).pathname}${new URL(context.request.url).search}`);
    if (backendUrl.protocol !== 'https:' && backendUrl.hostname !== 'localhost') {
      throw new Error('BACKEND_API_URL must use HTTPS.');
    }
  } catch {
    return new Response(JSON.stringify({ error: 'API backend URL is invalid.' }), {
      status: 500,
      headers: jsonHeaders,
    });
  }

  const headers = new Headers(context.request.headers);
  headers.delete('host');
  headers.delete('content-length');

  const hasBody = !['GET', 'HEAD'].includes(context.request.method);
  return fetch(backendUrl, {
    method: context.request.method,
    headers,
    body: hasBody ? context.request.body : undefined,
    redirect: 'manual',
  });
}
