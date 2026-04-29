/**
 * modal.js
 * Reusable styled replacements for browser prompt() and confirm().
 * Both functions return Promises so callers can use await.
 *
 *   const name = await uiPrompt("Add Team", "e.g. Finance");
 *   if (!name) return;  // user cancelled
 *
 *   const ok = await uiConfirm("Clear Desks", "This will clear the current day.", "Clear");
 *   if (!ok) return;
 */

// ── Shared backdrop ───────────────────────────────────────────────────────────

function getBackdrop() {
  let el = document.getElementById("modalBackdrop");
  if (!el) {
    el = document.createElement("div");
    el.id = "modalBackdrop";
    el.className = "modal-backdrop";
    document.body.appendChild(el);
  }
  return el;
}

function showBackdrop() { getBackdrop().classList.add("active"); }
function hideBackdrop() { getBackdrop().classList.remove("active"); }

// ── uiPrompt ──────────────────────────────────────────────────────────────────

/**
 * Styled replacement for prompt().
 * @param {string} title        - Modal heading
 * @param {string} [label]      - Input field label
 * @param {string} [defaultVal] - Pre-filled value
 * @param {string} [confirmBtn] - Confirm button label (default "OK")
 * @returns {Promise<string|null>} Resolves with the entered string, or null if cancelled
 */
export function uiPrompt(title, label = "", defaultVal = "", confirmBtn = "OK") {
  return new Promise(resolve => {
    const modal = document.getElementById("uiPromptModal");
    const elTitle   = document.getElementById("uiPromptTitle");
    const elLabel   = document.getElementById("uiPromptLabel");
    const elInput   = document.getElementById("uiPromptInput");
    const elConfirm = document.getElementById("uiPromptConfirm");
    const elCancel  = document.getElementById("uiPromptCancel");

    elTitle.textContent   = title;
    elLabel.textContent   = label;
    elLabel.style.display = label ? "block" : "none";
    elInput.value         = defaultVal;
    elConfirm.textContent = confirmBtn;

    modal.style.display = "block";
    showBackdrop();
    elInput.focus();
    elInput.select();

    function finish(value) {
      modal.style.display = "none";
      hideBackdrop();
      elConfirm.removeEventListener("click", onConfirm);
      elCancel.removeEventListener("click", onCancel);
      elInput.removeEventListener("keydown", onKey);
      resolve(value);
    }

    function onConfirm() { finish(elInput.value.trim() || null); }
    function onCancel()  { finish(null); }
    function onKey(e) {
      if (e.key === "Enter")  onConfirm();
      if (e.key === "Escape") onCancel();
    }

    elConfirm.addEventListener("click",  onConfirm);
    elCancel.addEventListener("click",   onCancel);
    elInput.addEventListener("keydown",  onKey);
  });
}

// ── uiConfirm ────────────────────────────────────────────────────────────────

/**
 * Styled replacement for confirm().
 * @param {string}  title       - Modal heading
 * @param {string}  message     - Body text
 * @param {string}  [confirmBtn]- Confirm button label (default "OK")
 * @param {boolean} [danger]    - If true, confirm button is red
 * @returns {Promise<boolean>}  Resolves true if confirmed, false if cancelled
 */
export function uiConfirm(title, message, confirmBtn = "OK", danger = false) {
  return new Promise(resolve => {
    const modal = document.getElementById("uiConfirmModal");
    const elTitle   = document.getElementById("uiConfirmTitle");
    const elMsg     = document.getElementById("uiConfirmMsg");
    const elConfirm = document.getElementById("uiConfirmConfirm");
    const elCancel  = document.getElementById("uiConfirmCancel");

    elTitle.textContent   = title;
    elMsg.textContent     = message;
    elConfirm.textContent = confirmBtn;
    elConfirm.className   = danger ? "btn-danger" : "";

    modal.style.display = "block";
    showBackdrop();
    elConfirm.focus();

    function finish(value) {
      modal.style.display = "none";
      hideBackdrop();
      elConfirm.removeEventListener("click",  onConfirm);
      elCancel.removeEventListener("click",   onCancel);
      document.removeEventListener("keydown", onKey);
      resolve(value);
    }

    function onConfirm() { finish(true); }
    function onCancel()  { finish(false); }
    function onKey(e) {
      if (e.key === "Enter")  onConfirm();
      if (e.key === "Escape") onCancel();
    }

    elConfirm.addEventListener("click",  onConfirm);
    elCancel.addEventListener("click",   onCancel);
    document.addEventListener("keydown", onKey);
  });
}

// ── uiChoice ─────────────────────────────────────────────────────────────────

/**
 * Multi-button choice modal. Returns the value of the chosen option, or null on Escape.
 * @param {string} title
 * @param {string} message
 * @param {Array<{label:string,value:any,style?:"primary"|"secondary"|"danger"}>} options
 * @returns {Promise<any|null>}
 */
export function uiChoice(title, message, options) {
  return new Promise(resolve => {
    let modal = document.getElementById("uiChoiceModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id        = "uiChoiceModal";
      modal.className = "ui-modal";
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      modal.innerHTML = `
        <h3 class="ui-modal-title"></h3>
        <p class="ui-modal-msg"></p>
        <div class="modal-actions" style="flex-wrap:wrap;"></div>
      `;
      document.body.appendChild(modal);
    }

    const elTitle   = modal.querySelector(".ui-modal-title");
    const elMsg     = modal.querySelector(".ui-modal-msg");
    const elActions = modal.querySelector(".modal-actions");

    elTitle.textContent = title;
    elMsg.textContent   = message;
    elActions.innerHTML = "";

    const cleanup = () => {
      modal.style.display = "none";
      getBackdrop().classList.remove("active");
      document.removeEventListener("keydown", onKey);
    };

    options.forEach((opt, i) => {
      const btn = document.createElement("button");
      btn.textContent = opt.label;
      if (opt.style === "secondary") btn.className = "btn-secondary";
      if (opt.style === "danger")    btn.className = "btn-danger";
      btn.addEventListener("click", () => { cleanup(); resolve(opt.value); });
      elActions.appendChild(btn);
      if (i === 0) setTimeout(() => btn.focus(), 30);
    });

    function onKey(e) { if (e.key === "Escape") { cleanup(); resolve(null); } }
    document.addEventListener("keydown", onKey);

    modal.style.display = "block";
    getBackdrop().classList.add("active");
  });
}
