// ============================================================
// Porto Wantlist Tracker — Cloudflare Worker (v2.1)
// ============================================================
// CORS proxy for checking record store websites.
// Supports both direct product page checks and search page checks.
// Returns extracted signals + bodyText for search matching.
// ============================================================

const ALLOWED_DOMAINS = new Set([
  "www.8mm-records.com", "8mm-records.com",
  "www.louielouie.pt", "louielouie.pt",
  "www.materiaprima.pt", "materiaprima.pt",
  "portocalling.com", "www.portocalling.com",
  "shopmusicandriots.com", "www.shopmusicandriots.com",
  "socorro.pt", "www.socorro.pt",
  "cdgo.com", "www.cdgo.com",
  "tubitek.pt", "www.tubitek.pt",
  "discosdobau.pt", "www.discosdobau.pt",
]);

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return cors(new Response(null, { status: 204 }));
    }

    const { searchParams } = new URL(request.url);
    const target = searchParams.get("url");

    if (!target) return json({ error: "Missing ?url= parameter" }, 400);

    let parsed;
    try { parsed = new URL(target); }
    catch { return json({ error: "Invalid URL" }, 400); }

    if (!ALLOWED_DOMAINS.has(parsed.hostname)) {
      return json({ error: `Domain not allowed: ${parsed.hostname}` }, 403);
    }

    try {
      const isJson = target.includes(".json");
      const resp = await fetch(target, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; PortoWantlistTracker/2.1)",
          "Accept": isJson
            ? "application/json"
            : "text/html,application/xhtml+xml",
        },
        redirect: "follow",
      });

      const body = await resp.text();
      const ct = resp.headers.get("content-type") || "";

      // --- JSON response (Shopify search endpoints) ---
      if (ct.includes("application/json") || ct.includes("text/json") || isJson) {
        try {
          const jsonData = JSON.parse(body);
          return json({ json: jsonData, status: resp.status, finalUrl: resp.url });
        } catch { /* fall through to HTML handling */ }
      }

      // --- HTML response ---
      const titleMatch = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : "";

      const hasBasket = /add.to.(basket|cart|carrinho)/i.test(body);
      const hasPrice =
        /"price"/i.test(body) ||
        /€\s*\d/.test(body) ||
        /\d+[.,]\d{2}\s*€/.test(body);
      const hasBuyButton = /\b(buy|comprar|adicionar|add to)\b/i.test(body);
      const hasOutOfStock =
        /out.of.stock|esgotado|fora.de.stock|indispon/i.test(body);

      const metaDesc =
        body.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i)?.[1] || "";
      const ogTitle =
        body.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)/i)?.[1] || "";

      // --- Body text for search result matching ---
      const bodyText = body
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&[a-z]+;/gi, " ")
        .replace(/&#\d+;/gi, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 10000);

      return json({
        title, ogTitle, metaDesc,
        hasBasket, hasPrice, hasBuyButton, hasOutOfStock,
        bodyText,
        status: resp.status,
        finalUrl: resp.url,
      });
    } catch (err) {
      return json({ error: err.message }, 502);
    }
  },
};

function cors(response) {
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type");
  response.headers.set("Access-Control-Max-Age", "86400");
  return response;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
