/* =========================================================
   SN Pneuflex – script.js
   ========================================================= */

// Make webhook za formu (isti URL mora da bude i u Netlify → MAKE_WEBHOOK_URL, za čet)
const MAKE_WEBHOOK_URL = "https://hook.eu2.make.com/nfxyshz524a4h28jh6n97h3ymswbemq1";

(function () {
  "use strict";

  /* ---------- Godina u footeru ---------- */
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------- Header: senka pri skrolu ---------- */
  const header = document.querySelector(".site-header");
  const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 8);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- Mobilni meni ---------- */
  const navToggle = document.querySelector(".nav-toggle");
  const nav = document.getElementById("site-nav");

  function setMenu(open) {
    nav.classList.toggle("is-open", open);
    navToggle.setAttribute("aria-expanded", String(open));
    navToggle.setAttribute("aria-label", open ? "Zatvori meni" : "Otvori meni");
  }
  navToggle.addEventListener("click", () => setMenu(!nav.classList.contains("is-open")));
  nav.addEventListener("click", (e) => { if (e.target.closest("a")) setMenu(false); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && nav.classList.contains("is-open")) { setMenu(false); navToggle.focus(); }
  });

  /* ---------- Animacije pri skrolu ---------- */
  const revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) { entry.target.classList.add("is-visible"); io.unobserve(entry.target); }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add("is-visible"));
  }

  /* ---------- Plutajuće dugme: sakrij kod forme ---------- */
  const fab = document.getElementById("fab");
  const inquirySection = document.getElementById("upit");
  if (fab && "IntersectionObserver" in window) {
    new IntersectionObserver(([entry]) => {
      fab.classList.toggle("is-hidden", entry.isIntersecting);
      document.documentElement.classList.toggle("fab-hidden", entry.isIntersecting);
    }, { threshold: 0.05 }).observe(inquirySection);
  }

  /* ---------- Galerija (lightbox) ---------- */
  const items = Array.from(document.querySelectorAll(".gallery-item"));
  const box = document.getElementById("lightbox");
  const boxFigure = box.querySelector(".lightbox-figure");
  const boxCount = box.querySelector(".lightbox-count");
  let current = 0;
  box.classList.toggle("is-single", items.length < 2);

  function showImage(i) {
    current = (i + items.length) % items.length;
    const item = items[current];
    const base = item.dataset.full;
    const alt = item.querySelector("img").alt;
    boxFigure.innerHTML = `<picture><source srcset="${base}.webp" type="image/webp"><img src="${base}.jpg" alt=""></picture>`;
    boxFigure.querySelector("img").alt = alt;
    boxCount.textContent = `${current + 1} / ${items.length}`;
  }
  items.forEach((item, i) => item.addEventListener("click", () => { showImage(i); box.showModal(); }));
  box.querySelector(".lightbox-close").addEventListener("click", () => box.close());
  box.querySelector(".lightbox-prev").addEventListener("click", () => showImage(current - 1));
  box.querySelector(".lightbox-next").addEventListener("click", () => showImage(current + 1));
  box.addEventListener("click", (e) => { if (e.target === box) box.close(); });
  box.addEventListener("close", () => items[current].focus());
  box.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") showImage(current - 1);
    if (e.key === "ArrowRight") showImage(current + 1);
  });
  let touchX = null;
  box.addEventListener("touchstart", (e) => { touchX = e.changedTouches[0].clientX; }, { passive: true });
  box.addEventListener("touchend", (e) => {
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 50) showImage(current + (dx < 0 ? 1 : -1));
  }, { passive: true });

  /* ---------- Forma za zakazivanje ---------- */
  const form = document.getElementById("inquiry-form");
  const serviceSelect = document.getElementById("f-usluga");
  const dateInput = document.getElementById("f-datum");
  const submitBtn = document.getElementById("submit-btn");
  const statusEl = document.getElementById("form-status");

  // source: "sms" kada je posetilac došao sa ?src=sms, inače "form"
  const source = new URLSearchParams(location.search).get("src") === "sms" ? "sms" : "form";
  document.getElementById("f-source").value = source;

  // Lokalni datum (toISOString bi posle ponoći vratio juče)
  const now = new Date();
  const today = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
  dateInput.min = today;

  // 060 3355657 → +381603355657; strani brojevi (+387…) ostaju kakvi jesu. Prazan string = neispravan broj.
  function normalizePhone(value) {
    let v = String(value || "").trim().replace(/[\s\/().-]/g, "");
    if (v.startsWith("00")) v = "+" + v.slice(2);
    if (v.startsWith("381")) v = "+" + v;
    else if (v.startsWith("0")) v = "+381" + v.slice(1);
    else if (/^[1-9]/.test(v)) v = "+381" + v;
    if (v.startsWith("+381")) return /^\+381\d{8,10}$/.test(v) ? v : "";
    return /^\+\d{8,15}$/.test(v) ? v : "";
  }

  const validators = {
    ime: (v) => (v.trim().length < 2 ? "Unesite ime." : ""),
    telefon: (v) => {
      if (!v.trim()) return "Unesite broj telefona.";
      return normalizePhone(v) ? "" : "Unesite ispravan broj telefona (npr. 064 123 4567).";
    },
    usluga: (v) => (v ? "" : "Izaberite uslugu."),
    datum: (v) => {
      if (!v) return "";
      if (v < today) return "Izaberite današnji ili neki kasniji datum.";
      return new Date(v + "T12:00").getDay() === 0 ? "Nedeljom ne radimo. Izaberite drugi dan." : "";
    },
  };

  function fieldWrap(el) { return el.closest(".field"); }
  function errorEl(el) { return document.getElementById(el.id + "-err"); }

  function showError(el, msg) {
    fieldWrap(el).classList.add("has-error");
    el.setAttribute("aria-invalid", "true");
    errorEl(el).textContent = msg;
  }
  function clearError(el) {
    fieldWrap(el).classList.remove("has-error");
    el.removeAttribute("aria-invalid");
    const err = errorEl(el);
    if (err) err.textContent = "";
  }

  function validateField(el) {
    const check = validators[el.name];
    if (!check) return true;
    const msg = check(el.value);
    msg ? showError(el, msg) : clearError(el);
    return !msg;
  }

  Object.keys(validators).forEach((name) => {
    const el = form.elements[name];
    el.addEventListener("blur", () => { if (el.value) validateField(el); });
    el.addEventListener("input", () => { if (fieldWrap(el).classList.contains("has-error")) validateField(el); });
    el.addEventListener("change", () => { if (el.type === "date" || fieldWrap(el).classList.contains("has-error")) validateField(el); });
  });

  function setStatus(type, html) {
    statusEl.hidden = false;
    statusEl.className = "form-status is-" + type;
    statusEl.innerHTML = html;
  }
  const CALL_US = 'Pokušajte ponovo ili pozovite <a href="tel:+381603355657">060 3355657</a>.';
  const SUCCESS = "Hvala! Zahtev je poslat. Kontaktiraćemo vas da potvrdimo termin.";

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    statusEl.hidden = true;

    // Honeypot: polje koje ljudi ne vide – ako je popunjeno, u pitanju je bot.
    if (form.elements.website.value) { form.reset(); setStatus("success", SUCCESS); return; }

    let firstInvalid = null;
    Object.keys(validators).forEach((name) => {
      const el = form.elements[name];
      if (!validateField(el) && !firstInvalid) firstInvalid = el;
    });
    if (firstInvalid) {
      setStatus("error", "Molimo vas da ispravite označena polja.");
      firstInvalid.focus();
      return;
    }

    const data = {
      ime: form.elements.ime.value.trim(),
      telefon: normalizePhone(form.elements.telefon.value),
      usluga: serviceSelect.value,
      vozilo: form.elements.vozilo.value.trim(),
      dimenzija: form.elements.dimenzija.value.trim(),
      datum: dateInput.value,
      doba_dana: form.elements.doba_dana.value,
      napomena: form.elements.napomena.value.trim(),
      source: form.elements.source.value,
      timestamp: new Date().toISOString(),
    };
    console.log("[SN Pneuflex] Payload forme:", data);

    // Dok webhook nije podešen, nikada ne prikazujemo lažan uspeh – upit bi se izgubio
    if (MAKE_WEBHOOK_URL.includes("ZAMENITE")) {
      console.warn("[SN Pneuflex] MAKE_WEBHOOK_URL nije podešen u script.js – upit NIJE poslat.");
      setStatus("error", "Slanje trenutno nije moguće. Pozovite <a href=\"tel:+381603355657\">060 3355657</a>.");
      return;
    }

    const originalLabel = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = "Slanje…";

    try {
      const res = await fetch(MAKE_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        signal: AbortSignal.timeout(20000),
      });
      // Make vraća {"ok":true} tek kada je upit obrađen (modul "Webhook response").
      // Samo "Accepted" znači da je scenario isključen i da upit čeka u redu – to NIJE uspeh.
      const text = (await res.text()).trim();
      let confirmed = false;
      try { confirmed = JSON.parse(text).ok === true; } catch { /* nije JSON */ }
      if (!res.ok || !confirmed) throw new Error("Make nije potvrdio upit: HTTP " + res.status + " " + text.slice(0, 100));

      form.reset();
      form.elements.source.value = source;
      setStatus("success", SUCCESS);
    } catch (err) {
      console.error("Greška pri slanju upita:", err);
      setStatus("error", "Došlo je do greške pri slanju. " + CALL_US);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalLabel;
    }
  });
})();
