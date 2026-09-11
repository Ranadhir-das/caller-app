import { useDialerSession } from '@/context/DialerSessionContext';
import { useLeads } from '@/context/LeadContext';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  PermissionsAndroid,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import CallstateModule, {
  CallState,
} from '../../modules/callstate/src/CallstateModule';

export default function DialerScreen() {
  const { leads } = useLeads();

  const {
    pauseSession,
    resumeSession,
    stopSession,
    recordSkip,
  } = useDialerSession();

  const params = useLocalSearchParams<{
    id?: string;
  }>();

  // --------------------------------------------------
  // CURRENT STUDENT
  // --------------------------------------------------

  const currentLead =
    leads.find((lead) => lead.id === params.id) ??
    leads.find((lead) => lead.status === 'pending');

  // --------------------------------------------------
  // LOCAL STATE
  // --------------------------------------------------

  const [countdown, setCountdown] = useState(3);
  const [isPaused, setIsPaused] = useState(false);
  const [callStarted, setCallStarted] = useState(false);
  const [callState, setCallState] =
    useState<CallState>('IDLE');

  // --------------------------------------------------
  // REFS
  // --------------------------------------------------

  const countdownRef =
    useRef<ReturnType<typeof setInterval> | null>(null);

  const callWasStartedRef =
    useRef(false);

  const navigatingRef =
    useRef(false);

  const listenerRef =
    useRef<any>(null);

  const monitoringStartedRef =
    useRef(false);

  const appStateRef =
    useRef(AppState.currentState);

  // --------------------------------------------------
  // OPEN OUTCOME
  // --------------------------------------------------

  const openCallOutcome = () => {
    if (!currentLead) {
      return;
    }

    if (navigatingRef.current) {
      return;
    }

    navigatingRef.current = true;

    console.log(
      'CALL ENDED - OPENING OUTCOME'
    );

    router.replace({
      pathname: '/call-outcome',
      params: {
        id: currentLead.id,
      },
    });
  };

  useEffect(() => {
    console.log(
      'DIALER: Registering call-state listener'
    );

    listenerRef.current =
      CallstateModule.addListener(
        'onCallStateChanged',
        (event) => {
          console.log(
            'DIALER CALL STATE:',
            event.state
          );

          setCallState(event.state);

          // ------------------------------------------
          // CALL CONNECTED
          // ------------------------------------------

          if (event.state === 'OFFHOOK') {
            callWasStartedRef.current = true;

            setCallStarted(true);

            console.log(
              'DIALER: Call connected'
            );

            return;
          }

          // ------------------------------------------
          // CALL ENDED
          // ------------------------------------------

          if (
            event.state === 'IDLE' &&
            callWasStartedRef.current &&
            !navigatingRef.current
          ) {
            console.log(
              'DIALER: Call state became IDLE'
            );

            openCallOutcome();
          }
        }
      );

    return () => {
      console.log(
        'DIALER: Removing call-state listener'
      );

      if (listenerRef.current) {
        listenerRef.current.remove();
        listenerRef.current = null;
      }
    };
  }, []);

  // --------------------------------------------------
  // START NATIVE MONITORING
  //
  // IMPORTANT:
  // Also only once.
  // --------------------------------------------------

  useEffect(() => {
    if (monitoringStartedRef.current) {
      return;
    }

    monitoringStartedRef.current = true;

    console.log(
      'DIALER: Starting call-state monitoring'
    );

    try {
      CallstateModule.startMonitoring();

      console.log(
        'DIALER: Call-state monitoring started'
      );
    } catch (error) {
      console.error(
        'DIALER: Monitoring error:',
        error
      );

      monitoringStartedRef.current = false;
    }
  }, []);

  // --------------------------------------------------
  // APP STATE
  //
  // Fallback for devices where native events are
  // delayed while the Phone app is foreground.
  // --------------------------------------------------

  useEffect(() => {
    const subscription =
      AppState.addEventListener(
        'change',
        async (nextState) => {
          console.log(
            'DIALER APP STATE:',
            appStateRef.current,
            '→',
            nextState
          );

          const wasBackground =
            appStateRef.current !== 'active';

          appStateRef.current = nextState;

          // ------------------------------------------
          // APP RETURNED AFTER PHONE CALL
          // ------------------------------------------

          if (
            wasBackground &&
            nextState === 'active' &&
            callWasStartedRef.current &&
            !navigatingRef.current
          ) {
            console.log(
              'DIALER: Returned to app after call'
            );

            try {
              const currentState =
                CallstateModule.getCurrentState();

              console.log(
                'DIALER: Current phone state:',
                currentState
              );

              if (currentState === 'IDLE') {
                console.log(
                  'DIALER: Phone is idle - opening outcome'
                );

                setTimeout(() => {
                  openCallOutcome();
                }, 500);
              }
            } catch (error) {
              console.error(
                'DIALER: Failed to get call state:',
                error
              );
            }
          }
        }
      );

    return () => {
      subscription.remove();
    };
  }, []);

  // --------------------------------------------------
  // COUNTDOWN
  // --------------------------------------------------

  useEffect(() => {
    if (!currentLead) {
      return;
    }
  
    if (callStarted) {
      return;
    }
  
    if (isPaused) {
      return;
    }
  
    // Reset countdown whenever a new student starts.
    setCountdown(3);
  
    // Prevent duplicate interval.
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  
    console.log(
      'DIALER: Starting countdown for:',
      currentLead.name
    );
  
    countdownRef.current = setInterval(() => {
      setCountdown((previous) => {
        console.log(
          'DIALER COUNTDOWN:',
          previous
        );
  
        if (previous <= 1) {
          if (countdownRef.current) {
            clearInterval(countdownRef.current);
            countdownRef.current = null;
          }
  
          startCall();
  
          return 0;
        }
  
        return previous - 1;
      });
    }, 1000);
  
    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    };
  }, [
    currentLead?.id,
    isPaused,
    callStarted,
  ]);

  // --------------------------------------------------
  // REQUEST PHONE PERMISSION
  // --------------------------------------------------

  const requestCallPermission =
    async () => {
      try {
        const result =
          await PermissionsAndroid.requestMultiple(
            [
              PermissionsAndroid.PERMISSIONS
                .CALL_PHONE,

              PermissionsAndroid.PERMISSIONS
                .READ_PHONE_STATE,
            ]
          );

        console.log(
          'DIALER PERMISSIONS:',
          result
        );

        const callPermission =
          result[
            PermissionsAndroid.PERMISSIONS
              .CALL_PHONE
          ] ===
          PermissionsAndroid.RESULTS.GRANTED;

        const phoneStatePermission =
          result[
            PermissionsAndroid.PERMISSIONS
              .READ_PHONE_STATE
          ] ===
          PermissionsAndroid.RESULTS.GRANTED;

        return (
          callPermission &&
          phoneStatePermission
        );
      } catch (error) {
        console.error(
          'PHONE PERMISSION ERROR:',
          error
        );

        return false;
      }
    };

  // --------------------------------------------------
  // START CALL
  // --------------------------------------------------

  const startCall = async () => {
    if (!currentLead) {
      return;
    }

    // Prevent duplicate call attempt.
    if (callWasStartedRef.current) {
      return;
    }

    const permissionGranted =
      await requestCallPermission();

    if (!permissionGranted) {
      Alert.alert(
        'Permission Required',
        'Phone call permission is required to automatically call the student.'
      );

      setIsPaused(true);

      return;
    }

    console.log(
      'STARTING CALL:',
      currentLead.phone
    );

    try {
      // Do NOT set callWasStartedRef here.
      //
      // It becomes true only when native Android
      // reports OFFHOOK.

      CallstateModule.startCall(
        currentLead.phone
      );

      console.log(
        'DIALER: Call request sent'
      );
    } catch (error) {
      console.error(
        'START CALL ERROR:',
        error
      );

      callWasStartedRef.current = false;

      setCallStarted(false);

      Alert.alert(
        'Call Error',
        'Unable to start the phone call.'
      );

      setIsPaused(true);
    }
  };

  // --------------------------------------------------
  // PAUSE
  // --------------------------------------------------

  const pauseCountdown = () => {
    if (countdownRef.current) {
      clearInterval(
        countdownRef.current
      );

      countdownRef.current = null;
    }

    setIsPaused(true);

    pauseSession();
  };

  // --------------------------------------------------
  // RESUME
  // --------------------------------------------------

  const resumeCountdown = () => {
    setCountdown(3);

    setIsPaused(false);

    resumeSession();
  };

  // --------------------------------------------------
  // SKIP
  // --------------------------------------------------

  const skipStudent = () => {
    if (!currentLead) {
      return;
    }

    if (countdownRef.current) {
      clearInterval(
        countdownRef.current
      );

      countdownRef.current = null;
    }

    recordSkip();

    const currentIndex =
      leads.findIndex(
        (lead) =>
          lead.id === currentLead.id
      );

    const nextLead = leads.find(
      (lead, index) =>
        index > currentIndex &&
        lead.status === 'pending'
    );

    const fallbackLead =
      leads.find(
        (lead) =>
          lead.status === 'pending' &&
          lead.id !== currentLead.id
      );

    const nextPendingLead =
      nextLead ?? fallbackLead;

    if (!nextPendingLead) {
      Alert.alert(
        'No Students Pending',
        'There are no more pending students.',
        [
          {
            text: 'OK',
            onPress: () =>
              router.replace('/'),
          },
        ]
      );

      return;
    }

    router.replace({
      pathname: '/dialer',
      params: {
        id: nextPendingLead.id,
      },
    });
  };

  // --------------------------------------------------
  // STOP
  // --------------------------------------------------

  const stopDialer = () => {
    if (countdownRef.current) {
      clearInterval(
        countdownRef.current
      );

      countdownRef.current = null;
    }

    Alert.alert(
      'Stop Dialer?',
      'Do you want to stop the automatic dialer?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Stop',
          style: 'destructive',
          onPress: () => {
            stopSession();

            router.replace('/');
          },
        },
      ]
    );
  };

  // --------------------------------------------------
  // NO STUDENT
  // --------------------------------------------------

  if (!currentLead) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>
          No Students Pending
        </Text>

        <Text style={styles.subtitle}>
          All students have already been processed.
        </Text>

        <Pressable
          style={styles.stopButton}
          onPress={() =>
            router.replace('/')
          }
        >
          <Text
            style={styles.stopButtonText}
          >
            Back to Home
          </Text>
        </Pressable>
      </View>
    );
  }

  // --------------------------------------------------
  // POSITION
  // --------------------------------------------------

  const currentIndex =
    leads.findIndex(
      (lead) =>
        lead.id === currentLead.id
    );

  // --------------------------------------------------
  // UI
  // --------------------------------------------------

  return (
    <View style={styles.container}>
      <Text style={styles.header}>
        Automatic Dialer
      </Text>

      <View style={styles.positionCard}>
        <Text style={styles.positionText}>
          Student {currentIndex + 1} /{' '}
          {leads.length}
        </Text>
      </View>

      <View style={styles.studentCard}>
        <Text style={styles.studentName}>
          {currentLead.name}
        </Text>

        <Text style={styles.phoneNumber}>
          {currentLead.phone}
        </Text>
      </View>

      {!callStarted ? (
        <>
          <Text style={styles.statusLabel}>
            {isPaused
              ? 'Dialer Paused'
              : 'Next call starts in'}
          </Text>

          {!isPaused && (
            <Text style={styles.countdown}>
              {countdown}
            </Text>
          )}

          {isPaused && (
            <Text style={styles.pausedText}>
              Paused
            </Text>
          )}

          <View style={styles.controls}>
            {!isPaused ? (
              <Pressable
                style={styles.pauseButton}
                onPress={
                  pauseCountdown
                }
              >
                <Text
                  style={styles.controlText}
                >
                  Pause
                </Text>
              </Pressable>
            ) : (
              <Pressable
                style={styles.resumeButton}
                onPress={
                  resumeCountdown
                }
              >
                <Text
                  style={styles.controlText}
                >
                  Resume
                </Text>
              </Pressable>
            )}

            <Pressable
              style={styles.skipButton}
              onPress={skipStudent}
            >
              <Text
                style={styles.controlText}
              >
                Skip
              </Text>
            </Pressable>
          </View>

          <Pressable
            style={styles.stopButton}
            onPress={stopDialer}
          >
            <Text
              style={styles.stopButtonText}
            >
              Stop Dialer
            </Text>
          </Pressable>
        </>
      ) : (
        <View style={styles.callingContainer}>
          <Text style={styles.callingIcon}>
            📞
          </Text>

          <Text style={styles.callingText}>
            Call in progress
          </Text>

          <Text style={styles.callState}>
            {callState}
          </Text>

          <Text style={styles.infoText}>
            End the phone call to continue.
          </Text>
        </View>
      )}
    </View>
  );
}

// --------------------------------------------------
// STYLES
// --------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },

  header: {
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 20,
  },

  positionCard: {
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#E5E7EB',
    marginBottom: 20,
  },

  positionText: {
    fontSize: 14,
    fontWeight: '700',
  },

  studentCard: {
    padding: 24,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    marginBottom: 30,
  },

  studentName: {
    fontSize: 25,
    fontWeight: '800',
    textAlign: 'center',
  },

  phoneNumber: {
    fontSize: 18,
    marginTop: 8,
    opacity: 0.6,
  },

  statusLabel: {
    textAlign: 'center',
    fontSize: 16,
    opacity: 0.6,
  },

  countdown: {
    fontSize: 84,
    fontWeight: '900',
    textAlign: 'center',
    marginVertical: 12,
    color: '#ffffff',
  },

  pausedText: {
    fontSize: 40,
    fontWeight: '800',
    textAlign: 'center',
    marginVertical: 20,
  },

  controls: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },

  pauseButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#F59E0B',
    alignItems: 'center',
  },

  resumeButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#16A34A',
    alignItems: 'center',
  },

  skipButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#6B7280',
    alignItems: 'center',
  },

  controlText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },

  stopButton: {
    marginTop: 18,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#DC2626',
    alignItems: 'center',
  },

  stopButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },

  callingContainer: {
    alignItems: 'center',
    marginTop: 20,
  },

  callingIcon: {
    fontSize: 55,
    marginBottom: 12,
  },

  callingText: {
    fontSize: 24,
    fontWeight: '800',
  },

  callState: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 10,
  },

  infoText: {
    fontSize: 14,
    opacity: 0.6,
    marginTop: 15,
    textAlign: 'center',
  },

  title: {
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
  },

  subtitle: {
    fontSize: 16,
    opacity: 0.6,
    textAlign: 'center',
    marginTop: 10,
  },
});