import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Runs public/ghl-contact-button.js in a fake GHL page.
function loadButton(pathname: string, active: boolean | 'network-error') {
  const appended: any[] = [];
  const elements: Record<string, any> = {};
  const intervals: Function[] = [];
  const opened: string[] = [];
  const document = {
    getElementById: (id: string) => elements[id] ?? null,
    createElement: () => {
      const el: any = {
        style: {},
        listeners: {} as Record<string, Function>,
        setAttribute(k: string, v: string) { if (k === 'id') elements[v] = el; el[k] = v; },
        addEventListener(type: string, fn: Function) { el.listeners[type] = fn; },
        remove() { delete elements[el.id]; el.removed = true; },
      };
      return el;
    },
    body: { appendChild: (el: any) => appended.push(el) },
  };
  const ctx: any = {
    location: { pathname },
    document,
    setInterval: (fn: Function) => { intervals.push(fn); return 1; },
    sessionStorage: { store: {} as Record<string, string>, getItem(k: string) { return this.store[k] ?? null; }, setItem(k: string, v: string) { this.store[k] = v; } },
    fetch: () => active === 'network-error'
      ? Promise.reject(new Error('blocked'))
      : Promise.resolve({ ok: true, json: () => Promise.resolve({ active }) }),
    open: (url: string) => { opened.push(url); },
    encodeURIComponent,
    console,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync('public/ghl-contact-button.js', 'utf8'), ctx);
  return { ctx, appended, opened, tick: () => Promise.all(intervals.map((fn) => fn())) };
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const CONTACT_PAGE = '/v2/location/abcDEF1234567890xyz/contacts/detail/Contact123ABC';

test('parses contact pages only', () => {
  const { ctx } = loadButton('/', false);
  const api = ctx.__filershubContactButton;
  assert.deepEqual(
    { ...api.parse(CONTACT_PAGE) },
    { locationId: 'abcDEF1234567890xyz', contactId: 'Contact123ABC' },
  );
  assert.deepEqual(
    { ...api.parse(CONTACT_PAGE + '/notes') },
    { locationId: 'abcDEF1234567890xyz', contactId: 'Contact123ABC' },
  );
  assert.equal(api.parse('/v2/location/abcDEF1234567890xyz/contacts/smart_list/All'), null);
  assert.equal(api.parse('/v2/location/abcDEF1234567890xyz/dashboard'), null);
});

test('builds the FilersHub popup URL', () => {
  const { ctx } = loadButton('/', false);
  assert.equal(
    ctx.__filershubContactButton.syncUrl('L1', 'C2'),
    'https://app.filershub.com/ghl/sync-contact?location_id=L1&contact_id=C2',
  );
});

test('shows the button on a FilersHub sub-account contact page and opens the popup', async () => {
  const { appended, opened } = loadButton(CONTACT_PAGE, true);
  await flush(); await flush();
  assert.equal(appended.length, 1);
  appended[0].listeners.click();
  assert.equal(opened.length, 1);
  assert.match(opened[0], /\/ghl\/sync-contact\?location_id=abcDEF1234567890xyz&contact_id=Contact123ABC$/);
});

test('no button for sub-accounts not connected to FilersHub', async () => {
  const { appended } = loadButton(CONTACT_PAGE, false);
  await flush(); await flush();
  assert.equal(appended.length, 0);
});

test('shows the button if the connection check is blocked', async () => {
  const { appended } = loadButton(CONTACT_PAGE, 'network-error');
  await flush(); await flush();
  assert.equal(appended.length, 1);
});

test('no button away from contact pages', async () => {
  const { appended } = loadButton('/v2/location/abcDEF1234567890xyz/dashboard', true);
  await flush(); await flush();
  assert.equal(appended.length, 0);
});
