// Shared UI helpers — HTML-escaping and the confirm-modal driver.
// Every page that uses these must include the #confirm-modal markup (see any
// page's HTML) — this module just wires it up instead of duplicating the same
// Promise-based dialog logic per page.

export function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Generic single-button alert modal — used for scan errors, storage errors,
// or anything else that just needs to tell the user something went wrong.
export function showAlert(title, message) {
  let modal = document.getElementById('alert-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'alert-modal';
    modal.className = 'pg-modal';
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('open'); });
    document.body.appendChild(modal);
  }
  modal.innerHTML = `
    <div class="pg-modal-box choice-modal-box">
      <div class="pg-modal-header">
        <div class="pg-modal-title">${title}</div>
        <button class="pg-close-btn" onclick="document.getElementById('alert-modal').classList.remove('open')">×</button>
      </div>
      <div class="pg-modal-body scanner-error-body">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--warn)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16" stroke-width="2.5"/>
        </svg>
        <p class="scanner-error-msg">${message}</p>
        <button style="align-self:center;" class="add-btn" onclick="document.getElementById('alert-modal').classList.remove('open')">OK</button>
      </div>
    </div>
  `;
  modal.classList.add('open');
}

let _dbErrorShown = false;
// Shown once per page load when an IndexedDB write fails (Today/Foods both
// write to IDB directly from user actions).
export function showDbError() {
  if (_dbErrorShown) return;
  _dbErrorShown = true;
  showAlert('Storage Error', 'Your data could not be saved. Device storage may be full or browser storage is restricted. Export a backup from Settings to avoid losing data.');
}

export function showConfirm(message, okLabel = 'Confirm') {
  return new Promise(resolve => {
    const modal = document.getElementById("confirm-modal");
    const ok = document.getElementById("confirm-ok");
    const cancel = document.getElementById("confirm-cancel");
    document.getElementById("confirm-message").textContent = message;
    ok.textContent = okLabel;
    modal.classList.add("open");
    function cleanup(result) {
      modal.classList.remove("open");
      ok.textContent = 'Confirm';
      ok.removeEventListener("click", onOk);
      cancel.removeEventListener("click", onCancel);
      modal.removeEventListener("click", onBackdrop);
      resolve(result);
    }
    function onOk() { cleanup(true); }
    function onCancel() { cleanup(false); }
    function onBackdrop(e) { if (e.target === modal) cleanup(false); }
    ok.addEventListener("click", onOk);
    cancel.addEventListener("click", onCancel);
    modal.addEventListener("click", onBackdrop);
  });
}
