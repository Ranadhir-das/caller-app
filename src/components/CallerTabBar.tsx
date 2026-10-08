import { useEffect, useState } from 'react';
import { Image, Keyboard, Platform, Pressable, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { useAppTheme } from '@/context/AppThemeContext';

const BLUE = '#005DF2';
const icons: Record<string, ImageSourcePropType> = {
  index: require('../../assets/images/tab-icons/index.png'),
  leads: require('../../assets/images/tab-icons/leads.png'),
  history: require('../../assets/images/tab-icons/history.png'),
  more: require('../../assets/images/tab-icons/more.png'),
  attendance: require('../../assets/images/tab-icons/attendance.png'),
  leave: require('../../assets/images/tab-icons/leave.png'),
  work: require('../../assets/images/tab-icons/work.png'),
};

function TabIcon({ name, selected, accent = BLUE, inactive = '#A7C8FF' }: { name: string; selected: boolean; accent?: string; inactive?: string }) {
  const color = selected ? accent : inactive;
  return <Image source={icons[name] ?? icons.more} resizeMode="contain" style={[styles.icon, { tintColor: color }]} />;
}

type TabBarAccent = { accent?: string; inactiveTint?: string };

/** Reserves its own space so the bar never covers screen actions. */
export function CallerTabBar({ state, descriptors, navigation, insets, accent = BLUE, inactiveTint = '#A7C8FF' }: BottomTabBarProps & TabBarAccent) {
  const { colors } = useAppTheme();
  const [keyboardVisible, setKeyboardVisible] = useState(Keyboard.isVisible());
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  if (keyboardVisible) return null;

  return (
    <View style={[styles.footer, {
      backgroundColor: colors.background,
      paddingBottom: Math.max(insets.bottom, 10),
      paddingLeft: Math.max(insets.left, 16),
      paddingRight: Math.max(insets.right, 16),
    }]}>
      <View style={[styles.bar, { backgroundColor: accent }]}>
        {state.routes.map((route, index) => {
          const selected = state.index === index;
          const options = descriptors[route.key].options;
          const title = options.title ?? route.name;
          return (
            <Pressable key={route.key} accessibilityRole="tab" accessibilityState={{ selected }}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? title}
              testID={options.tabBarButtonTestID}
              onPress={() => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!selected && !event.defaultPrevented) navigation.navigate(route.name, route.params);
              }}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
              style={({ pressed }) => [styles.tab, selected && styles.selected, pressed && styles.pressed]}>
              <TabIcon name={route.name} selected={selected} accent={accent} inactive={inactiveTint} />
              {selected && <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.label, { color: accent }]}>{title}</Text>}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: { paddingTop: 8 },
  bar: { width: '100%', maxWidth: 520, alignSelf: 'center', flexDirection: 'row', alignItems: 'center',
    backgroundColor: BLUE, borderRadius: 40, padding: 10, gap: 4, minHeight: 64 },
  tab: { flex: 1, minHeight: 44, minWidth: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 28, gap: 7, paddingHorizontal: 6 },
  selected: { flex: 2.3, backgroundColor: '#FFFFFF' },
  icon: { width: 22, height: 22 },
  label: { color: BLUE, fontSize: 13, fontWeight: '700', flexShrink: 1 },
  pressed: { opacity: 0.75 },
});
