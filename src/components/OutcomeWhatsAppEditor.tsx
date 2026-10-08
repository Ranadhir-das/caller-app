import { useEffect, useState } from 'react';
import { Alert, View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { useAppStyles, useAppTheme, type AppColors } from '@/context/AppThemeContext';
import { listWhatsAppTemplates, saveWhatsAppTemplate, deleteWhatsAppTemplate, type WhatsAppTemplate } from '@/services/whatsapp';
import { renderWhatsAppTemplate } from '@/services/courses';
import { NoteInputWithVoice } from '@/components/NoteInputWithVoice';

type Props = { message: string; templateId?: number; disabled: boolean; values: Record<string, string>;
  onChange: (message: string, template?: number) => void };
export function OutcomeWhatsAppEditor({ message, templateId, disabled, values, onChange }: Props) {
  const { token, user } = useAuth();
  const styles = useAppStyles(makeStyles);
  const { colors, mode } = useAppTheme();
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [expanded, setExpanded] = useState(!!message);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<WhatsAppTemplate | null | undefined>();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const reload = async () => { if (token) setTemplates(await listWhatsAppTemplates(token)); };
  useEffect(() => { let active = true; if (token) listWhatsAppTemplates(token).then(data => { if (active) setTemplates(data); }).catch(() => { if (active) setError('Templates could not load. You can still write a custom message.'); }); return () => { active = false; }; }, [token]);
  const run = async (action: () => Promise<void>) => { if (busy || disabled) return; setBusy(true); setError(''); try { await action(); } catch (e) { setError(e instanceof Error ? e.message : 'Please try again.'); } finally { setBusy(false); } };
  const selected = templates.find(t => t.id === templateId);
  return <View style={styles.card}>
    <Pressable disabled={disabled} onPress={() => { setExpanded(!expanded); if (expanded) onChange(''); }} style={styles.control}><Text style={styles.heading}>{expanded ? 'Remove WhatsApp message' : '+ Add optional WhatsApp message'}</Text></Pressable>
    {expanded && <>
      <Text style={styles.muted}>Prepare a message now. After saving, choose Open WhatsApp and press Send there yourself.</Text>
      <View style={styles.chips}>
        <Pressable disabled={disabled} onPress={() => onChange('')} style={styles.chip}><Text style={styles.text}>Custom message</Text></Pressable>
        {templates.map(t => <Pressable disabled={disabled} key={t.id} accessibilityState={{ selected: templateId === t.id }} style={[styles.chip, templateId === t.id && styles.selected]} onPress={() => onChange(renderWhatsAppTemplate(t.message, values), t.id)}><Text style={styles.text}>{t.title}{t.owner == null ? ' (shared)' : ''}</Text></Pressable>)}
      </View>
      <NoteInputWithVoice
        editable={!disabled}
        value={message}
        maxLength={4000}
        onChangeText={text => onChange(text, templateId)}
        placeholder="Message preview — edit or tap mic to speak before opening WhatsApp"
        accessibilityLabel="WhatsApp message preview"
      />
      <View style={styles.chips}>
        <Pressable disabled={disabled || busy} style={styles.control} onPress={() => { setEditing(null); setTitle(''); setBody(message); }}><Text style={styles.link}>Save a new template</Text></Pressable>
        {selected && selected.owner === user?.id && <>
          <Pressable disabled={disabled || busy} style={styles.control} onPress={() => { setEditing(selected); setTitle(selected.title); setBody(selected.message); }}><Text style={styles.link}>Edit template</Text></Pressable>
          <Pressable disabled={disabled || busy} style={styles.control} onPress={() => Alert.alert('Delete template?', selected.title, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => void run(async () => { await deleteWhatsAppTemplate(token!, selected.id); await reload(); onChange(message); }) }])}><Text style={styles.link}>Delete template</Text></Pressable>
        </>}
      </View>
      {editing !== undefined && <View style={styles.editor}>
        <Text style={styles.heading}>{editing ? 'Edit your template' : 'New private template'}</Text>
        <TextInput style={styles.input} editable={!busy && !disabled} value={title} onChangeText={setTitle} maxLength={150} placeholder="Template name" placeholderTextColor={colors.placeholder} />
        <TextInput style={styles.input} editable={!busy && !disabled} value={body} onChangeText={setBody} maxLength={4000} multiline placeholder="Template message" placeholderTextColor={colors.placeholder} />
        <Text style={styles.muted}>{'Placeholders: {{student_name}}, {{course}}, {{year}}, {{caller_name}}'}</Text>
        <Pressable style={styles.control} disabled={busy || disabled || !title.trim() || !body.trim()} onPress={() => void run(async () => { const saved = await saveWhatsAppTemplate(token!, { title: title.trim(), message: body.trim() }, editing?.id); await reload(); onChange(renderWhatsAppTemplate(saved.message, values), saved.id); setEditing(undefined); })}><Text style={styles.link}>{busy ? 'Saving?' : 'Save template'}</Text></Pressable>
        <Pressable disabled={busy} onPress={() => setEditing(undefined)} style={styles.control}><Text style={styles.link}>Cancel</Text></Pressable>
      </View>}
    </>}
    {!!error && <Text accessibilityRole="alert" style={styles.muted}>{error}</Text>}
  </View>;
}
const makeStyles = (c: AppColors) => StyleSheet.create({
  card: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, padding: 16, borderRadius: 16, marginVertical: 12, gap: 12 },
  heading: { color: c.text, fontSize: 16, fontWeight: '700' }, muted: { color: c.secondary, fontSize: 14, lineHeight: 21 },
  text: { color: c.text, fontSize: 14 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: c.border, borderRadius: 12, minHeight: 44, justifyContent: 'center', padding: 10 }, selected: { backgroundColor: c.accentSoft, borderColor: c.accent },
  input: { color: c.text, borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 12, minHeight: 52, fontSize: 16, textAlignVertical: 'top' },
  control: { minHeight: 44, justifyContent: 'center', paddingVertical: 8 }, link: { color: c.accent, fontSize: 15, fontWeight: '600' }, editor: { gap: 12 },
});
