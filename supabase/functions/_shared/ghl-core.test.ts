import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeToken, normalizeLocationId, bearerFrom, secretsMatch, generateSecret,
  buildStatusUpdate, describeGhlFailure, menuLinkPayload, findFirmMenuLink,
  validateActionRequest, isFilersHubAgency, isScopeError, SCOPE_ERROR_MESSAGE,
  actionHttpStatus, escapeLikePattern, pickEmailMatch, isSuperAdmin, normalizeContactId,
} from './ghl-core.ts';

test('normalizeContactId', () => {
  assert.equal(normalizeContactId(' V0H9HpQqvpt7g5U9JU6Z '), 'V0H9HpQqvpt7g5U9JU6Z');
  assert.equal(normalizeContactId('abc123'), 'abc123');
  assert.equal(normalizeContactId('abc12'), '', 'too short');
  assert.equal(normalizeContactId('a'.repeat(65)), '', 'too long');
  assert.equal(normalizeContactId('abc-123'), '');
  assert.equal(normalizeContactId('../contacts'), '');
  assert.equal(normalizeContactId(undefined), '');
  assert.equal(normalizeContactId(12345678), '12345678');
});

test('isSuperAdmin', () => {
  assert.equal(isSuperAdmin({ app_metadata: { is_super_admin: true } }), true);
  // only the server-set app_metadata flag counts, and only a real boolean true
  assert.equal(isSuperAdmin({ app_metadata: { is_super_admin: 'true' } }), false);
  assert.equal(isSuperAdmin({ user_metadata: { is_super_admin: true } }), false);
  assert.equal(isSuperAdmin({ app_metadata: {} }), false);
  assert.equal(isSuperAdmin(null), false);
});

test('normalizeToken', () => {
  assert.equal(normalizeToken('  Bearer pit-abc-123\n'), 'pit-abc-123');
  assert.equal(normalizeToken('pit-abc\n-123'), 'pit-abc-123');
});

test('normalizeLocationId', () => {
  assert.equal(normalizeLocationId('  abcDEF1234567890xyz  '), 'abcDEF1234567890xyz');
  assert.equal(
    normalizeLocationId('https://app.gohighlevel.com/v2/location/abcDEF1234567890xyz/dashboard'),
    'abcDEF1234567890xyz',
  );
  assert.equal(normalizeLocationId('not a location!'), '');
});

test('bearerFrom', () => {
  assert.equal(bearerFrom('Bearer s3cret'), 's3cret');
  assert.equal(bearerFrom(null), '');
});

test('secretsMatch', () => {
  const s = 'a'.repeat(64);
  assert.equal(secretsMatch(s, s), true);
  assert.equal(secretsMatch(s, s.slice(0, 63) + 'b'), false);
  assert.equal(secretsMatch(s, s.slice(0, 10)), false);
  assert.equal(secretsMatch('', ''), false);
  assert.equal(secretsMatch('a'.repeat(31), 'a'.repeat(31)), false);
});

test('generateSecret', () => {
  assert.match(generateSecret(), /^[0-9a-f]{64}$/);
  assert.notEqual(generateSecret(), generateSecret());
});

test('buildStatusUpdate', () => {
  assert.deepEqual(buildStatusUpdate(['vip', 'fh-status:filed'], 'Ready for Signature', 'Return Status'), {
    tags: ['vip', 'fh-status:ready-for-signature'],
    customFields: [{ key: 'Return Status', field_value: 'Ready for Signature' }],
  });
  const r = buildStatusUpdate(['vip'], 'Filed', null);
  assert.equal('customFields' in r, false);
});

test('describeGhlFailure', () => {
  const scope = {
    broken: true,
    message: 'The token is missing a required scope. Required: contacts.readonly, contacts.write, locations.readonly, users.readonly.',
  };
  assert.deepEqual(describeGhlFailure(401, '{"message":"The token is not authorized for this scope"}'), scope);
  assert.deepEqual(describeGhlFailure(403, 'not authorized for this scope'), scope);
  assert.deepEqual(describeGhlFailure(401, 'Invalid JWT'), {
    broken: true,
    message: 'GHL rejected the token. It may have been deleted or rotated. Paste a new token in Settings.',
  });
  assert.deepEqual(describeGhlFailure(403, 'Forbidden'), {
    broken: true,
    message: 'The token belongs to a different sub-account or cannot access this location.',
  });
  assert.deepEqual(describeGhlFailure(429, ''), { broken: false, message: 'GHL rate limit reached. Try again in a minute.' });
  assert.deepEqual(describeGhlFailure(500, 'x'), { broken: false, message: 'GHL error 500.' });
});

test('menuLinkPayload', () => {
  assert.deepEqual(menuLinkPayload('https://app.filershub.com', 'loc123'), {
    title: 'FilersHub',
    url: 'https://app.filershub.com/widget?location_id={{location.id}}&email={{user.email}}',
    icon: { name: 'file-invoice-dollar', fontFamily: 'fas' },
    showOnCompany: false, showOnLocation: true, showToAllLocations: false,
    locations: ['loc123'], openMode: 'iframe', userRole: 'all',
    allowCamera: false, allowMicrophone: false,
  });
});

test('findFirmMenuLink', () => {
  const list = [
    { id: 'a', url: 'https://app.filershub.com/widget?x', showToAllLocations: true, locations: [] },
    { id: 'b', url: 'https://app.filershub.com/widget?y', locations: ['other'] },
    { id: 'c', url: 'https://app.filershub.com/widget?z', locations: ['loc123'] },
  ];
  assert.equal(findFirmMenuLink(list, 'loc123')?.id, 'c');
  assert.equal(findFirmMenuLink([], 'loc123'), null);
});

test('validateActionRequest', () => {
  const base = (extras: any, key: any = 'add_note') => ({ meta: { key }, extras, data: { note: 'hi' } });
  assert.deepEqual(validateActionRequest(base({ locationId: 'loc123', contactId: 'c1' })),
    { ok: true, key: 'add_note', locationId: 'loc123', contactId: 'c1' });
  assert.deepEqual(validateActionRequest({}), { ok: false, error: 'meta.key is missing.' });
  assert.deepEqual(validateActionRequest(base({ locationId: 'loc123' }, 'nope')), { ok: false, error: 'Unknown action "nope".' });
  assert.deepEqual(validateActionRequest(base({})), { ok: false, error: 'extras.locationId is missing. Use {{location.id}}.' });
  assert.deepEqual(validateActionRequest(base({ locationId: '{{location.id}}' })),
    { ok: false, error: 'extras.locationId was not filled in by GHL. Check the merge field.' });
  assert.deepEqual(validateActionRequest(base({ locationId: 'loc123', contactId: '{{contact.id}}' })),
    { ok: false, error: 'extras.contactId was not filled in by GHL. Check the merge field.' });
  assert.deepEqual(validateActionRequest(base({ locationId: 'loc123', contactId: '' })),
    { ok: true, key: 'add_note', locationId: 'loc123', contactId: null });
});

test('isFilersHubAgency', () => {
  assert.equal(isFilersHubAgency('c1', 'c1'), true);
  assert.equal(isFilersHubAgency('c1', 'c2'), false);
  assert.equal(isFilersHubAgency(null, 'c1'), false);
  assert.equal(isFilersHubAgency('c1', ''), false);
});

test('isScopeError', () => {
  assert.equal(isScopeError(SCOPE_ERROR_MESSAGE), true);
  assert.equal(isScopeError('GHL rejected the token.'), false);
  assert.equal(isScopeError(null), false);
  assert.equal(isScopeError(undefined), false);
});

test('actionHttpStatus', () => {
  assert.equal(actionHttpStatus({ success: true }), 200);
  assert.equal(actionHttpStatus({ found: true, returnId: 'r1' }), 200);
  assert.equal(actionHttpStatus({ found: false, message: 'No matching return' }), 200);
  assert.equal(actionHttpStatus({ success: false, error: 'No client found for contact c1' }), 422);
  assert.equal(actionHttpStatus({ success: false }), 422);
  assert.equal(actionHttpStatus({ found: false, error: 'contactId is required in extras' }), 422);
});

test('escapeLikePattern', () => {
  assert.equal(escapeLikePattern('jane_doe@example.com'), 'jane\\_doe@example.com');
  assert.equal(escapeLikePattern('100%@x.com'), '100\\%@x.com');
  assert.equal(escapeLikePattern('a\\b@x.com'), 'a\\\\b@x.com');
  assert.equal(escapeLikePattern('plain@example.com'), 'plain@example.com');
});

test('pickEmailMatch', () => {
  const unlinked = { client_id: 'u', email: 'Jane@Example.com ', ghl_contact_id: null };
  const mine = { client_id: 'm', email: 'jane@example.com', ghl_contact_id: 'c1' };
  const other = { client_id: 'o', email: 'jane@example.com', ghl_contact_id: 'c2' };
  const wildcardHit = { client_id: 'w', email: 'aXYZb@x.com', ghl_contact_id: null };

  assert.deepEqual(pickEmailMatch([], 'jane@example.com', 'c1'), { kind: 'none' });
  // a "*" in the GHL email must not match other addresses
  assert.deepEqual(pickEmailMatch([wildcardHit], 'a*b@x.com', 'c1'), { kind: 'none' });
  assert.deepEqual(pickEmailMatch([unlinked], ' JANE@example.com', 'c1'), { kind: 'link', client: unlinked });
  assert.deepEqual(pickEmailMatch([other], 'jane@example.com', 'c1'), { kind: 'conflict', client: other });
  assert.deepEqual(pickEmailMatch([other, unlinked, mine], 'jane@example.com', 'c1'), { kind: 'already', client: mine });
  assert.deepEqual(pickEmailMatch([other, unlinked], 'jane@example.com', 'c1'), { kind: 'link', client: unlinked });
});
