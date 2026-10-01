import { Image } from 'expo-image';

export function NotificationIcon({ color, size = 24 }: { color: string; size?: number }) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>`;
  return <Image source={{ uri: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}` }} style={{ width: size, height: size }} />;
}
