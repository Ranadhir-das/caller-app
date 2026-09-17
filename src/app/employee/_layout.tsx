import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { EmployeeWorkspaceProvider, useEmployeeWorkspace } from '@/context/EmployeeWorkspaceContext';

// 'employee' is a plain named folder, not a '(group)' — unlike (tabs), Expo Router does not
// automatically anchor it to its index route, so '/employee' alone would have no defined
// default tab without this. This is the documented escape hatch for exactly that case.
export const unstable_settings = {
  initialRouteName: 'index',
};

function EmployeeTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme];
  const { load } = useEmployeeWorkspace();
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return (
    <NativeTabs
      backgroundColor={colors.background}
      indicatorColor={colors.backgroundElement}
      labelStyle={{ selected: { color: colors.text } }}
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon md="home" sf="house.fill" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="attendance">
        <NativeTabs.Trigger.Label>Attendance</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon md="fingerprint" sf="checkmark.circle.fill" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="leave">
        <NativeTabs.Trigger.Label>Leave</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon md="event" sf="calendar" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="work">
        <NativeTabs.Trigger.Label>My work</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon md="work" sf="briefcase.fill" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

export default function EmployeeTabsLayout() {
  return <EmployeeWorkspaceProvider><EmployeeTabs /></EmployeeWorkspaceProvider>;
}
