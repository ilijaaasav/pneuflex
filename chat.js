/* =========================================================
   SN Pneuflex – AI asistent (widget)
   Razgovor ide preko /api/chat (Netlify Function).
   ========================================================= */
(function () {
  "use strict";

  const ENDPOINT = "/api/chat";
  const MAX_USER_MESSAGES = 12; // funkcija prihvata najviše 24 poruke u istoriji
  const MAX_CHARS = 500;
  const GREETING =
    "Zdravo! Ja sam asistent radnje SN Pneuflex. Mogu da vam pomognem oko guma, felni, hotela za gume i zakazivanja. Šta vas zanima?";
  const CHIPS = ["Zakaži zamenu guma", "Imate li gume za moj auto?", "Kako radi hotel za gume?", "Radno vreme i lokacija"];
  const SERVICES = ["Zamena guma", "Kupovina guma", "Kupovina felni", "Hotel za gume", "Akumulator", "Drugo"];

  const history = []; // { role: "user" | "assistant", content }
  let userCount = 0;
  let busy = false;
  let formShown = false;
  let leadSent = false;

  /* ---------- Pomoćne ---------- */
  const el = (tag, attrs = {}, html = "") => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (html) n.innerHTML = html;
    return n;
  };
  const escapeHtml = (s) =>
    s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function format(text) {
    const lines = escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").split("\n");
    let html = "", inList = false;
    for (const line of lines) {
      const m = line.match(/^\s*[-•*]\s+(.*)/);
      if (m) { if (!inList) { html += "<ul>"; inList = true; } html += `<li>${m[1]}</li>`; continue; }
      if (inList) { html += "</ul>"; inList = false; }
      if (line.trim()) html += `<p>${line}</p>`;
    }
    if (inList) html += "</ul>";
    return html;
  }

  /* ---------- Struktura ---------- */
  const ICON_CHAT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>';
  const ICON_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  const ICON_SEND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>';

  const launcher = el("button", { class: "chat-launcher", type: "button", "aria-expanded": "false", "aria-controls": "chat-panel" },
    `${ICON_CHAT}<span class="chat-launcher-label">Pitajte asistenta</span>`);
  launcher.setAttribute("aria-label", "Otvori čet sa asistentom");

  const panel = el("section", { class: "chat-panel", id: "chat-panel", role: "dialog", "aria-modal": "false", "aria-label": "Čet sa asistentom", hidden: "" });
  panel.innerHTML = `
    <header class="chat-head">
      <img src="images/favicon.svg" alt="" width="34" height="34">
      <div class="chat-title"><strong>Asistent SN Pneuflex</strong><small>AI asistent · odgovara odmah</small></div>
      <button type="button" class="chat-close" aria-label="Zatvori čet">${ICON_X}</button>
    </header>
    <div class="chat-log" role="log" aria-live="polite"></div>
    <div class="chat-chips"></div>
    <form class="chat-input" novalidate>
      <label class="sr-only" for="chat-text">Vaša poruka</label>
      <textarea id="chat-text" rows="1" maxlength="${MAX_CHARS}" placeholder="Napišite pitanje…"></textarea>
      <input type="text" name="website" class="chat-hp" tabindex="-1" autocomplete="off" aria-hidden="true">
      <button type="submit" class="chat-send" aria-label="Pošalji">${ICON_SEND}</button>
    </form>
    <p class="chat-note">AI asistent može da pogreši. Termin i stanje potvrđuje naš tim.</p>`;

  document.body.append(launcher, panel);

  const log = panel.querySelector(".chat-log");
  const chips = panel.querySelector(".chat-chips");
  const form = panel.querySelector(".chat-input");
  const input = panel.querySelector("#chat-text");
  const sendBtn = panel.querySelector(".chat-send");
  const honeypot = panel.querySelector(".chat-hp");

  /* ---------- Poruke ---------- */
  function addMessage(role, text) {
    const msg = el("div", { class: `chat-msg chat-msg-${role === "user" ? "user" : "bot"}` }, format(text));
    log.appendChild(msg);
    log.scrollTop = log.scrollHeight;
    return msg;
  }
  function addTyping() {
    const t = el("div", { class: "chat-msg chat-msg-bot chat-typing", "aria-label": "Asistent piše" }, "<span></span><span></span><span></span>");
    log.appendChild(t);
    log.scrollTop = log.scrollHeight;
    return t;
  }
  function renderChips() {
    chips.innerHTML = "";
    CHIPS.forEach((c) => {
      const b = el("button", { type: "button", class: "chat-chip" });
      b.textContent = c;
      b.addEventListener("click", () => send(c));
      chips.appendChild(b);
    });
  }

  async function post(payload) {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, website: honeypot.value }),
    });
    let data = {};
    try { data = await res.json(); } catch { /* prazno */ }
    if (!res.ok) throw new Error(data.error || "Asistent trenutno nije dostupan. Pozovite 060 3355657 ili pošaljite upit preko forme.");
    return data;
  }

  async function send(text) {
    text = (text || "").trim();
    if (!text || busy) return;
    if (userCount >= MAX_USER_MESSAGES) {
      addMessage("assistant", "Dostigli ste maksimalan broj poruka u ovom razgovoru. Pozovite 060 3355657 ili pošaljite upit preko forme na sajtu.");
      return;
    }
    chips.innerHTML = "";
    busy = true; sendBtn.disabled = true;
    userCount++;
    history.push({ role: "user", content: text.slice(0, MAX_CHARS) });
    addMessage("user", text);
    input.value = ""; autoGrow();
    const typing = addTyping();
    try {
      const data = await post({ action: "chat", messages: history });
      typing.remove();
      history.push({ role: "assistant", content: data.reply });
      addMessage("assistant", data.reply);
      if (data.form && !leadSent) showLeadForm(data.form);
    } catch (err) {
      typing.remove();
      history.pop(); userCount--;
      addMessage("assistant", err.message || "Došlo je do greške. Pokušajte ponovo.");
    } finally {
      busy = false; sendBtn.disabled = false; input.focus();
    }
  }

  /* ---------- Formular za upit u četu ---------- */
  function showLeadForm({ usluga = "", vozilo = "", dimenzija = "", summary = "" }) {
    if (formShown) {
      const existing = log.querySelector(".chat-lead");
      if (existing) { existing.scrollIntoView({ block: "nearest" }); return; }
    }
    formShown = true;
    const card = el("form", { class: "chat-lead", novalidate: "" });
    card.innerHTML = `
      <p class="chat-lead-title">Ostavite kontakt – tim će vas pozvati da potvrdi</p>
      <label>Ime<input name="ime" autocomplete="name" required></label>
      <label>Telefon<input name="telefon" type="tel" inputmode="tel" autocomplete="tel" placeholder="npr. 064 123 4567" required></label>
      <label>Usluga<select name="usluga">${SERVICES.map((s) => `<option${s === usluga ? " selected" : ""}>${s}</option>`).join("")}</select></label>
      <label>Vozilo (marka i model)<input name="vozilo"></label>
      <label>Dimenzija gume<input name="dimenzija" placeholder="npr. 205/55 R16"></label>
      <p class="chat-lead-error" role="alert" hidden></p>
      <button type="submit" class="btn btn-primary btn-block">Pošalji</button>`;
    // Vrednosti koje je model izdvojio idu kroz .value, a ne kroz HTML
    card.elements.vozilo.value = vozilo;
    card.elements.dimenzija.value = dimenzija;

    card.addEventListener("submit", async (e) => {
      e.preventDefault();
      const errBox = card.querySelector(".chat-lead-error");
      const btn = card.querySelector("button[type=submit]");
      const f = card.elements;
      const lead = {
        ime: f.ime.value, telefon: f.telefon.value, usluga: f.usluga.value,
        vozilo: f.vozilo.value, dimenzija: f.dimenzija.value,
        napomena: history.filter((m) => m.role === "user").map((m) => m.content).join(" | ").slice(0, 900),
      };
      errBox.hidden = true; btn.disabled = true; btn.textContent = "Šaljem…";
      try {
        await post({ action: "lead", lead, summary });
        leadSent = true;
        card.replaceWith(el("div", { class: "chat-msg chat-msg-bot chat-success" },
          "<p><strong>Hvala! Zahtev je poslat.</strong></p><p>Tim će vas kontaktirati da potvrdi termin.</p>"));
        log.scrollTop = log.scrollHeight;
      } catch (err) {
        errBox.textContent = err.message; errBox.hidden = false;
        btn.disabled = false; btn.textContent = "Pošalji";
      }
    });
    log.appendChild(card);
    // Prikaži odgovor asistenta + početak formulara (ne samo dno)
    const prev = card.previousElementSibling;
    log.scrollTop = prev ? prev.offsetTop - log.offsetTop - 10 : log.scrollHeight;
  }

  /* ---------- Otvaranje / zatvaranje ---------- */
  function setOpen(open) {
    panel.hidden = !open;
    launcher.setAttribute("aria-expanded", String(open));
    document.documentElement.classList.toggle("chat-open", open);
    if (open) {
      if (!log.children.length) { addMessage("assistant", GREETING); renderChips(); }
      setTimeout(() => input.focus(), 50);
    } else {
      launcher.focus();
    }
  }
  launcher.addEventListener("click", () => setOpen(panel.hidden));
  panel.querySelector(".chat-close").addEventListener("click", () => setOpen(false));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !panel.hidden) setOpen(false); });

  /* ---------- Unos ---------- */
  function autoGrow() { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 120) + "px"; }
  input.addEventListener("input", autoGrow);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input.value); }
  });
  form.addEventListener("submit", (e) => { e.preventDefault(); send(input.value); });
})();
