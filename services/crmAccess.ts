// What the in-GHL FilersHub page (/crm) should show for an /api/crm-validate-location answer.
export type CrmAccessOutcome = 'ok' | 'signin' | 'location' | 'staff' | 'error';

export function crmAccessOutcome(status: number, code: string | undefined): CrmAccessOutcome {
  if (status >= 200 && status < 300) return 'ok';
  if (status === 401) return 'signin';
  if (status === 403 && code === 'LOCATION_NOT_FOUND') return 'location';
  if (status === 403 && code === 'STAFF_NOT_FOUND') return 'staff';
  return 'error';
}
