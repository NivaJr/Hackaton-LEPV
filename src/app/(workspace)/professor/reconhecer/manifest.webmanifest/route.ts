export const dynamic = "force-static";

export function GET() {
  return new Response(JSON.stringify({
    name: "EAI · Pontos por atitude",
    short_name: "EAI Pontos",
    description: "Professor dá pontos de patente por comportamento positivo em aula.",
    lang: "pt-BR",
    start_url: "/professor/reconhecer",
    scope: "/professor/reconhecer",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F3F6FB",
    theme_color: "#0B2161",
    icons: [{ src: "/professor/reconhecer/icone.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  }), { headers: { "Content-Type": "application/manifest+json; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
