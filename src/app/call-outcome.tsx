import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { leads } from '@/data/leads';

const outcomes = [
  { id: 'interested', label: 'Interested', icon: '👍' },
  { id: 'not_interested', label: 'Not Interested', icon: '👎' },
  { id: 'no_answer', label: 'No Answer', icon: '📵' },
  { id: 'busy', label: 'Busy', icon: '📞' },
  { id: 'call_back', label: 'Call Back', icon: '🔄' },
  { id: 'wrong_number', label: 'Wrong Number', icon: '❌' },
];

export default function CallOutcomeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const lead = leads.find((item) => item.id === id);

  const [selectedOutcome, setSelectedOutcome] = useState('');
  const [notes, setNotes] = useState('');

  if (!lead) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.errorTitle}>Lead not found</Text>

        <Pressable
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>Go Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const handleSave = () => {
    if (!selectedOutcome) {
      return;
    }
  
    console.log('Lead:', lead.name);
    console.log('Outcome:', selectedOutcome);
    console.log('Notes:', notes);
  
    const currentIndex = leads.findIndex(
      (item) => item.id === lead.id
    );
  
    const nextLead = leads[currentIndex + 1];
  
    if (nextLead) {
      router.replace({
        pathname: '/lead-details',
        params: {
          id: nextLead.id,
        },
      });
    } else {
      router.replace('/(tabs)');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            style={styles.backCircle}
            onPress={() => router.back()}
          >
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>

          <Text style={styles.headerTitle}>Call Outcome</Text>

          <View style={styles.headerSpace} />
        </View>

        {/* Lead information */}
        <View style={styles.leadCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {lead.name.charAt(0).toUpperCase()}
            </Text>
          </View>

          <View style={styles.leadInfo}>
            <Text style={styles.leadName}>{lead.name}</Text>

            {lead.company && (
              <Text style={styles.company}>{lead.company}</Text>
            )}

            <Text style={styles.phone}>{lead.phone}</Text>
          </View>
        </View>

        {/* Outcome */}
        <Text style={styles.sectionTitle}>What happened?</Text>

        <View style={styles.outcomeGrid}>
          {outcomes.map((outcome) => {
            const selected = selectedOutcome === outcome.id;

            return (
              <Pressable
                key={outcome.id}
                style={[
                  styles.outcomeCard,
                  selected && styles.outcomeCardSelected,
                ]}
                onPress={() => setSelectedOutcome(outcome.id)}
              >
                <Text style={styles.outcomeIcon}>{outcome.icon}</Text>

                <Text
                  style={[
                    styles.outcomeText,
                    selected && styles.outcomeTextSelected,
                  ]}
                >
                  {outcome.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Notes */}
        <Text style={styles.sectionTitle}>Notes</Text>

        <TextInput
          style={styles.notesInput}
          placeholder="Add notes about this call..."
          placeholderTextColor="#999"
          value={notes}
          onChangeText={setNotes}
          multiline
          textAlignVertical="top"
        />

        {/* Follow-up */}
        {selectedOutcome === 'call_back' && (
          <View style={styles.followUpCard}>
            <Text style={styles.followUpTitle}>
              📅 Follow-up required
            </Text>

            <Text style={styles.followUpText}>
              Follow-up date selection will be added next.
            </Text>
          </View>
        )}

        {/* Save */}
        <Pressable
          style={[
            styles.saveButton,
            !selectedOutcome && styles.saveButtonDisabled,
          ]}
          onPress={handleSave}
          disabled={!selectedOutcome}
        >
          <Text style={styles.saveButtonText}>
            Save Outcome
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F8FA',
  },

  content: {
    padding: 20,
    paddingBottom: 40,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },

  backCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  backIcon: {
    fontSize: 30,
    color: '#222',
    marginTop: -3,
  },

  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111',
  },

  headerSpace: {
    width: 42,
  },

  leadCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 28,
  },

  avatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#E8F0FE',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },

  avatarText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#2563EB',
  },

  leadInfo: {
    flex: 1,
  },

  leadName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111',
    marginBottom: 3,
  },

  company: {
    fontSize: 14,
    color: '#666',
    marginBottom: 3,
  },

  phone: {
    fontSize: 14,
    color: '#333',
  },

  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111',
    marginBottom: 12,
  },

  outcomeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 26,
  },

  outcomeCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },

  outcomeCardSelected: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },

  outcomeIcon: {
    fontSize: 25,
    marginBottom: 8,
  },

  outcomeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#444',
    textAlign: 'center',
  },

  outcomeTextSelected: {
    color: '#2563EB',
  },

  notesInput: {
    minHeight: 120,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 15,
    fontSize: 15,
    color: '#222',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 18,
  },

  followUpCard: {
    backgroundColor: '#FFF7ED',
    borderRadius: 14,
    padding: 15,
    marginBottom: 18,
  },

  followUpTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#C2410C',
    marginBottom: 5,
  },

  followUpText: {
    fontSize: 13,
    color: '#7C2D12',
  },

  saveButton: {
    backgroundColor: '#2563EB',
    borderRadius: 15,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },

  saveButtonDisabled: {
    backgroundColor: '#AFC3E8',
  },

  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },

  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 50,
    color: '#111',
  },

  backButton: {
    backgroundColor: '#2563EB',
    marginHorizontal: 30,
    marginTop: 20,
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
  },

  backButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});