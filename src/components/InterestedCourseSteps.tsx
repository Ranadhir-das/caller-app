import { useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, ScrollView, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppStyles, useAppTheme, type AppColors } from '@/context/AppThemeContext';
import { COURSES, validYear, validCourse } from '@/services/courses';

type Props = { visible: boolean; course: string; custom: string; year: string;
  onCancel: () => void; onComplete: (course: string, custom: string, year: string) => void };
export function InterestedCourseSteps(props: Props) {
  const styles = useAppStyles(makeStyles);
  const { colors, mode } = useAppTheme();
  const [step, setStep] = useState(1);
  const [course, setCourse] = useState(props.course);
  const [custom, setCustom] = useState(props.custom);
  const [year, setYear] = useState(props.year);
  const [customYear, setCustomYear] = useState(!!props.year && ![String(new Date().getFullYear()), String(new Date().getFullYear() + 1)].includes(props.year));
  const thisYear = new Date().getFullYear();
  const courseValid = validCourse(course, custom);
  return <Modal visible={props.visible} animationType="slide" onRequestClose={props.onCancel}>
    <SafeAreaView style={styles.page}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          <Pressable accessibilityRole="button" onPress={() => step === 2 ? setStep(1) : props.onCancel()} style={styles.back}><Text style={styles.link}>Back</Text></Pressable>
          <Text style={styles.title}>Interested</Text>
          <Text style={styles.muted}>Step {step} of 2</Text>
          <View style={styles.track}><View style={[styles.progress, { width: step === 1 ? '50%' : '100%' }]} /></View>
          <Text style={styles.heading}>{step === 1 ? 'Which course is the student interested in?' : 'Expected admission year'}</Text>
          {step === 1 ? <>
            <View style={styles.grid}>{COURSES.map(([code, label]) => <Pressable key={code} accessibilityRole="radio" accessibilityState={{ selected: code === course }}
              onPress={() => setCourse(code)} style={[styles.chip, course === code && styles.selected]}><Text style={styles.text}>{label}</Text></Pressable>)}</View>
            {course === 'OTHERS' && <TextInput style={styles.input} keyboardAppearance={mode} value={custom} onChangeText={setCustom} maxLength={150} placeholder="Enter course name" placeholderTextColor={colors.placeholder} accessibilityLabel="Custom course name" />}
          </> : <>
            {[[String(thisYear), 'This Year'], [String(thisYear + 1), 'Next Year'], ['', 'Custom Year']].map(([value, label]) => <Pressable key={label} accessibilityRole="radio"
              accessibilityState={{ selected: value ? !customYear && year === value : customYear }}
              style={[styles.choice, (value ? !customYear && year === value : customYear) && styles.selected]}
              onPress={() => { setCustomYear(!value); if (value) setYear(value); }}><Text style={styles.text}>{label}{value ? ` (${value})` : ''}</Text></Pressable>)}
            {customYear && <TextInput style={styles.input} keyboardAppearance={mode} keyboardType="number-pad" maxLength={4} value={year} onChangeText={setYear} accessibilityLabel="Custom admission year" placeholder="Year, for example 2035" placeholderTextColor={colors.placeholder} />}
            <Text style={styles.muted}>Any whole year from 1 to 9999 is supported.</Text>
          </>}
          <Pressable accessibilityRole="button" disabled={step === 1 ? !courseValid : !validYear(year)} style={[styles.button, (step === 1 ? !courseValid : !validYear(year)) && styles.disabled]}
            onPress={() => step === 1 ? setStep(2) : props.onComplete(course, course === 'OTHERS' ? custom.trim() : '', year)}><Text style={styles.buttonText}>{step === 1 ? 'Continue to Year' : 'Use Course and Year'}</Text></Pressable>
          <Pressable onPress={props.onCancel} style={styles.back}><Text style={styles.link}>Cancel</Text></Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </Modal>;
}
const makeStyles = (c: AppColors) => StyleSheet.create({
  page: { flex: 1, backgroundColor: c.background }, flex: { flex: 1 }, content: { padding: 24, gap: 16 },
  title: { fontSize: 28, fontWeight: '700', color: c.text }, heading: { fontSize: 22, fontWeight: '600', color: c.text },
  muted: { fontSize: 15, color: c.secondary }, text: { fontSize: 16, fontWeight: '600', color: c.text },
  track: { height: 5, backgroundColor: c.border, borderRadius: 4 }, progress: { height: 5, backgroundColor: c.accent, borderRadius: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, chip: { width: '47%', minHeight: 60, padding: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: c.border, borderRadius: 14, backgroundColor: c.surface },
  selected: { borderColor: c.accent, backgroundColor: c.accentSoft }, choice: { padding: 18, borderWidth: 1, borderColor: c.border, borderRadius: 14, backgroundColor: c.surface },
  input: { padding: 16, minHeight: 52, color: c.text, fontSize: 17, borderWidth: 1, borderColor: c.border, borderRadius: 14, backgroundColor: c.surface },
  button: { marginTop: 16, padding: 18, borderRadius: 16, backgroundColor: c.accent, alignItems: 'center' }, buttonText: { color: '#fff', fontSize: 17, fontWeight: '700' }, disabled: { opacity: 0.45 },
  back: { minHeight: 44, justifyContent: 'center' }, link: { color: c.accent, fontSize: 16, fontWeight: '600' },
});
