import { useCallback } from 'react';
import { Tabs, useFocusEffect } from 'expo-router';
import { CallerTabBar } from '@/components/CallerTabBar';
import { EmployeeWorkspaceProvider, useEmployeeWorkspace } from '@/context/EmployeeWorkspaceContext';

export const unstable_settings = { initialRouteName: 'index' };

function EmployeeTabs() {
  const { load } = useEmployeeWorkspace();
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={props => <CallerTabBar {...props} />}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="attendance" options={{ title: 'Attendance' }} />
      <Tabs.Screen name="leave" options={{ title: 'Leave' }} />
      <Tabs.Screen name="work" options={{ title: 'My work' }} />
    </Tabs>
  );
}

export default function EmployeeTabsLayout() {
  return <EmployeeWorkspaceProvider><EmployeeTabs /></EmployeeWorkspaceProvider>;
}
