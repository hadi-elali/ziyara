import { StatusBar } from 'expo-status-bar';
import { Modal, StyleSheet, View } from 'react-native';

type HomeLockScreenProps = {
  locked: boolean;
  pathname: string;
};

export function HomeLockScreen({ locked, pathname }: HomeLockScreenProps) {
  if (!locked || pathname !== '/') return null;

  return (
    <Modal
      animationType="none"
      navigationBarTranslucent
      onRequestClose={() => undefined}
      presentationStyle="fullScreen"
      statusBarTranslucent
      visible>
      <StatusBar animated={false} hidden />
      <View style={styles.screen} testID="home-lock-screen" />
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#000000',
    flex: 1,
  },
});
