import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Alert, Image, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useAppTheme, useAppStyles } from '@/context/AppThemeContext';
import { useEmployeeWorkspace } from '@/context/EmployeeWorkspaceContext';
import { API_BASE_URL } from '@/services/api';
import { ActionButton, FormInput, makeStyles } from '@/components/employee/shared';

function ReportPhoto({ id, size }: { id: number; size: number }) {
  const { token } = useAuth();
  const [open, setOpen] = useState(false);
  const source = { uri: `${API_BASE_URL}/mobile/employee/reports/${id}/photo/`, headers: { Authorization: `Token ${token}` } };
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel="View uploaded photo" onPress={() => setOpen(true)}>
        <Image source={source} style={{ width: size, height: size, borderRadius: 10 }} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={photoStyles.backdrop} onPress={() => setOpen(false)}>
          <Image source={source} style={photoStyles.full} resizeMode="contain" />
        </Pressable>
      </Modal>
    </>
  );
}

export default function MyWorkScreen() {
  const { colors } = useAppTheme();
  const styles = useAppStyles(makeStyles);
  const { data, refreshing, busy, load, run, request } = useEmployeeWorkspace();
  const [notes, setNotes] = useState('');
  const [link, setLink] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [pickingPhoto, setPickingPhoto] = useState(false);

  const pickPhoto = async () => {
    if (pickingPhoto) return;
    setPickingPhoto(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.4, base64: true, allowsEditing: false });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset.base64) throw new Error('Could not read this photo. Please choose another image.');
      if (asset.base64.length > 1_500_000) throw new Error('Please choose a smaller photo (under 1 MB).');
      setPhoto(`data:image/jpeg;base64,${asset.base64}`);
    } catch (e) {
      Alert.alert('Photo could not be added', e instanceof Error ? e.message : 'Please try again.');
    } finally { setPickingPhoto(false); }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={colors.accent} />}>
        <Text style={styles.title}>My work</Text>
        <Text style={styles.heading}>My assigned projects</Text>
        {data?.projects.map(p => (
          <View key={p.id} style={styles.card}>
            <Text style={styles.label}>{p.title}</Text>
            <Text style={styles.subtitle}>{p.description}</Text>
            <Text style={styles.subtitle}>{p.status} | Due: {p.due_date || 'Not set'}</Text>
            <View style={styles.row}>
              {['STARTED', 'IN_PROGRESS', 'COMPLETED'].filter(s => s !== p.status).map(s => (
                <ActionButton key={s} title={s.replaceAll('_', ' ')} busy={busy} onPress={() => run(async () => { await request(`projects/${p.id}/`, { status: s }, 'PATCH'); })} />
              ))}
            </View>
          </View>
        ))}
        {!data?.projects.length && <Text style={styles.subtitle}>No projects assigned to you.</Text>}
        <View style={styles.card}>
          <Text style={styles.heading}>Daily work report - {data?.date}</Text>
          <FormInput label="Work completed" value={notes} onChangeText={setNotes} multiline />
          <FormInput label="Work link (optional)" value={link} onChangeText={setLink} />
          <View style={{ gap: 6 }}>
            <Text style={styles.label}>Work photo (optional)</Text>
            {photo ? (
              <View style={photoStyles.previewRow}>
                <Image source={{ uri: photo }} style={photoStyles.preview} />
                <ActionButton title="Remove photo" busy={pickingPhoto} onPress={() => setPhoto(null)} />
              </View>
            ) : (
              <ActionButton title={pickingPhoto ? 'Opening…' : 'Add photo'} busy={pickingPhoto} onPress={pickPhoto} />
            )}
          </View>
          <ActionButton title="Save today's report" busy={busy} onPress={() => run(async () => {
            await request('reports/', { date: data?.date, notes, work_link: link, ...(photo ? { photo: photo.split(',')[1] } : {}) });
            setPhoto(null);
            Alert.alert('Saved', 'Your daily report has been saved.');
          })} />
        </View>
        {data?.reports.map(r => (
          <View key={r.id} style={styles.card}>
            <View style={photoStyles.reportRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>{r.date}</Text>
                <Text style={styles.subtitle}>{r.notes}</Text>
                <Text selectable style={styles.subtitle}>{r.work_link}</Text>
              </View>
              {r.has_photo && <ReportPhoto id={r.id} size={56} />}
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const photoStyles = StyleSheet.create({
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  preview: { width: 64, height: 64, borderRadius: 10 },
  reportRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', alignItems: 'center', justifyContent: 'center' },
  full: { width: '100%', height: '80%' },
});
