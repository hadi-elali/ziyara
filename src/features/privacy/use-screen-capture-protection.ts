import { usePreventScreenCapture } from 'expo-screen-capture';

export function useScreenCaptureProtection() {
  usePreventScreenCapture('ziyara-app');
}
