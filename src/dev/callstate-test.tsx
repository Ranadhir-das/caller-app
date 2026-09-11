import { useEffect, useState } from 'react';
import {
    Alert,
    PermissionsAndroid,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';

import CallstateModule, {
    CallState,
} from '../../modules/callstate/src/CallstateModule';

export default function CallstateTestScreen() {
  const [callState, setCallState] = useState<CallState>('UNKNOWN');
  const [permissionGranted, setPermissionGranted] = useState(false);

  useEffect(() => {
    const subscription = CallstateModule.addListener(
      'onCallStateChanged',
      (event) => {
        console.log('CALL STATE:', event.state);
        setCallState(event.state);
      }
    );

    return () => {
      subscription.remove();
    };
  }, []);

  const requestPermissions = async () => {
    if (Platform.OS !== 'android') {
      return;
    }

    try {
      const result = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE,
        PermissionsAndroid.PERMISSIONS.CALL_PHONE,
      ]);

      console.log('PERMISSION RESULT:', result);

      const phoneStateGranted =
        result[PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE] ===
        PermissionsAndroid.RESULTS.GRANTED;

      const callGranted =
        result[PermissionsAndroid.PERMISSIONS.CALL_PHONE] ===
        PermissionsAndroid.RESULTS.GRANTED;

      if (phoneStateGranted && callGranted) {
        setPermissionGranted(true);

        CallstateModule.startMonitoring();

        Alert.alert(
          'Permissions Granted',
          'Phone state and calling permissions are ready.'
        );
      } else {
        Alert.alert(
          'Permission Required',
          'Both phone permissions are required for automatic calling.'
        );
      }
    } catch (error) {
      console.error('Permission error:', error);
    }
  };

  const makeTestCall = () => {
    if (!permissionGranted) {
      Alert.alert(
        'Permission Required',
        'Grant phone permissions first.'
      );
      return;
    }

    CallstateModule.startCall('8101421053');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Call State Test</Text>

      <Text style={styles.label}>
        Permission:
      </Text>

      <Text style={styles.value}>
        {permissionGranted ? 'Granted' : 'Not Granted'}
      </Text>

      <Text style={styles.label}>
        Current Call State:
      </Text>

      <Text style={styles.state}>
        {callState}
      </Text>

      <Pressable
        style={styles.button}
        onPress={requestPermissions}
      >
        <Text style={styles.buttonText}>
          Grant Phone Permissions
        </Text>
      </Pressable>

      <Pressable
        style={[
          styles.button,
          !permissionGranted && styles.disabledButton,
        ]}
        onPress={makeTestCall}
        disabled={!permissionGranted}
      >
        <Text style={styles.buttonText}>
          Test Automatic Call
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },

  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 40,
  },

  label: {
    fontSize: 16,
    opacity: 0.6,
    marginTop: 16,
  },

  value: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 6,
  },

  state: {
    fontSize: 32,
    fontWeight: '800',
    marginTop: 6,
    marginBottom: 30,
  },

  button: {
    backgroundColor: '#2563EB',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 14,
  },

  disabledButton: {
    opacity: 0.4,
  },

  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});