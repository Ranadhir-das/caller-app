export function websiteLeadNotificationTarget(
  data: unknown,
  authenticatedCaller: boolean,
  authenticatedEmployee = authenticatedCaller,
  authenticatedCounselor = false
) {
  if (!authenticatedEmployee || !data || typeof data !== 'object') return null;
  const payload = data as Record<string, unknown>;
  const positiveId = (value: unknown) => (typeof value === 'number' || typeof value === 'string')
    && /^[1-9]\d*$/.test(String(value)) && Number.isSafeInteger(Number(value));
  if (payload.type === 'TEAM_CHAT' && positiveId(payload.channel_id)) {
    return { pathname: '/chat' as const, params: { channelId: String(payload.channel_id) } };
  }
  if (payload.type === 'NOTICE' && positiveId(payload.notice_id)) {
    return { pathname: '/notices' as const, params: { noticeId: String(payload.notice_id) } };
  }
  if (authenticatedCounselor && payload.type === 'COUNSELOR_LEAD_FORWARDED' && positiveId(payload.lead_id)) {
    return { pathname: '/counselor-lead' as const, params: { id: String(payload.lead_id) } };
  }
  if (!authenticatedCaller) return null;
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
  if (payload.type === 'FOLLOWUP_DUE') {
    if (positiveId(payload.lead_id)) {
      return {
        pathname: '/lead-details' as const,
        params: { id: String(payload.lead_id) },
      };
    }
    return {
      pathname: '/(tabs)' as const,
      params: {},
    };
  }
  return null;
}

export function isNotifiedLeadAvailable(leads: readonly { id: string }[], id?: string): boolean {
  return !!id && leads.some(lead => lead.id === id);
}
