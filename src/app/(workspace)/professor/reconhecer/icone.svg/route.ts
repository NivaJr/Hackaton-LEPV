export const dynamic = "force-static";

const ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#0B2161"/><circle cx="256" cy="236" r="128" fill="#18B8EA"/><path d="M256 156l24 50 54 7-40 37 10 54-48-26-48 26 10-54-40-37 54-7z" fill="#DCEB0F"/><text x="256" y="440" text-anchor="middle" font-family="Arial, sans-serif" font-size="88" font-weight="700" fill="#FFFFFF">+20</text></svg>`;

export function GET() {
  return new Response(ICON, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" } });
}
