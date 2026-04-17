(function () {
  'use strict';
  var DichiarazioneExports = {
    exportC2: function(dich) {},
    exportC3: function(dich) {},
    buildJSON: function(dich) { return '{}'; },
    buildCSV: function(dich) { return ''; }
  };
  if (typeof window !== 'undefined') window.DichiarazioneExports = DichiarazioneExports;
  if (typeof module !== 'undefined') module.exports = DichiarazioneExports;
})();
