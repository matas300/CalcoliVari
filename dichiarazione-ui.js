(function () {
  'use strict';
  var DichiarazioneUI = {
    mount: function(containerId, year) {},
    unmount: function() {}
  };
  if (typeof window !== 'undefined') window.DichiarazioneUI = DichiarazioneUI;
  if (typeof module !== 'undefined') module.exports = DichiarazioneUI;
})();
