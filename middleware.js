// Vercel Edge Middleware - HTTP Basic Auth for the whole dashboard
// Credentials are read from Environment Variables set in Vercel:
//   BASIC_AUTH_USER, BASIC_AUTH_PASSWORD
// Never hardcode the password here.

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

export default function middleware(request) {
  const user = process.env.BASIC_AUTH_USER;
  const pass = process.env.BASIC_AUTH_PASSWORD;

  // If env vars are not configured, do not lock the user out.
  if (!user || !pass) {
    return;
  }

  const auth = request.headers.get('authorization');
  if (auth) {
    const scheme = auth.split(' ')[0];
    const encoded = auth.split(' ')[1] || '';
    if (scheme === 'Basic') {
      let decoded = '';
      try {
        decoded = atob(encoded);
      } catch (e) {
        decoded = '';
      }
      const idx = decoded.indexOf(':');
      const u = idx >= 0 ? decoded.slice(0, idx) : '';
      const p = idx >= 0 ? decoded.slice(idx + 1) : '';
      if (u === user && p === pass) {
        return; // authenticated -> continue to the requested resource
      }
    }
  }

  return new Response('Yeu cau dang nhap', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Dashboard NAK", charset="UTF-8"',
    },
  });
}
