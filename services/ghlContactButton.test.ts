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
  contentWindow = {};
  setAttribute(k: string, v: string) { this.attrs[k] = v; if (k === 'id') this.id = v; }
  getAttribute(k: string) { return this.attrs[k] ?? null; }
  addEventListener(type: string, fn: Function) { this.listeners[type] = fn; }
  appendChild(el: FakeEl) { el.remove(); el.parentElement = this; this.children.push(el); return el; }
  insertBefore(el: FakeEl, ref: FakeEl | null) {
    el.remove();
    el.parentElement = this;
    const i = ref ? this.children.indexOf(ref) : -1;
    if (i < 0) this.children.push(el); else this.children.splice(i, 0, el);
    return el;
  }
  get nextSibling(): FakeEl | null {
    const s = this.parentElement?.children ?? [];
    return s[s.indexOf(this) + 1] ?? null;
  }
  get previousElementSibling(): FakeEl | null {
    const s = this.parentElement?.children ?? [];
    return s[s.indexOf(this) - 1] ?? null;
  }
  remove() {
    if (!this.parentElement) return;
    const siblings = this.parentElement.children;
    siblings.splice(siblings.indexOf(this), 1);
    this.parentElement = null;
  }
  *descendants(): Generator<FakeEl> { for (const c of this.children) { yield c; yield* c.descendants(); } }
}

// A contact page shaped like GHL's: card > sticky header > heading row > "Contact Details".
function contactPageBody(withHeading: boolean) {
  const body = new FakeEl('body');
  const card = body.appendChild(new FakeEl('div'));
  if (withHeading) {
    const header = card.appendChild(new FakeEl('div'));
    const headingRow = header.appendChild(new FakeEl('div'));
    headingRow.appendChild(new FakeEl('img'));
    headingRow.appendChild(new FakeEl('span', 'Contact Details'));
    header.appendChild(new FakeEl('div'));
  }
  card.appendChild(new FakeEl('span', 'Irene Day'));
  return body;
}

function loadButton(pathname: string, active: boolean | 'network-error', body = new FakeEl('body')) {
  const intervals: Function[] = [];
  const messageHandlers: Function[] = [];
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
    addEventListener: (type: string, fn: Function) => { if (type === 'message') messageHandlers.push(fn); },
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
    postMessage: (event: Record<string, unknown>) => messageHandlers.forEach((fn) => fn(event)),
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { await flush(); await flush(); await flush(); };
const CONTACT_PAGE = '/v2/location/abcDEF1234567890xyz/contacts/detail/Contact123ABC';
const INLINE = 'filershub-sync-contact-inline';
const CORNER = 'filershub-sync-contact-btn';
const PANEL = 'filershub-contact-returns';
const APP = 'https://app.filershub.com';
const RETURNS_URL = APP + '/ghl/contact-returns?location_id=abcDEF1234567890xyz&contact_id=Contact123ABC';

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

test('builds the tax-returns panel URL', () => {
  const { ctx } = loadButton('/', false);
  assert.equal(
    ctx.__filershubContactButton.returnsUrl('L1', 'C 2'),
    APP + '/ghl/contact-returns?location_id=L1&contact_id=C%202',
  );
});

test('adds the tax-returns panel right below the card header', async () => {
  const page = loadButton(CONTACT_PAGE, true, contactPageBody(true));
  await settle();
  const panel = page.byId(PANEL) as FakeEl;
  assert.ok(panel, 'panel present');
  assert.equal(panel.tagName, 'IFRAME');
  assert.equal(panel.getAttribute('src'), RETURNS_URL);
  const header = (page.byId(INLINE) as FakeEl).parentElement?.parentElement;
  assert.equal(panel.previousElementSibling, header);
});

test('keeps one panel and does not reload it on every check', async () => {
  const page = loadButton(CONTACT_PAGE, true, contactPageBody(true));
  await settle();
  const panel = page.byId(PANEL) as FakeEl;
  await page.tick(); await page.tick();
  assert.equal(page.byId(PANEL), panel);
  assert.equal([...page.body.descendants()].filter((e) => e.id === PANEL).length, 1);
});

test('points the panel at the new contact after moving to another contact', async () => {
  const page = loadButton(CONTACT_PAGE, true, contactPageBody(true));
  await settle();
  page.ctx.location.pathname = '/v2/location/abcDEF1234567890xyz/contacts/detail/Other456DEF';
  await page.tick();
  assert.equal(
    (page.byId(PANEL) as FakeEl).getAttribute('src'),
    APP + '/ghl/contact-returns?location_id=abcDEF1234567890xyz&contact_id=Other456DEF',
  );
});

test('no panel with the corner button, for unconnected sub-accounts, or off contact pages', async () => {
  const corner = loadButton(CONTACT_PAGE, true, contactPageBody(false));
  await settle();
  assert.equal(corner.byId(PANEL), null);

  const unconnected = loadButton(CONTACT_PAGE, false, contactPageBody(true));
  await settle();
  assert.equal(unconnected.byId(PANEL), null);

  const page = loadButton(CONTACT_PAGE, true, contactPageBody(true));
  await settle();
  page.ctx.location.pathname = '/v2/location/abcDEF1234567890xyz/dashboard';
  await page.tick();
  assert.equal(page.byId(PANEL), null);
});

test('resizes the panel only for height messages from that FilersHub panel', async () => {
  const page = loadButton(CONTACT_PAGE, true, contactPageBody(true));
  await settle();
  const panel = page.byId(PANEL) as FakeEl;
  const msg = (overrides: Record<string, unknown>) => ({
    origin: APP,
    source: panel.contentWindow,
    data: { type: 'filershub-contact-returns:height', height: 180 },
    ...overrides,
  });

  page.postMessage(msg({}));
  assert.equal(panel.style.height, '180px');

  page.postMessage(msg({ origin: 'https://evil.example', data: { type: 'filershub-contact-returns:height', height: 20 } }));
  page.postMessage(msg({ source: {}, data: { type: 'filershub-contact-returns:height', height: 20 } }));
  page.postMessage(msg({ data: { type: 'something-else', height: 20 } }));
  page.postMessage(msg({ data: { type: 'filershub-contact-returns:height', height: 'tall' } }));
  page.postMessage(msg({ data: null }));
  assert.equal(panel.style.height, '180px', 'ignored');

  page.postMessage(msg({ data: { type: 'filershub-contact-returns:height', height: 5000 } }));
  assert.equal(panel.style.height, '600px', 'capped');
});
