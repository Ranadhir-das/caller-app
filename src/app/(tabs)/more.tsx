import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function MoreScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>More</Text>
      <Text style={styles.subtitle}>
        Account and application settings.
      </Text>

      <View style={styles.profileCard}>
        <View style={styles.profileCircle}>
          <Text style={styles.profileText}>C</Text>
        </View>

        <View>
          <Text style={styles.name}>Caller</Text>
          <Text style={styles.role}>Employee / Caller</Text>
        </View>
      </View>

      <View style={styles.option}>
        <Text style={styles.optionIcon}>👤</Text>
        <Text style={styles.optionText}>My Profile</Text>
      </View>

      <View style={styles.option}>
        <Text style={styles.optionIcon}>⚙️</Text>
        <Text style={styles.optionText}>Settings</Text>
      </View>

      <View style={styles.option}>
        <Text style={styles.optionIcon}>🚪</Text>
        <Text style={styles.optionText}>Logout</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F8FA',
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
  },
  subtitle: {
    marginTop: 6,
    fontSize: 14,
    color: '#6B7280',
  },
  profileCard: {
    marginTop: 25,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  profileText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  name: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
  },
  role: {
    marginTop: 4,
    fontSize: 13,
    color: '#6B7280',
  },
  option: {
    marginTop: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
  },
  optionIcon: {
    fontSize: 20,
    width: 40,
  },
  optionText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },
});