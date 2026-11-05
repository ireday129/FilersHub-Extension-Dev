import test from 'node:test';
import assert from 'node:assert/strict';
import { crmAccessOutcome } from './crmAccess.ts';

test('crmAccessOutcome maps the location check to what the page shows', () => {
  assert.equal(crmAccessOutcome(200, undefined), 'ok');
  assert.equal(crmAccessOutcome(401, 'SIGN_IN_REQUIRED'), 'signin');
  assert.equal(crmAccessOutcome(401, undefined), 'signin');
  assert.equal(crmAccessOutcome(403, 'LOCATION_NOT_FOUND'), 'location');
  assert.equal(crmAccessOutcome(403, 'STAFF_NOT_FOUND'), 'staff');
  assert.equal(crmAccessOutcome(403, 'SOMETHING_ELSE'), 'error');
  assert.equal(crmAccessOutcome(500, undefined), 'error');
});
