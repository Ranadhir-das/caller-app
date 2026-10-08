import { Redirect, Tabs } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { CallerTabBar } from '@/components/CallerTabBar';

export default function TabsLayout() {
  const { user } = useAuth();
  if (user && user.role !== 'CALLER') return <Redirect href={'/employee' as never} />;

  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={props => <CallerTabBar {...props} />}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="leads" options={{ title: 'Leads' }} />
      <Tabs.Screen name="history" options={{ title: 'History' }} />
      <Tabs.Screen name="more" options={{ title: 'More' }} />
    </Tabs>
  );
}
