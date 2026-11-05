// Copyable body templates for GHL's built-in "Custom Webhook" workflow action.
// Erasable TypeScript only: also runs under node --experimental-strip-types.

export interface ActionTemplate {
  key: string;
  label: string;
  description: string;
  data: Record<string, unknown>;
}

export const ACTION_TEMPLATES: ActionTemplate[] = [
  {
    key: 'fh_newclientaccess',
    label: 'Create client in FilersHub',
    description: 'Creates a FilersHub client from the GHL contact, or returns the existing client if one is already linked.',
    data: {},
  },
  {
    key: 'create_tax_return',
    label: 'Create tax return',
    description: "Creates a new tax return of the given year and type for the contact's client.",
    data: { tax_year: '2025', return_type: '1040' },
  },
  {
    key: 'search_existing_return',
    label: 'Find existing return',
    description: "Looks up the contact's tax return for the given year and reports its id and current status.",
    data: { tax_year: '2025' },
  },
  {
    key: 'update_return_stage',
    label: 'Update return status',
    description: 'Moves a tax return to a new status in FilersHub and updates the status tag on the GHL contact.',
    data: { return_id: 'PASTE_RETURN_ID', new_status: 'Ready for Signature' },
  },
  {
    key: 'assign_preparer',
    label: 'Assign preparer',
    description: "Assigns the contact's tax return to the staff member with the given email.",
    data: { preparer_email: 'preparer@yourfirm.com' },
  },
  {
    key: 'add_note',
    label: 'Add note',
    description: "Adds a note to the contact's client record in FilersHub.",
    data: { note: '{{contact.first_name}} called about their return.' },
  },
  {
    key: 'request_docs',
    label: 'Request documents',
    description: 'Marks the return as Missing Documents and requests the listed document categories from the client.',
    data: { categories: ['W-2', '1099'] },
  },
  {
    key: 'set_return_info',
    label: 'Set return info',
    description: "Sets the tax year and return type on the contact's existing tax return.",
    data: { tax_year: '2025', return_type: '1040' },
  },
  {
    key: 'deactivate_client',
    label: 'Deactivate client',
    description: "Marks the contact's client as inactive in FilersHub.",
    data: {},
  },
  {
    key: 'create_task',
    label: 'Create task',
    description: 'Creates a task in FilersHub with a due date and priority, assigned to the staff member with the given email.',
    data: {
      title: 'Follow up',
      description: '',
      due_date: '2026-04-15',
      priority: 'Medium',
      assign_to_email: 'preparer@yourfirm.com',
    },
  },
];

export function actionBody(t: ActionTemplate): string {
  return JSON.stringify(
    {
      meta: { key: t.key },
      extras: { locationId: '{{location.id}}', contactId: '{{contact.id}}' },
      data: t.data,
    },
    null,
    2,
  );
}
