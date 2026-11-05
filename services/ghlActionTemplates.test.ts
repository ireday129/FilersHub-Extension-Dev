import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTION_TEMPLATES, actionBody } from './ghlActionTemplates.ts';
import { ACTION_KEYS } from '../supabase/functions/_shared/ghl-core.ts';

test('template keys equal the action keys', () => {
  assert.deepEqual([...ACTION_TEMPLATES.map((t) => t.key)].sort(), [...ACTION_KEYS].sort());
});

test('every action body is valid JSON with the location merge field and key', () => {
  for (const t of ACTION_TEMPLATES) {
    const parsed = JSON.parse(actionBody(t));
    assert.equal(parsed.extras.locationId, '{{location.id}}');
    assert.equal(parsed.extras.contactId, '{{contact.id}}');
    assert.equal(parsed.meta.key, t.key);
    assert.ok(t.description.length > 0);
  }
});

// Must match the app's TAX_RETURN_TYPES label in types.ts (not imported: it has enums).
test('return type templates use the app label for Form 1040', () => {
  for (const key of ['create_tax_return', 'set_return_info']) {
    const t = ACTION_TEMPLATES.find((x) => x.key === key);
    assert.equal(t?.data.return_type, 'Individual Tax Return (Form 1040)', key);
  }
});

test('update_return_stage template uses Ready for Signature', () => {
  const t = ACTION_TEMPLATES.find((x) => x.key === 'update_return_stage');
  assert.equal(t?.data.new_status, 'Ready for Signature');
});
