"use strict";

/* =====================================================================
 * Passwortschutz: Die Daten (Schlüsseltexte, Bildzuordnung, Merkmalsblatt) liegen
 * verschlüsselt in daten.enc.js und werden erst mit dem richtigen Passwort im Browser
 * entschlüsselt. Danach wird die eigentliche App (app.js) geladen.
 * ===================================================================== */
(function () {
  const APP_SRC = "app.js?v=7";
  const REMEMBER_KEY = "bestimmungstrainer-pw";

  async function decrypt(password) {
    const raw = Uint8Array.from(atob(ENC_DATA), (c) => c.charCodeAt(0));
    // Format von openssl enc: "Salted__" | 8 Byte Salt | verschlüsselte Daten
    const salt = raw.slice(8, 16), data = raw.slice(16);
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: ENC_ITER, hash: "SHA-256" }, base, 384));
    const key = await crypto.subtle.importKey("raw", bits.slice(0, 32), "AES-CBC", false, ["decrypt"]);
    const plain = await crypto.subtle.decrypt({ name: "AES-CBC", iv: bits.slice(32, 48) }, key, data);
    const text = new TextDecoder("utf-8", { fatal: true }).decode(plain);
    if (!text.startsWith("/*BT-OK*/")) throw new Error("falsches Passwort");
    return text;
  }

  function startApp(source) {
    const data = document.createElement("script");
    data.textContent = source;            // definiert GROUPS, KEYS, IMAGES, FISH_SHEET …
    document.body.appendChild(data);
    const app = document.createElement("script");
    app.src = APP_SRC;
    document.body.appendChild(app);
    document.querySelectorAll(".after-login").forEach((e) => (e.hidden = false));
  }

  function remembered() {
    try { return localStorage.getItem(REMEMBER_KEY); } catch (e) { return null; }
  }
  function remember(pw) {
    try { if (pw) localStorage.setItem(REMEMBER_KEY, pw); else localStorage.removeItem(REMEMBER_KEY); } catch (e) { /* privater Modus */ }
  }

  function showLogin(message) {
    document.getElementById("app").innerHTML = `<section class="login">
      <div class="login-card">
        <div class="login-mark">🔎</div>
        <h1>Bestimmungs-Trainer</h1>
        <p class="muted">Bitte gib das Passwort ein, um die Lernseite zu öffnen.</p>
        <form id="login-form" autocomplete="on">
          <label class="sr-only" for="login-pw">Passwort</label>
          <input id="login-pw" class="ans" type="password" autocomplete="current-password" placeholder="Passwort" required>
          <label class="remember"><input type="checkbox" id="login-remember"> Auf diesem Gerät angemeldet bleiben</label>
          <button class="btn primary" type="submit">Öffnen</button>
          <div class="login-msg" role="alert">${message || ""}</div>
        </form>
      </div>
    </section>`;
    const form = document.getElementById("login-form");
    const input = document.getElementById("login-pw");
    input.focus();
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = form.querySelector("button");
      btn.disabled = true; btn.textContent = "Wird geöffnet …";
      try {
        const source = await decrypt(input.value);
        remember(document.getElementById("login-remember").checked ? input.value : null);
        startApp(source);
      } catch (err) {
        btn.disabled = false; btn.textContent = "Öffnen";
        form.querySelector(".login-msg").textContent = "Das Passwort ist leider falsch.";
        input.select();
      }
    });
  }

  document.addEventListener("click", (e) => {
    if (!e.target.closest("[data-act=logout]")) return;
    e.preventDefault();
    remember(null);
    location.hash = "";
    location.reload();
  });

  if (!window.crypto || !crypto.subtle) {
    document.getElementById("app").innerHTML = `<section class="login"><div class="login-card"><h1>Browser nicht unterstützt</h1>
      <p class="muted">Dieser Browser kann die geschützten Daten nicht entschlüsseln. Bitte einen aktuellen Browser (Safari, Chrome, Firefox, Edge) verwenden.</p></div></section>`;
    return;
  }
  const saved = remembered();
  if (saved) decrypt(saved).then(startApp).catch(() => { remember(null); showLogin(); });
  else showLogin();
})();
