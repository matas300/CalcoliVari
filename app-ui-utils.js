// app-ui-utils.js — UI utility condivise
// Estratto da app.js per separare modal generici dal core (SRP).
// Contenuto: showAppConfirm (drop-in replacement di window.confirm con tema custom).

(function () {
  'use strict';

  // Costruzione DOM via createElement (no innerHTML per ridurre superficie XSS).
  function _buildConfirmRoot() {
    var root = document.createElement('div');
    root.id = 'appConfirmBackdrop';
    root.className = 'app-confirm-backdrop';

    var panel = document.createElement('div');
    panel.className = 'app-confirm-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'appConfirmTitle');

    var title = document.createElement('h3');
    title.id = 'appConfirmTitle';
    title.className = 'app-confirm-title';

    var msg = document.createElement('p');
    msg.className = 'app-confirm-msg';

    var actions = document.createElement('div');
    actions.className = 'app-confirm-actions';

    var cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn-add profile-secondary-btn';
    cancelBtn.setAttribute('data-role', 'cancel');

    var okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.className = 'btn-add';
    okBtn.setAttribute('data-role', 'ok');

    actions.appendChild(cancelBtn);
    actions.appendChild(okBtn);
    panel.appendChild(title);
    panel.appendChild(msg);
    panel.appendChild(actions);
    root.appendChild(panel);
    document.body.appendChild(root);
    return root;
  }

  // showAppConfirm — drop-in replacement for window.confirm(), DOM-based, themed.
  // Call styles:
  //   showAppConfirm(message, cb)                           → legacy: cb() only on confirm
  //   showAppConfirm({ title, message, okLabel, danger })   → returns Promise<boolean>
  function showAppConfirm(optsOrMsg, cbMaybe) {
    var opts;
    if (typeof optsOrMsg === 'string') { opts = { message: optsOrMsg }; }
    else { opts = optsOrMsg || {}; }
    var titleText = opts.title || 'Conferma';
    var messageText = opts.message || '';
    var okLabel = opts.okLabel || 'Conferma';
    var cancelLabel = opts.cancelLabel || 'Annulla';
    var danger = opts.danger !== false;

    var root = document.getElementById('appConfirmBackdrop') || _buildConfirmRoot();
    var titleEl = root.querySelector('#appConfirmTitle');
    var msgEl = root.querySelector('.app-confirm-msg');
    var okBtn = root.querySelector('[data-role="ok"]');
    var cancelBtn = root.querySelector('[data-role="cancel"]');
    titleEl.textContent = titleText;
    msgEl.textContent = messageText;
    okBtn.textContent = okLabel;
    cancelBtn.textContent = cancelLabel;
    okBtn.classList.toggle('btn-add-danger', !!danger);

    return new Promise(function (resolve) {
      function cleanup(value) {
        root.classList.remove('open');
        okBtn.onclick = null;
        cancelBtn.onclick = null;
        root.onclick = null;
        document.removeEventListener('keydown', onKey);
        if (typeof cbMaybe === 'function' && value) cbMaybe();
        resolve(value);
      }
      function onKey(e) {
        if (e.key === 'Escape') cleanup(false);
        else if (e.key === 'Enter') cleanup(true);
      }
      okBtn.onclick = function () { cleanup(true); };
      cancelBtn.onclick = function () { cleanup(false); };
      root.onclick = function (e) { if (e.target === root) cleanup(false); };
      document.addEventListener('keydown', onKey);
      root.classList.add('open');
      setTimeout(function () { okBtn.focus(); }, 0);
    });
  }

  if (typeof window !== 'undefined') {
    window.showAppConfirm = showAppConfirm;
  }
})();
