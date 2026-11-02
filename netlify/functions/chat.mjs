// =========================================================
// SN Pneuflex – AI asistent (Netlify Function)
// POST /api/chat
//   { action: "chat", messages: [{role, content}], website: "" }
//   { action: "lead", lead: {...}, summary: "", website: "" }
//
// Promenljive u Netlify → Environment variables:
//   ANTHROPIC_API_KEY   (obavezno)  – ključ sa console.anthropic.com
//   MAKE_WEBHOOK_URL    (obavezno)  – isti Make webhook kao u script.js
//   ALLOWED_ORIGIN      (preporučeno) – npr. https://snpneuflex.netlify.app
//   ANTHROPIC_MODEL     (opciono)   – podrazumevano claude-haiku-5-5
// =========================================================
import { systemPrompt, TOOLS, SERVICES } from "./lib/knowledge.mjs";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-5-5";
const MAX_MESSAGES = 24;      // ukupno poruka u istoriji koju prihvatamo (12 razmena, isto kao chat.js)
const SEND_LAST = 12;         // koliko poslednjih šaljemo modelu
const MAX_CHARS = 500;        // maksimalna dužina jedne poruke posetioca
const AI_TIMEOUT_MS = 8500;   // Netlify funkcija mora da završi za ~10 s
const PHONE = "060 3355657";
const PRICE_RE = /\d[\d.,\s]*(rsd|din\b|dinara|eur\b|evra|€|\$)/i;

const json = (status, body, origin) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...(origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}),
    },
  });

function allowedOrigin(req) {
  const origin = req.headers.get("origin") || "";
  const list = (process.env.ALLOWED_ORIGIN || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!list.length) return { ok: true, origin: "" }; // nije podešeno – dozvoljeno (samo za test)
  return { ok: list.includes(origin), origin };
}

function belgradeNow() {
  return new Intl.DateTimeFormat("sr-Latn-RS", {
    timeZone: "Europe/Belgrade", weekday: "long", day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date());
}

// Isto pravilo kao u script.js: 060 3355657 → +381603355657
function normalizePhone(value) {
  let v = String(value || "").trim().replace(/[\s\/().-]/g, "");
  if (v.startsWith("00")) v = "+" + v.slice(2);
  if (v.startsWith("381")) v = "+" + v;
  else if (v.startsWith("0")) v = "+381" + v.slice(1);
  else if (/^[1-9]/.test(v)) v = "+381" + v;
  if (v.startsWith("+381")) return /^\+381\d{8,10}$/.test(v) ? v : "";
  return /^\+\d{8,15}$/.test(v) ? v : "";
}

function cleanMessages(raw) {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_MESSAGES) return null;
  const out = [];
  for (const m of raw) {
    if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") return null;
    const text = m.content.trim();
    if (!text) continue;
    if (m.role === "user" && text.length > MAX_CHARS) return null;
    out.push({ role: m.role, content: text.slice(0, 2000) });
  }
  const last = out.slice(-SEND_LAST);
  while (last.length && last[0].role !== "user") last.shift(); // API traži da prva poruka bude korisnikova
  if (!last.length || last[last.length - 1].role !== "user") return null;
  return last;
}

async function askClaude(messages) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), AI_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        output_config: { effort: "low" }, // kratki odgovori u četu, unutar vremenskog ograničenja
        system: systemPrompt(belgradeNow()),
        tools: TOOLS,
        messages,
      }),
    });
    if (!res.ok) {
      console.error("Anthropic API error", res.status, (await res.text()).slice(0, 500));
      return null;
    }
    const data = await res.json();
    if (data.stop_reason === "refusal") return null;
    let reply = "";
    let form = null;
    for (const block of data.content || []) {
      if (block.type === "text") reply += block.text;
      if (block.type === "tool_use" && block.name === "ponudi_formular") {
        const input = block.input || {};
        form = {
          usluga: SERVICES.includes(input.usluga) ? input.usluga : "",
          vozilo: String(input.vozilo || "").slice(0, 80),
          dimenzija: String(input.dimenzija || "").slice(0, 30),
          summary: String(input.rezime || "").slice(0, 400),
        };
      }
    }
    reply = reply.trim();
    if (!reply && form) reply = "Ostavite kontakt u formularu ispod i tim će vas pozvati da potvrdi.";
    if (!reply) return null;
    // Cene se nikada ne prikazuju, čak ni ako ih model izmisli
    if (PRICE_RE.test(reply)) reply = `Cena je na upit. Pozovite ${PHONE} ili ostavite kontakt u formularu na sajtu.`;
    return { reply, form };
  } catch (err) {
    console.error("Anthropic request failed", err?.name, err?.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function cleanLead(raw) {
  if (!raw || typeof raw !== "object") return { error: "Neispravan zahtev." };
  const s = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const lead = {
    ime: s(raw.ime, 100),
    telefon: normalizePhone(s(raw.telefon, 40)),
    usluga: s(raw.usluga, 40),
    vozilo: s(raw.vozilo, 80),
    dimenzija: s(raw.dimenzija, 30),
    napomena: s(raw.napomena, 1000),
  };
  if (lead.ime.length < 2) return { error: "Unesite ime." };
  if (!lead.telefon) return { error: "Unesite ispravan broj telefona." };
  if (!SERVICES.includes(lead.usluga)) lead.usluga = "Drugo";
  return { lead };
}

export default async (req) => {
  const { ok, origin } = allowedOrigin(req);
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: ok ? 204 : 403,
      headers: ok && origin ? {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "Content-Type",
      } : {},
    });
  }
  if (req.method !== "POST") return json(405, { error: "Metoda nije dozvoljena." });
  if (!ok) return json(403, { error: "Zabranjen pristup." });

  let body;
  try {
    const text = await req.text();
    if (text.length > 30000) return json(413, { error: "Zahtev je prevelik." }, origin);
    body = JSON.parse(text);
  } catch {
    return json(400, { error: "Neispravan zahtev." }, origin);
  }

  // Honeypot: polje koje ljudi ne vide – ako je popunjeno, u pitanju je bot.
  if (body.website) return json(200, { ok: true, reply: "Hvala!" }, origin);

  /* ---------- Razgovor ---------- */
  if (body.action === "chat") {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error("ANTHROPIC_API_KEY nije podešen");
      return json(503, { error: `Asistent trenutno nije dostupan. Pozovite ${PHONE} ili pošaljite upit preko forme.` }, origin);
    }
    const messages = cleanMessages(body.messages);
    if (!messages) return json(400, { error: "Poruka je predugačka ili neispravna." }, origin);
    const result = await askClaude(messages);
    if (!result) return json(502, { error: `Asistent trenutno ne može da odgovori. Pozovite ${PHONE} ili pošaljite upit preko forme.` }, origin);
    return json(200, result, origin);
  }

  /* ---------- Upit iz četa → Make ---------- */
  if (body.action === "lead") {
    const { lead, error } = cleanLead(body.lead);
    if (error) return json(400, { error }, origin);
    if (!process.env.MAKE_WEBHOOK_URL) {
      console.error("MAKE_WEBHOOK_URL nije podešen");
      return json(503, { error: `Slanje trenutno nije moguće. Pozovite ${PHONE}.` }, origin);
    }
    const summary = typeof body.summary === "string" ? body.summary.trim().slice(0, 400) : "";
    const napomena = [lead.napomena, summary && `[Iz četa] ${summary}`].filter(Boolean).join("\n\n");
    try {
      const res = await fetch(process.env.MAKE_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Isti oblik kao forma u script.js, da Make scenario radi za oba izvora
        body: JSON.stringify({ ...lead, datum: "", doba_dana: "", napomena, source: "chatbot", timestamp: new Date().toISOString() }),
      });
      // Make vraća {"ok":true} tek kada je upit obrađen (modul "Webhook response").
      // Samo "Accepted" znači da je scenario isključen i da upit čeka u redu – to NIJE uspeh.
      const text = (await res.text()).trim();
      let confirmed = false;
      try { confirmed = JSON.parse(text).ok === true; } catch { /* nije JSON */ }
      if (!res.ok || !confirmed) {
        console.error("Make nije potvrdio upit", res.status, text.slice(0, 200));
        return json(502, { error: `Upit trenutno nije mogao da se sačuva. Pokušajte ponovo za minut ili pozovite ${PHONE}.` }, origin);
      }
    } catch (err) {
      console.error("Make request failed", err?.message);
      return json(502, { error: `Slanje nije uspelo. Pokušajte ponovo ili pozovite ${PHONE}.` }, origin);
    }
    return json(200, { ok: true }, origin);
  }

  return json(400, { error: "Neispravan zahtev." }, origin);
};

export const config = { path: "/api/chat" };
