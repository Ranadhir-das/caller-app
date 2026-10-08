import { AUTO_CALL_RECORDING_ENABLED } from '@/services/recordingPolicy';
import { acknowledgeCallStarted } from '@/services/callLifecycle';
import { useAppStyles, type AppColors } from '@/context/AppThemeContext';
import { useDialerSession } from '@/context/DialerSessionContext';
import { useLeads } from '@/context/LeadContext';
import { useAuth } from '@/context/AuthContext';
import { newCallId, saveCallDraft, patchCallDraft } from '@/services/callDrafts';
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
  const params = useLocalSearchParams<{ id?: string; direct?: string; phone_number?: string; isClaimed?: string }>();
  const { leads } = useLeads();
  const { user } = useAuth();
  const targetId = params.id || (params.direct === '1' ? params.phone_number : leads.find(lead => lead.status === 'pending')?.id);
  return <ActiveDialer key={`${user?.id}:${params.direct}:${targetId}`} />;
}

function ActiveDialer() {
  const styles = useAppStyles(createStyles);
  const { leads, releaseClaim, markCallStarted } = useLeads();
  const { user } = useAuth();

  const {
    pauseSession,
    resumeSession,
    stopSession,
    recordSkip,
  } = useDialerSession();

  const params = useLocalSearchParams<{
    id?: string;
    direct?: string;
    phone_number?: string;
    name?: string;
    isClaimed?: string;
  }>();

  // --------------------------------------------------
  // CURRENT STUDENT
  // --------------------------------------------------

  const direct = params.direct === '1';
  // Display target only; external numbers never create a Lead.
  const currentLead = direct
    ? (params.phone_number ? { id: params.id || '', name: params.name || params.phone_number, phone: params.phone_number } : undefined)
    : leads.find((lead) => lead.id === params.id) ?? leads.find((lead) => lead.status === 'pending');

  const isClaimedWebsiteLead = params.isClaimed === '1' || Boolean(currentLead && 'isClaimed' in currentLead && currentLead.isClaimed);

  // --------------------------------------------------
  // LOCAL STATE
  // --------------------------------------------------

  const [countdown, setCountdown] = useState(3);
  const [isPaused, setIsPaused] = useState(false);
  const [callStarted, setCallStarted] = useState(false);
  const [callRequested, setCallRequested] = useState(false);
  const [callState, setCallState] =
    useState<CallState>('IDLE');

  // --------------------------------------------------
  // REFS
  // --------------------------------------------------

  const countdownRef =
    useRef<ReturnType<typeof setInterval> | null>(null);

  type CallAttemptState =
    | 'IDLE'
    | 'DIALING'
    | 'CONNECTED'
    | 'DISCONNECTED'
    | 'CANCELLED';

  const callAttemptIdRef = useRef(0);
  const callAttemptStateRef = useRef<CallAttemptState>('IDLE');
  const hasSeenOffhookRef = useRef(false);
  const outcomeAlreadyOpenedRef = useRef(false);
  const pendingIdleRef = useRef(false);

  const callWasStartedRef =
    useRef(false);

  const navigatingRef =
    useRef(false);

  const listenerRef =
    useRef<any>(null);

  const monitoringStartedRef =
    useRef(false);

  const mountedRef = useRef(true);
  const callRequestPendingRef = useRef(false);
  const requestedRef = useRef(false);
  const recordingArmedRef = useRef(false);
  const draftIdRef = useRef(newCallId());
  const claimReleasedRef = useRef(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const acknowledgementStartedRef = useRef(false);

  const markCallConnected = (source = 'event') => {
    if (callEndedAtRef.current || outcomeAlreadyOpenedRef.current) return;
    callAttemptStateRef.current = 'CONNECTED';
    hasSeenOffhookRef.current = true;
    if (!callWasStartedRef.current) navigatingRef.current = false;
    callWasStartedRef.current = true;

    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
      console.log('DIALER: Cancelling pending IDLE grace timer');
    }
    pendingIdleRef.current = false;

    if (!callStartedAtRef.current) {
      callStartedAtRef.current = new Date().toISOString();
      if (user) {
        void patchCallDraft(user.id, draftIdRef.current, { startedAt: callStartedAtRef.current })
          .catch(error => {
            console.error('Call draft:', error);
            Alert.alert('Draft storage error', 'Keep this screen open until the call outcome is saved.');
          });
      }
      console.log('DIALER: Call started at:', callStartedAtRef.current);
      console.log('DIALER: Call start timestamp = ' + callStartedAtRef.current);
    }

    if (isClaimedWebsiteLead && currentLead?.id) {
      if (!acknowledgementStartedRef.current) {
        acknowledgementStartedRef.current = true;
        void acknowledgeCallStarted(
          () => markCallStarted(currentLead.id),
          () => mountedRef.current && callWasStartedRef.current && !callEndedAtRef.current
        );
      }
    }

    setCallStarted(true);
    console.log('DIALER CALL STATE: OFFHOOK');
    console.log(`DIALER: Call connected (${source})`);
  };

  const scheduleUnstartedIdle = (source = 'event') => {
    if (hasSeenOffhookRef.current || callWasStartedRef.current || outcomeAlreadyOpenedRef.current || navigatingRef.current) {
      return;
    }
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    pendingIdleRef.current = true;
    console.log(`DIALER: IDLE received before OFFHOOK; starting grace period (source: ${source})`);

    const attemptId = callAttemptIdRef.current;
    idleTimerRef.current = setTimeout(() => {
      idleTimerRef.current = null;
      if (!mountedRef.current || callWasStartedRef.current || navigatingRef.current || outcomeAlreadyOpenedRef.current || attemptId !== callAttemptIdRef.current) return;

      try {
        const currentState = CallstateModule.getCurrentState();
        if (currentState === 'OFFHOOK') {
          console.log('DIALER: OFFHOOK detected during grace expiration');
          markCallConnected('grace_timer');
          return;
        }
      } catch (err) {
        console.warn('DIALER: Failed to check phone state during grace expiration:', err);
      }

      console.log('DIALER CALL STATE: IDLE');
      console.log('DIALER: No OFFHOOK during grace period');
      console.log('DIALER: Treating call as pre-connect cancellation');
      callAttemptStateRef.current = 'CANCELLED';
      pendingIdleRef.current = false;
      navigatingRef.current = true;
      void CallstateModule.stopRecording().catch(console.warn);

      if (isClaimedWebsiteLead) {
        console.log('DIALER: Releasing temporary claim');
        void releaseTemporaryClaim('Confirmed IDLE without OFFHOOK').then(() => {
          if (mountedRef.current && !callWasStartedRef.current) {
            router.replace('/');
          }
        });
      } else {
        navigatingRef.current = false;
        setCallStarted(false);
        setCallRequested(false);
        requestedRef.current = false;
        setIsPaused(true);
      }
    }, 2500);
  };

  // Timing for the current phone call only.
  const callStartedAtRef =
    useRef<string | null>(null);

  const callEndedAtRef =
    useRef<string | null>(null);

  const callDurationSecondsRef =
    useRef<number>(0);

  const appStateRef =
    useRef(AppState.currentState);

  const releaseTemporaryClaim = async (reason?: string) => {
    if (!isClaimedWebsiteLead || !currentLead?.id || claimReleasedRef.current || callWasStartedRef.current) {
      return;
    }
    claimReleasedRef.current = true;
    console.log(`DIALER: Releasing temporary claim for lead ${currentLead.id} (reason: ${reason || 'unspecified'})`);
    try {
      await releaseClaim(currentLead.id);
    } catch (err) {
      console.warn('DIALER: Failed to release temporary claim:', err);
    }
  };

  // --------------------------------------------------
  // OPEN OUTCOME
  // --------------------------------------------------

  const openCallOutcome = async () => {
    if (!currentLead) {
      return;
    }

    if (outcomeAlreadyOpenedRef.current || navigatingRef.current) {
      console.log('DIALER: Outcome already handled; ignoring duplicate IDLE');
      return;
    }

    outcomeAlreadyOpenedRef.current = true;
    navigatingRef.current = true;
    callAttemptStateRef.current = 'DISCONNECTED';
    let recordingPath: string | undefined;
    if (AUTO_CALL_RECORDING_ENABLED && recordingArmedRef.current) {
      try {
        // Use the existing idempotent stop method and wait for the file to close.
        recordingPath = (await CallstateModule.stopRecording()) || undefined;
        const warning = CallstateModule.getRecordingWarning?.();
        if (warning) {
          console.warn('CALL_RECORDING:', warning);
          if (mountedRef.current) Alert.alert('Recording audio warning', `${warning} Your call outcome can still be saved.`);
        }
      } catch (error) { console.warn('RECORDING_UPLOAD: could not obtain recording path', error); }
    }
    try {
      if (!user) throw new Error('Please sign in to save the call.');
      await patchCallDraft(user.id, draftIdRef.current, {
        startedAt: callStartedAtRef.current || undefined,
        endedAt: callEndedAtRef.current || new Date().toISOString(),
        durationSeconds: callDurationSecondsRef.current,
        recordingPath,
      });
    } catch (error) {
      navigatingRef.current = false;
      outcomeAlreadyOpenedRef.current = false;
      Alert.alert('Call draft could not be saved', String(error), [{ text: 'Retry', onPress: () => { void openCallOutcome(); } }]);
      return;
    }

    console.log(
      'CALL ENDED - OPENING OUTCOME'
    );

    if (!mountedRef.current) return;
    router.replace({
      pathname: '/call-outcome',
      params: {
        id: currentLead.id,
        draft_id: draftIdRef.current,
        started_at: callStartedAtRef.current ?? '',
        ended_at:
          callEndedAtRef.current ??
          new Date().toISOString(),
        duration_seconds: String(
          callDurationSecondsRef.current
        ),
      },
    });
  };

  useEffect(() => {
    mountedRef.current = true;
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

          if (event.state === 'OFFHOOK' && requestedRef.current) {
            if (callEndedAtRef.current || outcomeAlreadyOpenedRef.current) return;
            callAttemptStateRef.current = 'CONNECTED';
            hasSeenOffhookRef.current = true;
            if (!callWasStartedRef.current) navigatingRef.current = false;
            callWasStartedRef.current = true;
            if (idleTimerRef.current) {
              clearTimeout(idleTimerRef.current);
              idleTimerRef.current = null;
              console.log('DIALER: Cancelling pending IDLE grace timer');
            }
            pendingIdleRef.current = false;

            if (!callStartedAtRef.current) {
              callStartedAtRef.current =
                new Date().toISOString();
              if (user) void patchCallDraft(user.id, draftIdRef.current, { startedAt: callStartedAtRef.current })
                .catch(error => { console.error('Call draft:', error); Alert.alert('Draft storage error', 'Keep this screen open until the call outcome is saved.'); });

              console.log(
                'DIALER: Call started at:',
                callStartedAtRef.current
              );
              console.log(
                'DIALER: Call start timestamp = ' + callStartedAtRef.current
              );
            }

            if (isClaimedWebsiteLead && currentLead?.id) {
              if (!acknowledgementStartedRef.current) {
                acknowledgementStartedRef.current = true;
                void acknowledgeCallStarted(() => markCallStarted(currentLead.id),
                  () => mountedRef.current && callWasStartedRef.current && !callEndedAtRef.current);
              }
            }

            setCallStarted(true);

            console.log(
              'DIALER CALL STATE: OFFHOOK'
            );
            console.log(
              'DIALER: Call connected'
            );

            return;
          }

          // ------------------------------------------
          // CALL ENDED / DISCONNECTED
          // ------------------------------------------

          if (event.state === 'IDLE') {
            if (outcomeAlreadyOpenedRef.current) {
              console.log('DIALER: Outcome already handled; ignoring duplicate IDLE');
              return;
            }

            if (isClaimedWebsiteLead && requestedRef.current && !callWasStartedRef.current) {
              scheduleUnstartedIdle();
              return;
            }

            if (
              callWasStartedRef.current &&
              !navigatingRef.current && !callEndedAtRef.current
            ) {
              console.log(
                'DIALER CALL STATE: IDLE'
              );
              console.log(
                'DIALER: Confirmed call disconnect after OFFHOOK'
              );
              console.log(
                'DIALER: Confirmed disconnect after OFFHOOK'
              );

              callEndedAtRef.current =
                new Date().toISOString();
              callAttemptStateRef.current = 'DISCONNECTED';

              if (callStartedAtRef.current) {
                const startedMs =
                  new Date(
                    callStartedAtRef.current
                  ).getTime();

                const endedMs =
                  new Date(
                    callEndedAtRef.current
                  ).getTime();

                callDurationSecondsRef.current =
                  Math.max(
                    0,
                    Math.round(
                      (endedMs - startedMs) / 1000
                    )
                  );
              }

              const durMins = Math.floor(callDurationSecondsRef.current / 60);
              const durSecs = callDurationSecondsRef.current % 60;
              const formattedDuration = `${String(durMins).padStart(2, '0')}:${String(durSecs).padStart(2, '0')}`;

              console.log(
                'DIALER: Call ended at:',
                callEndedAtRef.current
              );

              console.log(
                'DIALER: Call duration:',
                callDurationSecondsRef.current,
                'seconds'
              );
              console.log(
                `DIALER: Call duration = ${formattedDuration}`
              );

              console.log('DIALER: Opening call outcome');
              openCallOutcome();
              return;
            }

            if (requestedRef.current && !callWasStartedRef.current && !navigatingRef.current) {
              scheduleUnstartedIdle();
              return;
            }
          }
        }
      );

    return () => {
      mountedRef.current = false;
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      void CallstateModule.stopRecording().then((path) => {
        console.log('CALL_RECORDING: cleanup path:', path);
        // Unexpected navigation must not orphan a successfully closed recording.
        // Normal outcome navigation already persisted it before replacing this screen.
        if (path && user && recordingArmedRef.current && !navigatingRef.current) {
          return patchCallDraft(user.id, draftIdRef.current, { recordingPath: path });
        }
      }).catch((error) => console.warn('CALL_RECORDING: cleanup error:', error));
      console.log(
        'DIALER: Removing call-state listener'
      );

      if (listenerRef.current) {
        listenerRef.current.remove();
        listenerRef.current = null;
      }

      if (isClaimedWebsiteLead && !callWasStartedRef.current && !claimReleasedRef.current) {
        void releaseTemporaryClaim('Component unmounted before call connection');
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
          // APP RETURNED FROM BACKGROUND
          // ------------------------------------------

          if (
            wasBackground &&
            nextState === 'active'
          ) {
            if (outcomeAlreadyOpenedRef.current) {
              return;
            }

            try {
              const currentState =
                CallstateModule.getCurrentState();

              console.log(
                'DIALER: Current phone state:',
                currentState
              );

              if (currentState === 'OFFHOOK') {
                if (requestedRef.current && !callWasStartedRef.current) {
                  console.log(
                    'DIALER: Returned to app with phone state OFFHOOK; marking call connected'
                  );
                  markCallConnected('appstate');
                } else {
                  console.log(
                    'DIALER: Returned to app while call is still OFFHOOK; continuing to wait for disconnect'
                  );
                }
                return;
              }

              if (currentState === 'IDLE') {
                if (hasSeenOffhookRef.current || callWasStartedRef.current) {
                  console.log(
                    'DIALER: Returned to app after call'
                  );
                  console.log(
                    'DIALER: Phone is idle - opening outcome'
                  );

                  if (!callEndedAtRef.current) {
                    callEndedAtRef.current =
                      new Date().toISOString();
                    callAttemptStateRef.current = 'DISCONNECTED';

                    if (callStartedAtRef.current) {
                      const startedMs =
                        new Date(
                          callStartedAtRef.current
                        ).getTime();

                      const endedMs =
                        new Date(
                          callEndedAtRef.current
                        ).getTime();

                      callDurationSecondsRef.current =
                        Math.max(
                          0,
                          Math.round(
                            (endedMs - startedMs) / 1000
                          )
                        );
                    }
                  }

                  setTimeout(() => {
                    if (!outcomeAlreadyOpenedRef.current && !navigatingRef.current) {
                      console.log('DIALER CALL STATE: IDLE');
                      console.log('DIALER: Confirmed call disconnect after OFFHOOK');
                      console.log('DIALER: Confirmed disconnect after OFFHOOK');
                      const durMins = Math.floor(callDurationSecondsRef.current / 60);
                      const durSecs = callDurationSecondsRef.current % 60;
                      const formattedDuration = `${String(durMins).padStart(2, '0')}:${String(durSecs).padStart(2, '0')}`;
                      console.log(`DIALER: Call duration = ${formattedDuration}`);
                      console.log('DIALER: Opening call outcome');
                      openCallOutcome();
                    }
                  }, 300);
                } else if (
                  requestedRef.current &&
                  !navigatingRef.current
                ) {
                  console.log(
                    'DIALER: Returned to app without call connection, phone state: IDLE'
                  );
                  scheduleUnstartedIdle('appstate');
                }
              }
            } catch (error) {
              console.error(
                'DIALER: Failed to get call state in AppState listener:',
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
    if (callWasStartedRef.current || callRequestPendingRef.current || requestedRef.current) {
      return;
    }

    callRequestPendingRef.current = true;

    const permissionGranted =
      await requestCallPermission();

    if (!mountedRef.current) {
      callRequestPendingRef.current = false;
      return;
    }

    if (!permissionGranted) {
      callRequestPendingRef.current = false;
      Alert.alert(
        'Permission Required',
        'Phone call permission is required to automatically call the student.'
      );

      setIsPaused(true);
      if (isClaimedWebsiteLead) {
        void releaseTemporaryClaim('Phone call permission denied');
      }

      return;
    }

    // Temporarily paused; preserve the native implementation for later re-enabling.
    if (AUTO_CALL_RECORDING_ENABLED) try {
      const audioPermission = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        {
          title: 'Local call recording test',
          message: 'Allow microphone access to test local call recording on this device. Both sides may not be captured.',
          buttonPositive: 'Continue',
          buttonNegative: 'Cancel',
        }
      );
      console.log('CALL_RECORDING: microphone permission:', audioPermission);
      if (mountedRef.current && audioPermission === PermissionsAndroid.RESULTS.GRANTED) {
        const ready = await CallstateModule.prepareRecording();
        recordingArmedRef.current = ready;
        console.log('CALL_RECORDING: foreground service ready:', ready);
      }
    } catch (error) {
      console.warn('CALL_RECORDING: preparation failed; continuing call:', error);
    }

    if (!mountedRef.current) {
      callRequestPendingRef.current = false;
      void CallstateModule.stopRecording().catch(console.warn);
      return;
    }

    console.log(
      'STARTING CALL:',
      currentLead.phone
    );

    callAttemptIdRef.current += 1;
    const currentAttemptId = callAttemptIdRef.current;
    callAttemptStateRef.current = 'DIALING';
    hasSeenOffhookRef.current = false;
    callWasStartedRef.current = false;
    outcomeAlreadyOpenedRef.current = false;
    pendingIdleRef.current = false;
    claimReleasedRef.current = false;
    acknowledgementStartedRef.current = false;
    navigatingRef.current = false;

    // Clear timing from any previous call.
    callStartedAtRef.current = null;
    callEndedAtRef.current = null;
    callDurationSecondsRef.current = 0;

    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }

    console.log('DIALER CALL ATTEMPT: created');
    console.log(`DIALER CALL ATTEMPT: created (${currentAttemptId})`);

    try {
      if (!user) throw new Error('Please sign in before calling.');
      await saveCallDraft({
        id: draftIdRef.current, userId: user.id, phone: currentLead.phone,
        name: currentLead.name, leadId: currentLead.id || undefined, direct,
      });
      if (!mountedRef.current) return;
      // Retry monitoring after the first permission grant.
      CallstateModule.startMonitoring();
      requestedRef.current = true;
      // Do NOT set callWasStartedRef here.
      //
      // It becomes true only when native Android
      // reports OFFHOOK.

      CallstateModule.startCall(
        currentLead.phone
      );
      setCallRequested(true);

      console.log(
        'DIALER: Call request sent'
      );
    } catch (error) {
      console.error(
        'START CALL ERROR:',
        error
      );

      if (callWasStartedRef.current || hasSeenOffhookRef.current) return; // OFFHOOK wins even if native launch reports an error.
      requestedRef.current = false;
      callAttemptStateRef.current = 'CANCELLED';
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
      void CallstateModule.stopRecording().catch(console.warn);

      setCallStarted(false);
      setCallRequested(false);

      if (isClaimedWebsiteLead) {
        void releaseTemporaryClaim('Call launch failed');
      }

      Alert.alert(
        'Call Error',
        'Unable to start the phone call.'
      );

      setIsPaused(true);
    } finally {
      callRequestPendingRef.current = false;
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

    if (!direct) pauseSession();
  };

  // --------------------------------------------------
  // RESUME
  // --------------------------------------------------

  const resumeCountdown = () => {
    setCountdown(3);

    setIsPaused(false);

    if (!direct) resumeSession();
  };

  // --------------------------------------------------
  // SKIP
  // --------------------------------------------------

  const skipStudent = async () => {
    if (!currentLead) {
      return;
    }

    if (countdownRef.current) {
      clearInterval(
        countdownRef.current
      );

      countdownRef.current = null;
    }

    if (isClaimedWebsiteLead) {
      await releaseTemporaryClaim('Caller skipped lead before call');
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
    if (direct) {
      if (isClaimedWebsiteLead) {
        void releaseTemporaryClaim('Caller stopped direct dialer');
      }
      router.replace('/direct-dialer');
      return;
    }
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
          onPress: async () => {
            if (isClaimedWebsiteLead) {
              await releaseTemporaryClaim('Caller stopped dialer before call');
            }
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
        {direct ? 'Direct Dialer' : 'Automatic Dialer'}
      </Text>

      <View style={styles.positionCard}>
        <Text style={styles.positionText}>
          {direct ? (currentLead.id ? 'Assigned lead call' : 'External / Direct call') : `Student ${currentIndex + 1} / ${leads.length}`}
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

      {!callStarted && !callRequested ? (
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

            {!direct && <Pressable
              style={styles.skipButton}
              onPress={skipStudent}
            >
              <Text
                style={styles.controlText}
              >
                Skip
              </Text>
            </Pressable>}
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
          {!callStarted && <Pressable style={styles.stopButton} onPress={() => {
            Alert.alert('Call did not start?', 'If the phone call was cancelled before Android reported OFFHOOK, return to the dialer.', [
              { text: 'Stay', style: 'cancel' },
              {
                text: 'Release & Return',
                onPress: async () => {
                  if (isClaimedWebsiteLead) {
                    await releaseTemporaryClaim('Caller confirmed call did not start');
                    router.replace('/');
                  } else {
                    router.replace('/direct-dialer');
                  }
                },
              },
            ]);
          }}><Text style={styles.stopButtonText}>Call did not start?</Text></Pressable>}
        </View>
      )}
    </View>
  );
}

// --------------------------------------------------
// STYLES
// --------------------------------------------------

const createStyles = (colors: AppColors) => StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },

  header: {
    color: colors.text,
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
    backgroundColor: colors.border,
    marginBottom: 20,
  },

  positionText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },

  studentCard: {
    padding: 24,
    borderRadius: 18,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    marginBottom: 30,
  },

  studentName: {
    color: colors.text,
    fontSize: 25,
    fontWeight: '800',
    textAlign: 'center',
  },

  phoneNumber: {
    color: colors.muted,
    fontSize: 18,
    marginTop: 8,
  },

  statusLabel: {
    color: colors.muted,
    textAlign: 'center',
    fontSize: 16,
  },

  countdown: {
    fontSize: 84,
    fontWeight: '900',
    textAlign: 'center',
    marginVertical: 12,
    color: colors.accent,
  },

  pausedText: {
    color: colors.text,
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
    backgroundColor: '#885500',
    alignItems: 'center',
  },

  resumeButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#187452',
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
    color: colors.onPrimary,
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
    color: colors.onPrimary,
    fontSize: 16,
    fontWeight: '700',
  },

  callingContainer: {
    alignItems: 'center',
    marginTop: 20,
  },

  callingIcon: {
    color: colors.text,
    fontSize: 55,
    marginBottom: 12,
  },

  callingText: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
  },

  callState: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 10,
  },

  infoText: {
    color: colors.muted,
    fontSize: 14,
    marginTop: 15,
    textAlign: 'center',
  },

  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
  },

  subtitle: {
    color: colors.muted,
    fontSize: 16,
    textAlign: 'center',
    marginTop: 10,
  },
});
