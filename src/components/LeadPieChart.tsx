import { Image } from 'expo-image';
import { Text, View } from 'react-native';
import { useAppTheme } from '@/context/AppThemeContext';
import { Lead } from '@/types';

export function LeadPieChart({ leads }: { leads: Lead[] }) {
  const { colors } = useAppTheme();
  const segments = [
    { label: 'Pending', color: colors.accent, count: leads.filter(l => l.status === 'pending').length },
    { label: 'Interested', color: colors.success, count: leads.filter(l => l.status === 'interested').length },
    { label: 'Call back', color: colors.warning, count: leads.filter(l => l.status === 'call_back').length },
    { label: 'Other outcomes', color: colors.danger, count: leads.filter(l => !['pending', 'interested', 'call_back'].includes(l.status)).length },
  ];
  let angle = -Math.PI / 2;
  const paths = segments.filter(s => s.count).map(segment => {
    if (segment.count === leads.length) return `<circle cx="90" cy="90" r="80" fill="${segment.color}"/>`;
    const end = angle + segment.count / leads.length * Math.PI * 2;
    const path = `<path d="M90 90 L${90 + 80 * Math.cos(angle)} ${90 + 80 * Math.sin(angle)} A80 80 0 ${end - angle > Math.PI ? 1 : 0} 1 ${90 + 80 * Math.cos(end)} ${90 + 80 * Math.sin(end)} Z" fill="${segment.color}"/>`;
    angle = end;
    return path;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 180 180">${paths || `<circle cx="90" cy="90" r="80" fill="${colors.border}"/>`}</svg>`;
  return <View style={{ padding: 14, backgroundColor: colors.surface, borderRadius: 18, marginBottom: 12 }}>
    <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>Assigned lead overview</Text>
    <Text style={{ color: colors.muted, marginTop: 5 }}>{leads.length} leads across your batches</Text>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 }}>
      <Image source={{ uri: `data:image/svg+xml;base64,${btoa(svg)}` }} style={{ width: 104, height: 104, flexShrink: 0 }} accessibilityLabel="Lead status pie chart" />
      <View style={{ flex: 1, minWidth: 0, gap: 8 }}>{segments.map(s => <View key={s.label} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: s.color }} />
        <Text style={{ color: colors.secondary, flex: 1, fontSize: 12 }}>{s.label}: {s.count}</Text>
      </View>)}</View>
    </View>
    {!leads.length && <Text style={{ color: colors.muted, marginTop: 10 }}>Pull down in Leads to check for new assignments.</Text>}
  </View>;
}
