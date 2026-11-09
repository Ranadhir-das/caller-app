import { useEffect, useState } from 'react';
import { Image, Keyboard, Platform, Pressable, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { useAppTheme } from '@/context/AppThemeContext';
import { VectorIcon } from '@/components/VectorIcon';

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
  if (name === 'add-lead') {
    return <VectorIcon name="user-plus" color={color} size={22} />;
  }
  if (name === 'quick-capture') {
    return <VectorIcon name="camera" color={color} size={22} />;
  }
  return <Image source={icons[name] ?? icons.more} resizeMode="contain" style={[styles.icon, { tintColor: color }]} />;
}

type TabBarAccent = { accent?: string; inactiveTint?: string };

/** Floating pill bottom navigation bar with elevated depth, safe-area awareness, and high contrast. */
export function CallerTabBar({ state, descriptors, navigation, insets, accent = BLUE, inactiveTint = '#B8D3FF' }: BottomTabBarProps & TabBarAccent) {
  const { colors } = useAppTheme();
  const [keyboardVisible, setKeyboardVisible] = useState(Keyboard.isVisible());
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  if (keyboardVisible) return null;

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.footer,
        {
          paddingBottom: Math.max(insets.bottom, 14),
          paddingLeft: Math.max(insets.left, 16),
          paddingRight: Math.max(insets.right, 16),
        },
      ]}
    >
      <View style={[styles.bar, { backgroundColor: accent }]}>
        {state.routes.map((route, index) => {
          const selected = state.index === index;
          const options = descriptors[route.key].options;
          const title = options.title ?? route.name;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? title}
              testID={options.tabBarButtonTestID}
              onPress={() => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!selected && !event.defaultPrevented) navigation.navigate(route.name, route.params);
              }}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
              style={({ pressed }) => [styles.tab, selected && styles.selected, pressed && styles.pressed]}
            >
              <TabIcon name={route.name} selected={selected} accent={accent} inactive={inactiveTint} />
              <Text
                numberOfLines={1}
                maxFontSizeMultiplier={1.1}
                style={[
                  styles.label,
                  { color: selected ? accent : inactiveTint },
                  selected && styles.selectedLabel,
                ]}
              >
                {title}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
    elevation: 16,
  },
  bar: {
    width: '100%',
    maxWidth: 480,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: BLUE,
    borderRadius: 32,
    paddingHorizontal: 6,
    paddingVertical: 6,
    minHeight: 60,
    // Modern floating elevation and deep shadow
    shadowColor: '#001A4D',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.22)',
  },
  tab: {
    flex: 1,
    minHeight: 48,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    gap: 2,
    paddingVertical: 5,
    paddingHorizontal: 2,
    marginHorizontal: 2,
  },
  selected: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  icon: {
    width: 22,
    height: 22,
  },
  label: {
    fontSize: 10.5,
    fontWeight: '600',
    textAlign: 'center',
  },
  selectedLabel: {
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.8,
  },
});
