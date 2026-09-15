import { useCallback, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Alert, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useAppTheme, useAppStyles, AppColors } from '@/context/AppThemeContext';
import { apiRequest } from '@/services/api';
import { CallerAvatar } from '@/components/CallerAvatar';

type Workspace = {
  role_label: string; date: string;
  attendance: {id:number; date:string; checked_in:string|null; checked_out:string|null}[];
  leaves: {id:number; start_date:string; end_date:string; reason:string; status:string; review_note:string}[];
  projects: {id:number; title:string; description:string; due_date:string|null; status:string}[];
  reports: {id:number; date:string; notes:string; work_link:string}[];
  holidays: {id:number; name:string; date:string}[];
  photo_requests: {id:number; action:string; status:string; created_at:string; review_note:string}[];
  enrolled: boolean;
};
export default function EmployeeScreen() {
  const { user, token, logout, refreshUser } = useAuth();
  const { colors, mode } = useAppTheme();
  const styles = useAppStyles(makeStyles);
  const [data, setData] = useState<Workspace|null>(null);
  const [tab, setTab] = useState('Attendance');
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [start, setStart] = useState<Date|null>(null); const [end, setEnd] = useState<Date|null>(null);
  const [openPicker, setOpenPicker] = useState<'start'|'end'|null>(null);
  const [reason, setReason] = useState(''); const [notes, setNotes] = useState(''); const [link, setLink] = useState('');
  const load = useCallback(async () => {
    if (!token) return;
    setRefreshing(true);
    try { setData(await apiRequest<Workspace>('/mobile/employee/', {token})); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to load workspace.'); }
    finally { setRefreshing(false); }
  }, [token]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const run = async (action: () => Promise<void>) => {
    if (locked.current) return;
    locked.current = true; setBusy(true);
    try { await action(); await load(); }
    catch (e) { Alert.alert('Unable to complete', e instanceof Error ? e.message : 'Please try again.'); }
    finally { locked.current = false; setBusy(false); }
  };
  const request = (path:string, body?:unknown, method:'POST'|'PATCH'|'DELETE'='POST') => apiRequest('/mobile/employee/'+path, {token:token!, method, body});
  const photo = (action:string) => run(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error('Camera permission is required. Enable it in phone settings.');
    const challenge = await apiRequest<{id:string}>('/mobile/employee/photo-challenge/', {token:token!,method:'POST',body:{action}});
    const result = await ImagePicker.launchCameraAsync({cameraType:ImagePicker.CameraType.front, mediaTypes:['images'], quality:0.4, base64:true, allowsEditing:false});
    if (result.canceled) return;
    const image = result.assets[0].base64;
    if (!image) throw new Error('Photo could not be read. Please try again.');
    await request('photo-attendance/', {challenge:challenge.id, photo:image});
    await refreshUser();
    Alert.alert('Photo submitted', 'Your photo is awaiting administrator review. Attendance is confirmed after approval.');
  });
  // Logout never requires face verification; checkout time is recorded server-side from the session close.
  const signOut = () => void run(async () => { await logout(); router.replace('/login'); });
  const button = (title:string, action:()=>void) => <Pressable accessibilityRole="button" disabled={busy} onPress={action} style={[styles.button,busy&&{opacity:0.6}]}><Text style={styles.buttonText}>{title}</Text></Pressable>;
  const input = (label:string, value:string, change:(s:string)=>void, multiline=false) => <View style={{gap:6}}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} style={[styles.input,multiline&&{minHeight:85,textAlignVertical:'top'}]} value={value} onChangeText={change} multiline={multiline} keyboardAppearance={mode} placeholderTextColor={colors.placeholder} autoCapitalize="none" /></View>;
  const isoDate = (d:Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const showDate = (d:Date) => d.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
  const dateField = (label:string, value:Date|null, key:'start'|'end') => <View style={{gap:6}}><Text style={styles.label}>{label}</Text><Pressable accessibilityRole="button" accessibilityLabel={label} style={[styles.input,styles.dateInput]} onPress={()=>setOpenPicker(key)}><Text style={{color:value?colors.text:colors.placeholder,fontSize:15}}>{value?showDate(value):'Select date'}</Text><Text style={styles.calendarIcon}>📅</Text></Pressable></View>;
  return <SafeAreaView style={styles.container}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={colors.accent}/>}>
    <View style={styles.row}><View style={{flex:1}}><Text style={styles.title}>{user?.name || user?.username}</Text><Text style={styles.subtitle}>{data?.role_label || user?.role} workspace</Text></View><Pressable accessibilityLabel="My profile" onPress={()=>router.push('/profile')}><CallerAvatar/></Pressable></View>
    <View style={styles.row}>{user?.role==='CALLER'&&!user.needs_onboarding&&button('Calling workspace',()=>router.replace('/(tabs)'))}{button('Team chat',()=>router.push('/chat'))}{button('Notices',()=>router.push('/notices'))}{button('Settings',()=>router.push('/settings'))}{button('Check out / Logout',signOut)}</View>
    {user?.needs_onboarding&&<View style={styles.card}><Text style={styles.heading}>Welcome - set up your employee photo</Text><Text style={styles.subtitle}>Capture your enrollment photo below once. Management will review it before photo attendance becomes available.</Text></View>}
    {!!error&&<Text style={{color:colors.danger}}>{error}</Text>}
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8}}>{['Attendance','Leave','My work'].map(t=><Pressable key={t} style={[styles.chip,tab===t&&{backgroundColor:colors.primary}]} onPress={()=>setTab(t)}><Text style={{color:tab===t?colors.onPrimary:colors.text}}>{t}</Text></Pressable>)}</ScrollView>
    {tab==='Attendance'&&<>
      <View style={styles.card}><Text style={styles.heading}>Live-photo attendance</Text><Text style={styles.subtitle}>Use your camera in good light with your face clearly visible. Photos are private and reviewed by management.</Text>
      {!data?.enrolled ? button('Capture enrollment photo',()=>photo('ENROLL')) : <View style={styles.row}>{button('Photo check-in',()=>photo('IN'))}{button('Photo check-out',()=>photo('OUT'))}</View>}
      <Text style={styles.subtitle}>Enrollment must be approved before check-in. Photo submission does not immediately mark attendance.</Text></View>
      {data?.photo_requests?.map(r=><View key={r.id} style={styles.card}><Text style={styles.label}>{r.action} - {r.status}</Text><Text style={styles.subtitle}>{new Date(r.created_at).toLocaleString()}</Text>{!!r.review_note&&<Text style={styles.subtitle}>{r.review_note}</Text>}</View>)}
      <Text style={styles.heading}>My attendance</Text>{data?.attendance.map(r=><View key={r.id} style={styles.card}><Text style={styles.label}>{r.date}</Text><Text style={styles.subtitle}>In: {r.checked_in?new Date(r.checked_in).toLocaleString():'Not checked in'}</Text><Text style={styles.subtitle}>Out: {r.checked_out?new Date(r.checked_out).toLocaleString():'Not checked out'}</Text></View>)}
      {!data?.attendance.length&&<Text style={styles.subtitle}>No attendance records yet.</Text>}
    </>}
    {tab==='Leave'&&<>
      <View style={styles.card}><Text style={styles.heading}>Apply for leave</Text>
        {dateField('Start date',start,'start')}
        {dateField('End date',end,'end')}
        {input('Reason',reason,setReason,true)}
        {button('Submit request',()=>{
          if(!start||!end){Alert.alert('Leave','Please select a start and end date.');return;}
          void run(async()=>{await request('leaves/',{start_date:isoDate(start),end_date:isoDate(end),reason});setReason('');setStart(null);setEnd(null);Alert.alert('Submitted','Your leave request is awaiting approval.');});
        })}
        {openPicker==='start'&&<DateTimePicker themeVariant={mode} value={start||new Date()} mode="date" display={Platform.OS==='android'?'default':'spinner'} minimumDate={new Date()} onChange={(_,d)=>{setOpenPicker(null); if(d){setStart(d); if(end&&end<d)setEnd(null);}}} />}
        {openPicker==='end'&&<DateTimePicker themeVariant={mode} value={end||start||new Date()} mode="date" display={Platform.OS==='android'?'default':'spinner'} minimumDate={start||new Date()} onChange={(_,d)=>{setOpenPicker(null); if(d)setEnd(d);}} />}
      </View>
      {data?.leaves.map(l=><View key={l.id} style={styles.card}><Text style={styles.label}>{l.start_date} to {l.end_date} - {l.status}</Text><Text style={styles.subtitle}>{l.reason}</Text>{!!l.review_note&&<Text style={styles.subtitle}>{l.review_note}</Text>}{l.status==='PENDING'&&button('Cancel request',()=>run(async()=>{await request(`leaves/${l.id}/`,undefined,'DELETE');}))}</View>)}
      <Text style={styles.heading}>Upcoming holidays</Text>{data?.holidays.map(h=><Text key={h.id} style={styles.subtitle}>{h.date} - {h.name}</Text>)}
    </>}
    {tab==='My work'&&<>
      <Text style={styles.heading}>My assigned projects</Text>{data?.projects.map(p=><View key={p.id} style={styles.card}><Text style={styles.label}>{p.title}</Text><Text style={styles.subtitle}>{p.description}</Text><Text style={styles.subtitle}>{p.status} | Due: {p.due_date||'Not set'}</Text><View style={styles.row}>{['STARTED','IN_PROGRESS','COMPLETED'].filter(s=>s!==p.status).map(s=><View key={s}>{button(s.replaceAll('_',' '),()=>run(async()=>{await request(`projects/${p.id}/`,{status:s},'PATCH');}))}</View>)}</View></View>)}
      {!data?.projects.length&&<Text style={styles.subtitle}>No projects assigned to you.</Text>}
      <View style={styles.card}><Text style={styles.heading}>Daily work report - {data?.date}</Text>{input('Work completed',notes,setNotes,true)}{input('Work link (optional)',link,setLink)}{button("Save today's report",()=>run(async()=>{await request('reports/',{date:data?.date,notes,work_link:link});Alert.alert('Saved','Your daily report has been saved.');}))}</View>
      {data?.reports.map(r=><View key={r.id} style={styles.card}><Text style={styles.label}>{r.date}</Text><Text style={styles.subtitle}>{r.notes}</Text><Text selectable style={styles.subtitle}>{r.work_link}</Text></View>)}
    </>}
  </ScrollView></SafeAreaView>;
}
const makeStyles=(c:AppColors)=>StyleSheet.create({
  container:{flex:1,backgroundColor:c.background},content:{padding:20,gap:16,paddingBottom:40},
  title:{fontSize:24,fontWeight:'700',color:c.text},heading:{fontSize:18,fontWeight:'700',color:c.text},
  label:{fontSize:14,fontWeight:'600',color:c.text},subtitle:{fontSize:14,lineHeight:21,color:c.muted},
  card:{padding:16,borderRadius:16,backgroundColor:c.surface,gap:12,borderWidth:1,borderColor:c.border},
  row:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:8},chip:{padding:12,borderRadius:20,backgroundColor:c.surface},
  button:{backgroundColor:c.primary,padding:12,borderRadius:10,minHeight:44},buttonText:{color:c.onPrimary,fontWeight:'600',fontSize:13},
  input:{padding:12,borderRadius:10,borderWidth:1,borderColor:c.border,color:c.text,backgroundColor:c.background,fontSize:15},
  dateInput:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},calendarIcon:{fontSize:16},
});
