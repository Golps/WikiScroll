export async function permit(env,name,key) {
  try { return !!(await env[name].limit({key:'wikiscroll:'+key})).success; }
  catch { return false; }
}
export const limited = () => new Response('Please try again shortly.',{status:429,headers:{'Retry-After':'60','Cache-Control':'no-store'}});
export function secure(response) {
  const headers=new Headers(response.headers);
  headers.set('X-Content-Type-Options','nosniff');
  headers.set('X-Frame-Options','DENY');
  headers.set('Referrer-Policy','strict-origin-when-cross-origin');
  headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  // HTTPS only. No includeSubDomains or preload: those commit other hosts.
  headers.set('Strict-Transport-Security','max-age=31536000');
  if(!headers.has('Content-Security-Policy'))headers.set('Content-Security-Policy',"object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
