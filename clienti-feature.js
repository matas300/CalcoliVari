(function initClientiFeature() {
  function getClienteById(clienteId) {
    if (!clienteId || typeof getClienti !== 'function') return null;
    return getClienti().find(cliente => cliente.id === clienteId) || null;
  }

  function getClienteLabel(cliente) {
    if (!cliente) return 'Cliente non selezionato';
    const primary = cliente.nome || 'Cliente senza nome';
    const secondary = cliente.partitaIva || cliente.codiceFiscale || cliente.pec || '';
    return secondary ? `${primary} — ${secondary}` : primary;
  }

  function getClientiOptionsHtml(selectedId) {
    const list = typeof getClienti === 'function' ? getClienti() : [];
    const options = [`<option value="">Seleziona cliente...</option>`];
    for (const cliente of list) {
      const selected = cliente.id === selectedId ? 'selected' : '';
      options.push(`<option value="${cliente.id}" ${selected}>${escapeHtml(getClienteLabel(cliente))}</option>`);
    }
    return options.join('');
  }

  window.getClienteById = getClienteById;
  window.getClienteLabel = getClienteLabel;
  window.getClientiOptionsHtml = getClientiOptionsHtml;
})();
