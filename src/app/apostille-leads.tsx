import { createStyles } from '@/components/apostilleStyles';
import { useCallback, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useAppStyles } from '@/context/AppThemeContext';
import { apostilleApi, canUseApostille, type ApostilleLead } from '@/services/apostille';

export default function ApostilleLeadsScreen() {
  const { user, token } = useAuth(); const styles = useAppStyles(createStyles);
  const [items, setItems] = useState<ApostilleLead[]>([]); const [q, setQ] = useState('');
  const [filter, setFilter] = useState(''); const [page, setPage] = useState(1);
  const [next, setNext] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const request = useRef(0);
  useFocusEffect(useCallback(() => {
    const generation = ++request.current;
    if (!token || !canUseApostille(user)) return;
    setBusy(true); setError('');
    void apostilleApi.list(token, q, filter, page).then(data => {
      if (generation === request.current) { setItems(data.results); setNext(!!data.next); }
    }).catch(e => { if (generation === request.current) setError(e.message || 'Could not load leads.'); })
      .finally(() => { if (generation === request.current) setBusy(false); });
    return () => { request.current++; };
  }, [token, user, q, filter, page]));
  if (!canUseApostille(user)) return <SafeAreaView><Text>Apostille access is not available for this account.</Text></SafeAreaView>;
  return <SafeAreaView style={styles.screen}><ScrollView contentContainerStyle={styles.content}>
    <Pressable onPress={() => router.back()}><Text style={styles.link}>Back</Text></Pressable>
    <Text style={styles.title}>Apostille Leads</Text>
    <Pressable style={styles.button} onPress={() => router.push('/apostille-lead?id=new' as never)}><Text style={styles.buttonText}>+ Add Apostille Lead</Text></Pressable>
    <TextInput accessibilityLabel="Search Apostille leads" style={styles.input} placeholder="Search name, phone, country or document" placeholderTextColor={styles.muted.color} value={q} onChangeText={v => { setQ(v); setPage(1); }} />
    <View style={styles.row}>{[['', 'All'], ['true', 'Conversion: Yes'], ['false', 'Conversion: No']].map(([value, label]) => <Pressable key={value} style={styles.card} accessibilityState={{ selected: filter === value }} onPress={() => { setFilter(value); setPage(1); }}><Text style={filter === value ? styles.link : styles.text}>{label}</Text></Pressable>)}</View>
    {busy ? <ActivityIndicator /> : error ? <Text style={styles.error}>{error}</Text> : <>
      {items.map(item => <Pressable style={styles.card} key={item.id} onPress={() => router.push(`/apostille-lead?id=${item.id}` as never)}>
        <Text style={styles.name}>{item.name}</Text><Text style={styles.text}>{item.phone}</Text>
        <Text style={styles.text}>{item.country || 'Country not recorded'} · {item.document_name || 'Document not recorded'} · {item.number_of_documents ?? '—'} documents</Text>
        <Text style={styles.text}>Conversion: {item.conversion === null ? 'Not recorded' : item.conversion ? 'Yes' : 'No'}</Text>
        <Text style={styles.muted}>{item.assigned_caller_name || 'Pending assignment'} · {item.status_display}</Text>
      </Pressable>)}
      {!items.length && <Text style={styles.muted}>No Apostille leads found.</Text>}
      <View style={styles.row}><Pressable disabled={page === 1} onPress={() => setPage(p => p - 1)}><Text style={styles.link}>Previous</Text></Pressable><Text style={styles.text}>Page {page}</Text><Pressable disabled={!next} onPress={() => setPage(p => p + 1)}><Text style={styles.link}>Next</Text></Pressable></View>
    </>}
  </ScrollView></SafeAreaView>;
}

