import { useCallback, useMemo, useRef, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnimatedBackButton } from '@/components/AnimatedBackButton';
import { useAuth } from '@/context/AuthContext';
import { useLeads } from '@/context/LeadContext';
import { useAppStyles, useAppTheme, type AppColors } from '@/context/AppThemeContext';
import { apiRequest } from '@/services/api';
import { listCallDrafts, removeCallDraft, type CallDraft } from '@/services/callDrafts';

const KEYPAD_ROWS = [
  [
    { digit: '1', sub: ' ' },
    { digit: '2', sub: 'ABC' },
    { digit: '3', sub: 'DEF' },
  ],
  [
    { digit: '4', sub: 'GHI' },
    { digit: '5', sub: 'JKL' },
    { digit: '6', sub: 'MNO' },
  ],
  [
    { digit: '7', sub: 'PQRS' },
    { digit: '8', sub: 'TUV' },
    { digit: '9', sub: 'WXYZ' },
  ],
  [
    { digit: '*', sub: ' ' },
    { digit: '0', sub: '+' },
    { digit: '#', sub: ' ' },
  ],
];

export default function DirectDialerScreen() {
  const { phone_number } = useLocalSearchParams<{ phone_number?: string }>();
  const [phone, setPhone] = useState(phone_number || '');
  const [leadId, setLeadId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState<CallDraft[]>([]);
  const { user, token } = useAuth();
  const { leads } = useLeads();
  const styles = useAppStyles(createStyles);
  const { colors } = useAppTheme();
  const mounted = useRef(false);
  const calling = useRef(false);

  useFocusEffect(
    useCallback(() => {
      mounted.current = true;
      if (user) {
        void listCallDrafts(user.id)
          .then((items) => {
            if (mounted.current) setDrafts(items);
          })
          .catch(() => {
            Alert.alert('Drafts unavailable', 'Could not read saved call drafts.');
          });
      }
      return () => {
        mounted.current = false;
      };
    }, [user?.id])
  );

  const matchedLead = useMemo(() => {
    if (leadId) {
      return leads.find((item) => item.id === leadId);
    }
    const clean = phone.replace(/[^0-9]/g, '');
    if (clean.length >= 7) {
      return leads.find(
        (l) =>
          l.phone.replace(/[^0-9]/g, '').endsWith(clean) ||
          clean.endsWith(l.phone.replace(/[^0-9]/g, ''))
      );
    }
    return undefined;
  }, [leadId, phone, leads]);

  const handleDigitPress = (digit: string) => {
    if (phone.length >= 25) return;
    setPhone((prev) => prev + digit);
    setLeadId(undefined);
  };

  const handleZeroLongPress = () => {
    if (phone.length >= 25) return;
    setPhone((prev) => prev + '+');
    setLeadId(undefined);
  };

  const handleDelete = () => {
    setPhone((prev) => prev.slice(0, -1));
    setLeadId(undefined);
  };

  const handleClear = () => {
    setPhone('');
    setLeadId(undefined);
  };

  const handleSelectLead = (selectedId: string, selectedPhone: string) => {
    setPhone(selectedPhone);
    setLeadId(selectedId);
  };

  const call = async () => {
    if (calling.current || !token) return;
    if (Platform.OS !== 'android') {
      Alert.alert('Android required', 'Cellular calling is available on Android devices.');
      return;
    }
    const digitsOnly = phone.replace(/[^0-9]/g, '');
    if (!/^\+?[0-9 ().-]+$/.test(phone) || digitsOnly.length < 7 || digitsOnly.length > 15) {
      Alert.alert('Invalid number', 'Enter a phone number with 7 to 15 digits.');
      return;
    }
    calling.current = true;
    setBusy(true);
    try {
      const selected = leads.find((item) => item.id === leadId) || matchedLead;
      const target = await apiRequest<{ phone_number: string; lead: number | null; lead_name: string | null }>(
        '/calls/resolve/',
        {
          method: 'POST',
          body: selected ? { lead: Number(selected.id) } : { phone_number: phone },
          token,
        }
      );
      if (mounted.current) {
        router.push({
          pathname: '/dialer',
          params: {
            direct: '1',
            phone_number: target.phone_number,
            id: target.lead ? String(target.lead) : '',
            name: target.lead_name || target.phone_number,
          },
        });
      }
    } catch (e) {
      Alert.alert('Cannot start call', e instanceof Error ? e.message : 'Check your connection and try again.');
    } finally {
      calling.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const filteredLeads = useMemo(() => {
    const clean = phone.trim().toLowerCase();
    if (!clean) return leads.slice(0, 15);
    return leads
      .filter((l) => l.name.toLowerCase().includes(clean) || l.phone.includes(clean))
      .slice(0, 15);
  }, [leads, phone]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Top Header */}
        <View style={styles.header}>
          <AnimatedBackButton />
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Direct Dialer</Text>
            <Text style={styles.headerSubtitle}>Keypad calling & assigned leads</Text>
          </View>
          {phone.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear number"
              onPress={handleClear}
              style={styles.clearHeaderButton}
            >
              <Text style={styles.clearHeaderText}>Clear</Text>
            </Pressable>
          ) : (
            <View style={styles.headerSpacer} />
          )}
        </View>

        {/* Display Card */}
        <View style={styles.displayCard}>
          <View style={styles.numberRow}>
            <Text
              style={[
                styles.numberText,
                !phone && styles.placeholderText,
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {phone || 'Enter number'}
            </Text>

            {phone.length > 0 && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Backspace"
                onPress={handleDelete}
                onLongPress={handleClear}
                style={styles.backspaceButton}
              >
                <Text style={styles.backspaceIcon}>⌫</Text>
              </Pressable>
            )}
          </View>

          {/* Lead match indicator */}
          {matchedLead ? (
            <View style={styles.matchedLeadPill}>
              <Text style={styles.matchedLeadIcon}>👤</Text>
              <Text style={styles.matchedLeadName} numberOfLines={1}>
                {matchedLead.name}
              </Text>
              <View style={styles.matchedBadge}>
                <Text style={styles.matchedBadgeText}>Assigned Lead</Text>
              </View>
            </View>
          ) : phone.length >= 7 ? (
            <View style={styles.externalPill}>
              <Text style={styles.externalPillText}>Direct / External Call (No lead)</Text>
            </View>
          ) : (
            <Text style={styles.hintText}>Tap digits below or select an assigned lead</Text>
          )}
        </View>

        {/* Phone Keypad */}
        <View style={styles.keypadContainer}>
          {KEYPAD_ROWS.map((row, rIndex) => (
            <View key={rIndex} style={styles.keypadRow}>
              {row.map((item) => (
                <Pressable
                  key={item.digit}
                  accessibilityRole="button"
                  accessibilityLabel={`Key ${item.digit}`}
                  disabled={busy}
                  style={({ pressed }) => [
                    styles.keyButton,
                    pressed && styles.keyButtonPressed,
                  ]}
                  onPress={() => handleDigitPress(item.digit)}
                  onLongPress={item.digit === '0' ? handleZeroLongPress : undefined}
                >
                  <Text style={styles.keyDigit}>{item.digit}</Text>
                  {!!item.sub.trim() && (
                    <Text style={styles.keySub}>{item.sub}</Text>
                  )}
                </Pressable>
              ))}
            </View>
          ))}

          {/* Action Row: Green Call Button */}
          <View style={styles.callRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Call"
              disabled={busy || phone.length < 3}
              style={({ pressed }) => [
                styles.callButton,
                (busy || phone.length < 3) && styles.callButtonDisabled,
                pressed && styles.callButtonPressed,
              ]}
              onPress={call}
            >
              {busy ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.callIcon}>📞</Text>
              )}
            </Pressable>
          </View>
        </View>

        {/* Unfinished Drafts Section */}
        {drafts.length > 0 && (
          <View style={styles.draftsSection}>
            <View style={styles.draftsHeader}>
              <Text style={styles.sectionTitle}>Unfinished Outcomes</Text>
              <View style={styles.draftBadge}>
                <Text style={styles.draftBadgeText}>{drafts.length} pending</Text>
              </View>
            </View>

            {drafts.map((draft) => (
              <View key={draft.id} style={styles.draftCard}>
                <View style={styles.draftInfo}>
                  <Text style={styles.draftName}>{draft.name || draft.phone}</Text>
                  <Text style={styles.draftSub}>
                    {draft.startedAt
                      ? new Date(draft.startedAt).toLocaleTimeString('en-IN', {
                          hour: 'numeric',
                          minute: '2-digit',
                        })
                      : 'Saved'}{' '}
                    • {draft.endedAt ? 'Ready to submit' : 'Timing incomplete'}
                  </Text>
                </View>

                <View style={styles.draftActions}>
                  {draft.endedAt ? (
                    <Pressable
                      style={styles.continueButton}
                      onPress={() =>
                        router.push({
                          pathname: '/call-outcome',
                          params: { draft_id: draft.id },
                        })
                      }
                    >
                      <Text style={styles.continueButtonText}>Continue</Text>
                    </Pressable>
                  ) : null}

                  <Pressable
                    style={styles.discardButton}
                    onPress={() =>
                      Alert.alert(
                        'Discard draft?',
                        'This only removes the draft from this device.',
                        [
                          { text: 'Keep', style: 'cancel' },
                          {
                            text: 'Discard',
                            style: 'destructive',
                            onPress: () => {
                              void removeCallDraft(draft.userId, draft.id).then(() =>
                                setDrafts((items) => items.filter((i) => i.id !== draft.id))
                              );
                            },
                          },
                        ]
                      )
                    }
                  >
                    <Text style={styles.discardButtonText}>Discard</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Assigned Leads Section */}
        <View style={styles.leadsSection}>
          <Text style={styles.sectionTitle}>Assigned Leads</Text>
          <Text style={styles.sectionSubtitle}>
            Tap any assigned student to autofill their phone number
          </Text>

          <View style={styles.leadsList}>
            {filteredLeads.map((item) => {
              const isSelected = item.id === leadId || (matchedLead && matchedLead.id === item.id);
              return (
                <Pressable
                  key={item.id}
                  style={[styles.leadItem, isSelected && styles.leadItemSelected]}
                  onPress={() => handleSelectLead(item.id, item.phone)}
                >
                  <View style={styles.leadAvatar}>
                    <Text style={styles.leadAvatarText}>
                      {item.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.leadDetails}>
                    <Text style={styles.leadName}>{item.name}</Text>
                    <Text style={styles.leadPhone}>{item.phone}</Text>
                  </View>
                  {isSelected && (
                    <View style={styles.selectedPill}>
                      <Text style={styles.selectedPillText}>Selected</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
            {filteredLeads.length === 0 && (
              <Text style={styles.emptyLeadsText}>No assigned leads match this number.</Text>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingBottom: 40,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      marginBottom: 8,
    },
    headerCenter: {
      flex: 1,
      marginLeft: 12,
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.text,
    },
    headerSubtitle: {
      fontSize: 12,
      color: colors.muted,
      marginTop: 2,
    },
    clearHeaderButton: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 14,
      backgroundColor: colors.surfaceMuted,
    },
    clearHeaderText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.danger,
    },
    headerSpacer: {
      width: 42,
    },
    displayCard: {
      backgroundColor: colors.surface,
      borderRadius: 20,
      paddingHorizontal: 18,
      paddingVertical: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
    },
    numberRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
      minHeight: 48,
    },
    numberText: {
      fontSize: 32,
      fontWeight: '700',
      color: colors.text,
      letterSpacing: 1.5,
      textAlign: 'center',
      flex: 1,
    },
    placeholderText: {
      color: colors.placeholder,
      fontSize: 24,
      fontWeight: '500',
      letterSpacing: 0,
    },
    backspaceButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.surfaceMuted,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 8,
    },
    backspaceIcon: {
      fontSize: 18,
      color: colors.text,
      fontWeight: '600',
    },
    matchedLeadPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.accentSoft,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      marginTop: 8,
      maxWidth: '90%',
    },
    matchedLeadIcon: {
      fontSize: 14,
    },
    matchedLeadName: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text,
      flexShrink: 1,
    },
    matchedBadge: {
      backgroundColor: colors.primary,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 8,
    },
    matchedBadgeText: {
      fontSize: 10,
      fontWeight: '700',
      color: colors.onPrimary,
    },
    externalPill: {
      backgroundColor: colors.surfaceMuted,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      marginTop: 8,
    },
    externalPillText: {
      fontSize: 12,
      color: colors.muted,
      fontWeight: '500',
    },
    hintText: {
      fontSize: 12,
      color: colors.placeholder,
      marginTop: 6,
    },
    keypadContainer: {
      alignItems: 'center',
      gap: 12,
      marginBottom: 20,
    },
    keypadRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 24,
      width: '100%',
    },
    keyButton: {
      width: 70,
      height: 70,
      borderRadius: 35,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    keyButtonPressed: {
      backgroundColor: colors.accentSoft,
      transform: [{ scale: 0.94 }],
    },
    keyDigit: {
      fontSize: 26,
      fontWeight: '600',
      color: colors.text,
      lineHeight: 30,
    },
    keySub: {
      fontSize: 9,
      fontWeight: '700',
      color: colors.muted,
      letterSpacing: 1.5,
      marginTop: 1,
    },
    callRow: {
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 6,
      width: '100%',
    },
    callButton: {
      width: 66,
      height: 66,
      borderRadius: 33,
      backgroundColor: colors.success,
      alignItems: 'center',
      justifyContent: 'center',
      elevation: 4,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 8,
    },
    callButtonDisabled: {
      backgroundColor: colors.disabled,
      opacity: 0.5,
      elevation: 0,
    },
    callButtonPressed: {
      transform: [{ scale: 0.92 }],
      opacity: 0.85,
    },
    callIcon: {
      fontSize: 26,
      color: '#FFFFFF',
    },
    draftsSection: {
      marginBottom: 20,
    },
    draftsHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    draftBadge: {
      backgroundColor: colors.warningSoft,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
    },
    draftBadgeText: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.warning,
    },
    draftCard: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 8,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    draftInfo: {
      flex: 1,
    },
    draftName: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text,
    },
    draftSub: {
      fontSize: 12,
      color: colors.muted,
      marginTop: 2,
    },
    draftActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    continueButton: {
      backgroundColor: colors.primary,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 10,
    },
    continueButtonText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.onPrimary,
    },
    discardButton: {
      paddingHorizontal: 8,
      paddingVertical: 7,
    },
    discardButtonText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.danger,
    },
    leadsSection: {
      marginTop: 4,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
    },
    sectionSubtitle: {
      fontSize: 12,
      color: colors.muted,
      marginTop: 2,
      marginBottom: 10,
    },
    leadsList: {
      gap: 8,
    },
    leadItem: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.border,
      flexDirection: 'row',
      alignItems: 'center',
    },
    leadItemSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.accentSoft,
    },
    leadAvatar: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.surfaceMuted,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    leadAvatarText: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.primary,
    },
    leadDetails: {
      flex: 1,
    },
    leadName: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
    },
    leadPhone: {
      fontSize: 12,
      color: colors.muted,
      marginTop: 2,
    },
    selectedPill: {
      backgroundColor: colors.primary,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
    },
    selectedPillText: {
      fontSize: 10,
      fontWeight: '700',
      color: colors.onPrimary,
    },
    emptyLeadsText: {
      fontSize: 13,
      color: colors.placeholder,
      textAlign: 'center',
      paddingVertical: 14,
    },
  });
