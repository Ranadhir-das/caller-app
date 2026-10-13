import { useCallback, useRef, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useAppStyles } from '@/context/AppThemeContext';
import { apostilleApi, apostillePayload, canUseApostille, type ApostilleInput, type ApostilleLead } from '@/services/apostille';
import { newCallId } from '@/services/callDrafts';
import { apiRequest, ApiError } from '@/services/api';
import { createStyles } from '@/components/apostilleStyles';

export default function ApostilleLeadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(); const isNew = id === 'new';
  const { user, token } = useAuth(); const styles = useAppStyles(createStyles);
  const [record, setRecord] = useState<ApostilleLead | null>(null);
  const [editing, setEditing] = useState(isNew); const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(!isNew);
  const [error, setError] = useState(''); const lock = useRef(false); const frozen = useRef<ApostilleInput | null>(null);
  const [input, setInput] = useState<ApostilleInput>(() => ({ name: '', phone: '', country: '', document_name: '',
    number_of_documents: 1, conversion: false, notes: '', reason: '', client_event_id: newCallId() }));
  const [count, setCount] = useState('1'); const [conversion, setConversion] = useState<boolean | null>(null);
  const populate = (data: ApostilleLead) => {
    setRecord(data); setCount(String(data.number_of_documents ?? 1)); setConversion(data.conversion);
    setInput({ name: data.name, phone: data.phone, country: data.country, document_name: data.document_name,
      number_of_documents: data.number_of_documents ?? 1, conversion: !!data.conversion, notes: data.conversion_notes,
      reason: data.reason, client_event_id: data.client_event_id || newCallId(), revision: data.revision });
  };
  useFocusEffect(useCallback(() => {
    let active = true;
    if (!isNew && token && canUseApostille(user)) {
      setLoading(true); setError('');
      void apostilleApi.detail(token, id).then(data => { if (active) populate(data); })
        .catch(e => { if (active) setError(e.message || 'Could not load lead.'); })
        .finally(() => { if (active) setLoading(false); });
    }
    return () => { active = false; };
  }, [id, isNew, token, user]));
  const save = async () => {
    if (lock.current || !token) return;
    lock.current = true; setBusy(true); setError('');
    try {
      if (conversion === null) throw new Error('Select Conversion: Yes or No.');
      const payload = frozen.current || apostillePayload({ ...input, conversion, number_of_documents: Number(count) });
      frozen.current = payload;
      const data = await apostilleApi.save(token, payload, isNew ? undefined : id);
      frozen.current = null; populate({ ...data, calls: record?.calls }); setEditing(false);
      Alert.alert('Lead saved', 'The Apostille lead is saved in CRM.');
      if (isNew) router.replace(`/apostille-lead?id=${data.id}` as never);
    } catch (e) {
      if (e instanceof ApiError && e.status >= 400 && e.status < 500) frozen.current = null;
      setError((e instanceof Error ? e.message : 'Could not save lead.') + (frozen.current ? ' Retry with the same details.' : ''));
    } finally { lock.current = false; setBusy(false); }
  };
  const call = async () => {
    if (lock.current || !token || !record?.can_call) return;
    lock.current = true; setBusy(true);
    try {
      const target = await apiRequest<{ lead: number; phone_number: string; lead_name: string; is_claimed?: boolean }>('/calls/resolve/', { token, method: 'POST', body: { lead: record.id } });
      router.push({ pathname: '/dialer', params: { direct: '1', id: String(target.lead), phone_number: target.phone_number, name: target.lead_name, service_code: 'APOSTILLE', isClaimed: target.is_claimed ? '1' : '0' } } as never);
    } catch (e) { Alert.alert('Cannot start call', e instanceof Error ? e.message : 'Please try again.'); }
    finally { lock.current = false; setBusy(false); }
  };
  if (!canUseApostille(user)) return <SafeAreaView><Text>Apostille access is not available for this account.</Text></SafeAreaView>;
  const disabled = busy || !!frozen.current;
  return <SafeAreaView style={styles.screen}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
    <Pressable onPress={() => router.back()}><Text style={styles.link}>Back</Text></Pressable>
    <Text style={styles.title}>{isNew ? 'Add Apostille Lead' : record?.name || 'Apostille Lead'}</Text>
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {loading ? <ActivityIndicator /> : editing ? <>
      {([['name', 'Name *'], ['phone', 'Phone Number *'], ['country', 'Country Name *'], ['document_name', 'Document Name *']] as const).map(([key, label]) => <View key={key} style={{ gap: 8 }}><Text style={styles.text}>{label}</Text><TextInput accessibilityLabel={label} style={styles.input} editable={!disabled} value={input[key]} keyboardType={key === 'phone' ? 'phone-pad' : 'default'} onChangeText={value => setInput(old => ({ ...old, [key]: value }))} /></View>)}
      <Text style={styles.text}>Number Of Documents *</Text><TextInput accessibilityLabel="Number Of Documents" style={styles.input} keyboardType="number-pad" editable={!disabled} value={count} onChangeText={setCount} />
      <Text style={styles.text}>Conversion *</Text><View style={styles.row}>{[true, false].map(value => <Pressable key={String(value)} style={styles.card} disabled={disabled} accessibilityState={{ selected: conversion === value }} onPress={() => { setConversion(value); setInput(old => ({ ...old, notes: '', reason: '' })); }}><Text style={conversion === value ? styles.link : styles.text}>{value ? 'Yes' : 'No'}</Text></Pressable>)}</View>
      {conversion !== null && <><Text style={styles.text}>{conversion ? 'Notes' : 'Reason *'}</Text><TextInput style={styles.input} multiline editable={!disabled} value={conversion ? input.notes : input.reason} onChangeText={value => setInput(old => ({ ...old, [conversion ? 'notes' : 'reason']: value }))} /></>}
      <Pressable accessibilityState={{ busy, disabled: busy }} disabled={busy} style={styles.button} onPress={() => void save()}><Text style={styles.buttonText}>{busy ? 'Saving…' : frozen.current ? 'Retry Save' : 'Save Lead'}</Text></Pressable>
    </> : record && <>
      <View style={styles.card}><Text style={styles.name}>{record.phone}</Text><Text style={styles.text}>{record.country || 'Country not recorded'}</Text><Text style={styles.text}>{record.document_name || 'Document not recorded'} · {record.number_of_documents ?? '—'} documents</Text><Text style={styles.text}>Conversion: {record.conversion === null ? 'Not recorded' : record.conversion ? 'Yes' : 'No'}</Text><Text style={styles.text}>{record.conversion ? record.conversion_notes : record.reason}</Text><Text style={styles.muted}>{record.assigned_caller_name || 'Pending assignment'} · {record.status_display}</Text><Text style={styles.text}>Call notes: {record.notes || '—'}</Text></View>
      <Pressable disabled={busy} style={styles.card} onPress={() => setEditing(true)}><Text style={styles.link}>Edit enquiry</Text></Pressable>
      {record.can_call ? <Pressable disabled={busy} style={styles.button} onPress={() => void call()}><Text style={styles.buttonText}>{busy ? 'Checking access…' : 'Call customer'}</Text></Pressable> : <Text style={styles.muted}>An administrator must assign this lead before you can call.</Text>}
      <Text style={styles.name}>Call history</Text>{record.calls?.map(item => <View key={item.id} style={styles.card}><Text style={styles.name}>{item.outcome_display}</Text><Text style={styles.muted}>{new Date(item.started_at).toLocaleString()}</Text><Text style={styles.text}>{item.notes || 'No notes'}</Text>{item.followup && <Text style={styles.text}>Follow-up: {new Date(item.followup.scheduled_at).toLocaleString()} · {item.followup.status}</Text>}</View>)}
      {!record.calls?.length && <Text style={styles.muted}>No calls yet.</Text>}
    </>}
  </ScrollView></SafeAreaView>;
}
