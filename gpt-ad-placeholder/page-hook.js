(() => {
  const ATTR = 'data-gpt-ad-status';

  const setStatus = (slot, status) => {
    try {
      const id = slot.getSlotElementId();
      const el = document.getElementById(id);
      if (el) el.setAttribute(ATTR, status);
    } catch (e) {}
  };

  window.googletag = window.googletag || { cmd: [] };
  window.googletag.cmd.push(function () {
    try {
      const pubads = window.googletag.pubads();
      pubads.addEventListener('slotRequested', (event) => {
        setStatus(event.slot, 'requested');
      });
      pubads.addEventListener('slotRenderEnded', (event) => {
        setStatus(event.slot, event.isEmpty ? 'empty' : 'rendered');
      });
      pubads.addEventListener('slotOnload', (event) => {
        setStatus(event.slot, 'rendered');
      });
    } catch (e) {}
  });
})();
