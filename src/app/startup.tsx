import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { SplashBackgroundColor } from '@/constants/theme';

/** Fallback while startup guards settle, including reloads without a native splash. */
export default function StartupScreen() {
  return (
    <View style={styles.container}>
      <Image
        accessibilityLabel="Al-Batoul"
        contentFit="contain"
        source={require('../../assets/images/logo.png')}
        style={styles.logo}
        transition={0}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: SplashBackgroundColor,
    flex: 1,
    justifyContent: 'center',
  },
  logo: {
    height: 220,
    width: 220,
  },
});
