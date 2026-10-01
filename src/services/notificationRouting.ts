export function websiteLeadNotificationTarget(data: unknown, authenticatedCaller: boolean) {
  if (!authenticatedCaller || !data || typeof data !== 'object') return null;
  const payload = data as Record<string, unknown>;
  if (payload.type === 'NEW_WEBSITE_LEAD') {
    const value = payload.lead_id;
    if (typeof value !== 'number' && typeof value !== 'string') return null;
    if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) return null;
    return {
      pathname: '/(tabs)/leads' as const,
      params: { tab: 'available', availableLeadId: String(value) },
    };
  }
  if (payload.type === 'LEAD_ASSIGNED') {
    const value = payload.lead_id;
    if (typeof value !== 'number' && typeof value !== 'string') return null;
    if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) return null;
    return {
      pathname: '/lead-details' as const,
      params: { id: String(value) },
    };
  }
  return null;
}

export function isNotifiedLeadAvailable(leads: readonly { id: string }[], id?: string): boolean {
  return !!id && leads.some(lead => lead.id === id);
}
