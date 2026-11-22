/* CampusBite — cb-functions.js
   Tiny helper that calls your Firebase Cloud Functions (region asia-south1).
   Load it once, after the Firebase scripts and before rewards.js / monthly-report.js / chatbot.js.
   Usage:  CBFn.call('claimReward', { milestoneId: '...' }).then(function (res) { ... }) */
(function () {
  'use strict';
  if (window.CBFn) return;
  var REGION = 'asia-south1', loading = null;

  function load() {
    if (window.firebase && firebase.functions) return Promise.resolve();
    if (loading) return loading;
    loading = new Promise(function (ok, bad) {
      var s = document.createElement('script');
      s.src = 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions-compat.js';
      s.onload = ok; s.onerror = function () { loading = null; bad(new Error('Could not load the Firebase Functions library. Check your internet connection.')); };
      document.head.appendChild(s);
    });
    return loading;
  }

  function nice(e) {
    var code = e && e.code ? String(e.code).replace('functions/', '') : '';
    if (code === 'not-found' && /function/i.test(e.message || '')) return 'The CampusBite Cloud Functions are not deployed yet. See SETUP-NEW-FEATURES.txt.';
    if (code === 'internal' || code === 'unavailable') return (e.message && e.message !== 'internal') ? e.message : 'The server is not reachable right now. Please try again.';
    return (e && e.message) || 'Something went wrong. Please try again.';
  }

  window.CBFn = {
    call: function (name, data) {
      return load().then(function () {
        return firebase.app().functions(REGION).httpsCallable(name)(data || {});
      }).then(function (r) { return r.data; })
        .catch(function (e) { var err = new Error(nice(e)); err.code = e && e.code; throw err; });
    }
  };
})();
