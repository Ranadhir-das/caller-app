import { Tabs } from 'expo-router';
import { CallerTabBar } from '@/components/CallerTabBar';
import { COUNSELOR_TEAL } from '@/services/counselor';

export const unstable_settings = { initialRouteName: 'index' };

/** Counselor workspace: 5 distinct, accessible navigation destinations. */
export default function CounselorTabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <CallerTabBar {...props} accent={COUNSELOR_TEAL} inactiveTint="#A7E3DA" />}
    >
      <Tabs.Screen name="index" options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="leads" options={{ title: 'Leads' }} />
      <Tabs.Screen name="add-lead" options={{ title: 'Add Lead' }} />
      <Tabs.Screen name="quick-capture" options={{ title: 'Capture' }} />
      <Tabs.Screen name="more" options={{ title: 'More' }} />
    </Tabs>
  );
}
