
import Svg, {
  Circle,
  Line,
  Path,
  Polyline,
  Rect,
} from 'react-native-svg';

export type VectorIconName =
  | 'home'
  | 'leads'
  | 'user-plus'
  | 'camera'
  | 'more'
  | 'briefcase'
  | 'user'
  | 'settings'
  | 'chevron-right'
  | 'plus'
  | 'clock'
  | 'check-circle'
  | 'admission'
  | 'chat'
  | 'phone';

export function VectorIcon({
  name,
  color = '#0F766E',
  size = 22,
}: {
  name: VectorIconName;
  color?: string;
  size?: number;
}) {
  const common = {
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none' as const,
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'home' && (
        <>
          <Path {...common} d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <Polyline {...common} points="9 22 9 12 15 12 15 22" />
        </>
      )}

      {name === 'leads' && (
        <>
          <Path {...common} d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <Circle {...common} cx="9" cy="7" r="4" />
          <Path {...common} d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </>
      )}

      {name === 'user-plus' && (
        <>
          <Path {...common} d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <Circle {...common} cx="8.5" cy="7" r="4" />
          <Line {...common} x1="20" y1="8" x2="20" y2="14" />
          <Line {...common} x1="17" y1="11" x2="23" y2="11" />
        </>
      )}

      {name === 'camera' && (
        <>
          <Path {...common} d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <Circle {...common} cx="12" cy="13" r="4" />
        </>
      )}

      {name === 'more' && (
        <>
          <Circle cx="5" cy="12" r="1.5" fill={color} />
          <Circle cx="12" cy="12" r="1.5" fill={color} />
          <Circle cx="19" cy="12" r="1.5" fill={color} />
        </>
      )}

      {name === 'briefcase' && (
        <>
          <Rect {...common} x="2" y="7" width="20" height="14" rx="2" />
          <Path {...common} d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M2 12h20" />
        </>
      )}

      {name === 'user' && (
        <>
          <Path {...common} d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <Circle {...common} cx="12" cy="7" r="4" />
        </>
      )}

      {name === 'settings' && (
        <>
          <Circle {...common} cx="12" cy="12" r="3" />
          <Path {...common} d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </>
      )}

      {name === 'chevron-right' && (
        <Polyline {...common} strokeWidth={2.5} points="9 18 15 12 9 6" />
      )}

      {name === 'plus' && (
        <>
          <Line {...common} strokeWidth={2.5} x1="12" y1="5" x2="12" y2="19" />
          <Line {...common} strokeWidth={2.5} x1="5" y1="12" x2="19" y2="12" />
        </>
      )}

      {name === 'clock' && (
        <>
          <Circle {...common} cx="12" cy="12" r="10" />
          <Polyline {...common} points="12 6 12 12 16 14" />
        </>
      )}

      {name === 'check-circle' && (
        <>
          <Path {...common} d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <Polyline {...common} points="22 4 12 14.01 9 11.01" />
        </>
      )}

      {name === 'admission' && (
        <>
          <Path {...common} d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <Polyline {...common} points="14 2 14 8 20 8" />
          <Line {...common} x1="8" y1="13" x2="16" y2="13" />
          <Line {...common} x1="8" y1="17" x2="16" y2="17" />
          <Polyline {...common} points="8 9 9 9 10 9" />
        </>
      )}

      {name === 'chat' && (
        <Path {...common} d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      )}

      {name === 'phone' && (
        <Path {...common} d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A12.84 12.84 0 0 0 22 16.92z" />
      )}
    </Svg>
  );
}
