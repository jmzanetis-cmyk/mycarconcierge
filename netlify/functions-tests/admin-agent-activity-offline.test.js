'use strict';

// Task #344 — Regression test for the Task #338 safeFetch wrapper.
//
// When the network is down (or the dev server doesn't expose the
// /api/admin/agent-fleet routes), the three background loaders in
// www/admin-agent-activity.js — fetchFleet, fetchLegacy, and
// fetchOpenDeadLetter — all call safeFetch, which swallows the
// TypeError('Failed to fetch') and returns a non-OK shape so the
// existing empty-state path runs.
//
// This test loads the module into a minimal stubbed DOM, replaces
// fetch with a function that always throws TypeError('Failed to
// fetch'), invokes window.renderAgentActivityPanel against a real
// container element, and asserts that the panel renders the empty
// state ("No agent activity yet for this record.") instead of the
// red "Failed to load agent activity:" banner.
//
// Run: node netlify/functions-tests/admin-agent-activity-offline.test.js

const fs   = require('node:fs');
const path = require('node:path');
const vm   = require('node:vm');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { console.log('  ok ', name); pass++; }
  else { console.error('  FAIL', name, detail || ''); fail++; }
}

// ---------- Minimal DOM stub -------------------------------------------------
// Just enough for renderAgentActivityPanel + ensureDrawerStyles to run.
function makeEl(tag) {
  const el = {
    tagName: String(tag || 'div').toUpperCase(),
    id: '',
    children: [],
    _attrs: {},
    _listeners: {},
    innerHTML: '',
    textContent: '',
    classList: {
      _set: new Set(),
      add(c)    { this._set.add(c); },
      remove(c) { this._set.delete(c); },
      contains(c) { return this._set.has(c); },
    },
    style: {},
    appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
    removeChild(child) {
      const i = this.children.indexOf(child);
      if (i >= 0) this.children.splice(i, 1);
      return child;
    },
    setAttribute(k, v) { this._attrs[k] = String(v); },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this._attrs, k) ? this._attrs[k] : null; },
    removeAttribute(k) { delete this._attrs[k]; },
    addEventListener(type, fn) {
      (this._listeners[type] = this._listeners[type] || []).push(fn);
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    contains() { return false; },
    closest() { return null; },
  };
  return el;
}

const elementsById = new Map();
const documentStub = {
  _head: makeEl('head'),
  _body: makeEl('body'),
  get head() { return this._head; },
  get body() { return this._body; },
  getElementById(id) { return elementsById.get(id) || null; },
  createElement(tag) { return makeEl(tag); },
  execCommand() { return true; },
};

const localStorageStub = {
  _data: {},
  getItem(k) { return Object.prototype.hasOwnProperty.call(this._data, k) ? this._data[k] : null; },
  setItem(k, v) { this._data[k] = String(v); },
  removeItem(k) { delete this._data[k]; },
};

// Network-down stub: every fetch call throws the exact TypeError the
// browser raises when DNS/connect fails — this is precisely the case
// Task #338 fixed.
let fetchCalls = 0;
function fetchOffline() {
  fetchCalls++;
  throw new TypeError('Failed to fetch');
}

// Build the sandbox. The IIFE in admin-agent-activity.js references
// `window`, `document`, `localStorage`, `fetch`, `navigator`,
// `setTimeout`, and `URLSearchParams`. Provide them all.
const windowStub = {};
const sandbox = {
  window: windowStub,
  document: documentStub,
  localStorage: localStorageStub,
  navigator: { clipboard: null },
  fetch: fetchOffline,
  setTimeout, clearTimeout,
  URLSearchParams,
  console,
};
sandbox.globalThis = sandbox;
windowStub.document = documentStub;
windowStub.localStorage = localStorageStub;

vm.createContext(sandbox);

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'www', 'admin-agent-activity.js'),
  'utf8'
);
vm.runInContext(SRC, sandbox, { filename: 'admin-agent-activity.js' });

ok('IIFE exposes window.renderAgentActivityPanel',
   typeof windowStub.renderAgentActivityPanel === 'function');

// ---------- Exercise the offline path ---------------------------------------
const container = makeEl('div');
container.id = 'aap-test-container';
elementsById.set(container.id, container);

// renderAgentActivityPanel writes innerHTML then immediately calls
// getElementById on `<id>-body` and `<id>-count`. Our stub doesn't
// parse HTML, so register those upfront so the lookups succeed.
const bodyEl  = makeEl('div'); bodyEl.id  = container.id + '-body';
const countEl = makeEl('span'); countEl.id = container.id + '-count';
elementsById.set(bodyEl.id, bodyEl);
elementsById.set(countEl.id, countEl);

(async () => {
  await windowStub.renderAgentActivityPanel(container.id, {
    targetId: 'test-target-123',
    targetKind: 'provider',
    agentSlug: ['gatekeeper', 'matchmaker'], // array path -> per-slug fetches
    includeAiOpsModule: 'gatekeeper',
    limit: 5,
  });

  ok('fetch was attempted at least once', fetchCalls > 0,
     `fetchCalls=${fetchCalls}`);

  const body = bodyEl.innerHTML || '';
  ok('renders empty-state copy',
     body.includes('No agent activity yet for this record.'),
     `bodyEl.innerHTML=${JSON.stringify(body).slice(0, 200)}`);

  ok('does NOT render the red error banner',
     !body.includes('Failed to load agent activity'),
     `bodyEl.innerHTML=${JSON.stringify(body).slice(0, 200)}`);

  ok('count label reads "0 entries"',
     (countEl.textContent || '') === '0 entries',
     `countEl.textContent=${JSON.stringify(countEl.textContent)}`);

  console.log('');
  console.log(`Summary: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
})().catch((e) => {
  console.error('Test crashed:', e);
  process.exit(1);
});
