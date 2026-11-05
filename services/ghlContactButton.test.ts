import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Minimal DOM, enough to run public/ghl-contact-button.js as on a GHL page.
class FakeEl {
  tagName: string;
  children: FakeEl[] = [];
  parentElement: FakeEl | null = null;
  text = '';
  id = '';
  style: Record<string, string> = {};
  listeners: Record<string, Function> = {};
  attrs: Record<string, string> = {};
  constructor(tag: string, text = '') { this.tagName = tag.toUpperCase(); this.text = text; }
  get childElementCount() { return this.children.length; }
  get textContent(): string { return this.text + this.children.map((c) => c.textContent).join(''); }
  set textContent(v: string) { this.text = v; this.children = []; }
  setAttribute(k: string, v: string) { this.attrs[k] = v; if (k === 'id') this.id = v; }
  addEventListener(type: string, fn: Function) { this.listeners[type] = fn; }
  appendChild(el: FakeEl) { el.remove(); el.parentElement = this; this.children.push(el); return el; }
  remove() {
    if (!this.parentElement) return;
    const siblings = this.parentElement.children;
    siblings.splice(siblings.indexOf(this), 1);
    this.parentElement = null;
  }
  *descendants(): Generator<FakeEl> { for (const c of this.children) { yield c; yield* c.descendants(); } }
}

// A contact page whose details card has a "Contact Details" heading row.
function contactPageBody(withHeading: boolean) {
  const body = new FakeEl('body');
  const card = body.appendChild(new FakeEl('div'));
  if (withHeading) {
    const headerRow = card.appendChild(new FakeEl('div'));
    headerRow.appendChild(new FakeEl('img'));
    headerRow.appendChild(new FakeEl('span', 'Contact Details'));
  }
  card.appendChild(new FakeEl('span', 'Irene Day'));
  return body;
}

function loadButton(pathname: string, active: boolean | 'network-error', body = new FakeEl('body')) {
  const intervals: Function[] = [];
  const opened: string[] = [];
  const openedFeatures: string[] = [];
  let fetchCount = 0;
  const all = () => [body, ...body.descendants()];
  const document = {
    body,
    getElementById: (id: string) => all().find((e) => e.id === id) ?? null,
    createElement: (tag: string) => new FakeEl(tag),
    querySelectorAll: (sel: string) => {
      const tags = sel.split(',').map((s) => s.trim().toUpperCase());
      return [...body.descendants()].filter((e) => tags.includes(e.tagName));
    },
  };
  const ctx: any = {
    location: { pathname },
    document,
    setInterval: (fn: Function) => { intervals.push(fn); return 1; },
    sessionStorage: { store: {} as Record<string, string>, getItem(k: string) { return this.store[k] ?? null; }, setItem(k: string, v: string) { this.store[k] = v; } },
    fetch: () => {
      fetchCount++;
      return active === 'network-error'
        ? Promise.reject(new Error('blocked'))
        : Promise.resolve({ ok: true, json: () => Promise.resolve({ active }) });
    },
    open: (url: string, _name: string, features: string) => { opened.push(url); openedFeatures.push(features); },
    encodeURIComponent,
    console,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync('public/ghl-contact-button.js', 'utf8'), ctx);
  return {
    ctx, body, opened, openedFeatures,
    fetches: () => fetchCount,
    byId: (id: string) => document.getElementById(id),
    tick: () => Promise.all(intervals.map((fn) => fn())),
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { await flush(); await flush(); await flush(); };
const CONTACT_PAGE = '/v2/location/abcDEF1234567890xyz/contacts/detail/Contact123ABC';
const INLINE = 'filershub-sync-contact-inline';
const CORNER = 'filershub-sync-contact-btn';

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

test('puts the button in the Contact Details heading row of the card', async () => {
  const page = loadButton(CONTACT_PAGE, true, contactPageBody(true));
  await settle();
  const inline = page.byId(INLINE) as FakeEl;
  assert.ok(inline, 'inline button present');
  assert.equal(inline.parentElement?.children.some((c) => c.textContent === 'Contact Details'), true);
  assert.equal(page.byId(CORNER), null, 'no corner button when inline is placed');
});

test('falls back to the corner when the card heading is not found', async () => {
  const page = loadButton(CONTACT_PAGE, true, contactPageBody(false));
  await settle();
  assert.equal(page.byId(INLINE), null);
  assert.ok(page.byId(CORNER), 'corner button present');
});

test('moves from the corner into the card once the heading renders', async () => {
  const body = contactPageBody(false);
  const page = loadButton(CONTACT_PAGE, true, body);
  await settle();
  assert.ok(page.byId(CORNER));
  const row = body.children[0].appendChild(new FakeEl('div'));
  row.appendChild(new FakeEl('span', 'Contact Details'));
  await page.tick();
  assert.ok(page.byId(INLINE));
  assert.equal(page.byId(CORNER), null);
});

test('clicking opens the popup without a link back to GHL', async () => {
  const page = loadButton(CONTACT_PAGE, true, contactPageBody(true));
  await settle();
  (page.byId(INLINE) as FakeEl).listeners.click();
  assert.equal(page.opened.length, 1);
  assert.match(page.opened[0], /\/ghl\/sync-contact\?location_id=abcDEF1234567890xyz&contact_id=Contact123ABC$/);
  assert.match(page.openedFeatures[0], /noopener/);
  assert.match(page.openedFeatures[0], /noreferrer/);
});

test('no button for sub-accounts not connected to FilersHub', async () => {
  const page = loadButton(CONTACT_PAGE, false, contactPageBody(true));
  await settle();
  assert.equal(page.byId(INLINE), null);
  assert.equal(page.byId(CORNER), null);
});

test('shows the button if the connection check is blocked, without remembering that', async () => {
  const page = loadButton(CONTACT_PAGE, 'network-error', contactPageBody(true));
  await settle();
  assert.ok(page.byId(INLINE));
  assert.equal(page.ctx.sessionStorage.getItem('filershub-active:abcDEF1234567890xyz'), null);
});

test('removes the button after navigating away from the contact page', async () => {
  const page = loadButton(CONTACT_PAGE, true, contactPageBody(true));
  await settle();
  assert.ok(page.byId(INLINE));
  page.ctx.location.pathname = '/v2/location/abcDEF1234567890xyz/dashboard';
  await page.tick();
  assert.equal(page.byId(INLINE), null);
  assert.equal(page.byId(CORNER), null);
});

test('checks each location once, even while a check is still running', async () => {
  const page = loadButton(CONTACT_PAGE, true, contactPageBody(true));
  await page.tick(); await page.tick();
  await settle();
  await page.tick();
  assert.equal(page.fetches(), 1);
});
