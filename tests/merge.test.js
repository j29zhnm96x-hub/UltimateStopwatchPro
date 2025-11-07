const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const { expect } = require('chai');

describe('DataManager.mergeProjectFromPayload', function() {
  let dom;
  let window;

  before(function(done) {
    // load minimal DOM and evaluate app.js
    dom = new JSDOM(`<!doctype html><html><body><div id="app"></div></body></html>`, { runScripts: 'dangerously', resources: 'usable' });
    window = dom.window;
    // provide a simple Locales and Utils shim expected by app.js
    window.Locales = { en: { 'error.saveFailed': 'Save failed' } };
    window.Utils = { escapeHTML: (s) => (s||'') };
    // polyfill atob if missing
    if (typeof window.atob === 'undefined') window.atob = (str) => Buffer.from(str, 'base64').toString('binary');
    const appJs = fs.readFileSync(path.resolve(__dirname, '..', 'app.js'), 'utf8');
    // Evaluate inside the JSDOM window
    window.eval(appJs);
    // Wait a tick
    setTimeout(() => done(), 50);
  });

  after(function() {
    if (dom) dom.window.close();
  });

  it('merges a payload and creates a new folder and results', function() {
    const DataManager = window.DataManager;
    // ensure clean storage
    window.localStorage.setItem('as_folders', JSON.stringify([]));
    window.localStorage.setItem('as_results', JSON.stringify([]));

    const payload = {
      project: { id: 'orig-1', name: 'Imported Project', createdAt: '2020-01-01' },
      results: [
        { id: 'r1', folderId: 'orig-1', totalTime: 1000 },
        { id: 'r2', folderId: 'orig-1', totalTime: 2000 }
      ]
    };

    const res = DataManager.mergeProjectFromPayload(payload);
    const folders = DataManager.getFolders();
    const results = DataManager.getResults();

    expect(res).to.be.an('object');
    expect(res.folder).to.be.an('object');
    expect(res.folder.name).to.match(/Imported Project/);
    expect(folders.length).to.equal(1);
    expect(results.length).to.equal(2);
    // Ensure new results reference the new folder id
    expect(results[0].folderId).to.equal(res.folder.id);
    expect(results[1].folderId).to.equal(res.folder.id);
    // Ensure IDs were regenerated
    expect(results[0].id).to.not.equal('r1');
    expect(results[1].id).to.not.equal('r2');
  });
});
