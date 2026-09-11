import { router, useLocalSearchParams } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { leads } from '@/data/leads';

export default function LeadDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const lead = leads.find((item) => item.id === id);

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

          <Text style={styles.headerTitle}>Lead Details</Text>

          <View style={styles.headerSpace} />
        </View>

        {/* Profile */}
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {lead.name.charAt(0).toUpperCase()}
            </Text>
          </View>

          <Text style={styles.name}>{lead.name}</Text>

          {lead.company && (
            <Text style={styles.company}>{lead.company}</Text>
          )}

          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>Pending</Text>
          </View>
        </View>

        {/* Contact Information */}
        <Text style={styles.sectionTitle}>Contact Information</Text>

        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoIcon}>📞</Text>

            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Phone</Text>
              <Text style={styles.infoValue}>{lead.phone}</Text>
            </View>
          </View>

          {lead.email && (
            <View style={styles.infoRow}>
              <Text style={styles.infoIcon}>✉️</Text>

              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Email</Text>
                <Text style={styles.infoValue}>{lead.email}</Text>
              </View>
            </View>
          )}

          {lead.company && (
            <View style={styles.infoRow}>
              <Text style={styles.infoIcon}>🏢</Text>

              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Company</Text>
                <Text style={styles.infoValue}>{lead.company}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Notes */}
        <Text style={styles.sectionTitle}>Notes</Text>

        <View style={styles.notesCard}>
          <Text style={styles.notesText}>
            {lead.notes || 'No notes added yet.'}
          </Text>
        </View>

        {/* Call Button */}
        <Pressable
          style={styles.callButton}
          onPress={() => {
            Linking.openURL(`tel:${lead.phone}`);
          }}
        >
          <Text style={styles.callIcon}>📞</Text>
          <Text style={styles.callButtonText}>Call Lead</Text>
        </Pressable>
        
        <Pressable
          style={styles.completedButton}
          onPress={() => {
            router.push({
              pathname: '/call-outcome',
              params: {
                id: lead.id,
              },
            });
          }}
        >
          <Text style={styles.completedButtonText}>
            Call Completed
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
    paddingHorizontal: 20,
    paddingBottom: 30,
  },

  header: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    fontSize: 32,
    color: '#111827',
    marginTop: -4,
  },

  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },

  headerSpace: {
    width: 42,
  },

  profileCard: {
    marginTop: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
  },

  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },

  avatarText: {
    fontSize: 30,
    fontWeight: '700',
    color: '#2563EB',
  },

  name: {
    marginTop: 14,
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
  },

  company: {
    marginTop: 5,
    fontSize: 14,
    color: '#6B7280',
  },

  statusBadge: {
    marginTop: 12,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },

  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#92400E',
  },

  sectionTitle: {
    marginTop: 24,
    marginBottom: 10,
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },

  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 16,
  },

  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },

  infoIcon: {
    width: 40,
    fontSize: 20,
  },

  infoContent: {
    flex: 1,
  },

  infoLabel: {
    fontSize: 12,
    color: '#9CA3AF',
  },

  infoValue: {
    marginTop: 3,
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },

  notesCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    minHeight: 70,
  },

  notesText: {
    fontSize: 14,
    color: '#6B7280',
  },

  callButton: {
    marginTop: 25,
    height: 56,
    borderRadius: 16,
    backgroundColor: '#2563EB',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },

  callIcon: {
    fontSize: 20,
    marginRight: 8,
  },

  callButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },

  errorTitle: {
    margin: 20,
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },

  backButton: {
    marginHorizontal: 20,
    backgroundColor: '#2563EB',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },

  backButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  completedButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#2563EB',
    borderRadius: 15,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  
  completedButtonText: {
    color: '#2563EB',
    fontSize: 16,
    fontWeight: '700',
  },
});