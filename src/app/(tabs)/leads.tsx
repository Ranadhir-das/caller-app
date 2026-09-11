import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useLeads } from '@/context/LeadContext';
import { Lead } from '@/types';

export default function LeadsScreen() {
  const { leads } = useLeads();
  
  const renderLead = ({ item }: { item: Lead }) => {
    return (
      <Pressable
        style={styles.leadCard}
        onPress={() => {
          router.push({
            pathname: '/lead-details',
            params: {
              id: item.id,
            },
          });
        }}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {item.name.charAt(0).toUpperCase()}
          </Text>
        </View>

        <View style={styles.leadInfo}>
          <Text style={styles.name}>{item.name}</Text>

          {item.company && (
            <Text style={styles.company}>{item.company}</Text>
          )}

          <Text style={styles.phone}>📞 {item.phone}</Text>
        </View>

        <View style={styles.status}>
          <Text style={styles.statusText}>Pending</Text>
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Leads</Text>
          <Text style={styles.subtitle}>
            Your assigned leads
          </Text>
        </View>

        <View style={styles.countBadge}>
          <Text style={styles.countText}>{leads.length}</Text>
        </View>
      </View>

      <FlatList
        data={leads}
        keyExtractor={(item) => item.id}
        renderItem={renderLead}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F8FA',
    paddingHorizontal: 20,
  },

  header: {
    paddingTop: 20,
    paddingBottom: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
  },

  subtitle: {
    marginTop: 5,
    fontSize: 14,
    color: '#6B7280',
  },

  countBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#2563EB',
    justifyContent: 'center',
    alignItems: 'center',
  },

  countText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },

  list: {
    paddingBottom: 20,
  },

  leadCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },

  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#DBEAFE',
    justifyContent: 'center',
    alignItems: 'center',
  },

  avatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2563EB',
  },

  leadInfo: {
    flex: 1,
    marginLeft: 12,
  },

  name: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },

  company: {
    marginTop: 3,
    fontSize: 13,
    color: '#6B7280',
  },

  phone: {
    marginTop: 5,
    fontSize: 13,
    color: '#374151',
  },

  status: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
  },

  statusText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#92400E',
  },
});