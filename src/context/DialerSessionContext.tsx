import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    createContext,
    ReactNode,
    useContext,
    useEffect,
    useState,
} from 'react';

const SESSION_STORAGE_KEY = '@caller_app_dialer_session';

export type DialerSessionStatus =
  | 'idle'
  | 'active'
  | 'paused'
  | 'stopped';

export type DialerSessionStats = {
  callsAttempted: number;
  
  interested: number;
  notInterested: number;
  noAnswer: number;
  busy: number;
  callBack: number;
  wrongNumber: number;
  skipped: number;
};

export type DialerSession = {
  status: DialerSessionStatus;
  startedAt?: string;
  stats: DialerSessionStats;
};

const createEmptyStats = (): DialerSessionStats => ({
  callsAttempted: 0,
  interested: 0,
  notInterested: 0,
  noAnswer: 0,
  busy: 0,
  callBack: 0,
  wrongNumber: 0,
  skipped: 0,
});

const createDefaultSession = (): DialerSession => ({
  status: 'idle',
  stats: createEmptyStats(),
});

type CallOutcome =
  | 'interested'
  | 'not_interested'
  | 'no_answer'
  | 'busy'
  | 'call_back'
  | 'wrong_number';

type DialerSessionContextType = {
  session: DialerSession;

  startSession: () => void;
  pauseSession: () => void;
  resumeSession: () => void;
  stopSession: () => void;

  recordCall: (outcome: CallOutcome) => void;
  recordSkip: () => void;

  resetSession: () => void;
};

const DialerSessionContext =
  createContext<DialerSessionContextType | undefined>(
    undefined
  );

export function DialerSessionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [session, setSession] =
    useState<DialerSession>(createDefaultSession());

  const [loaded, setLoaded] = useState(false);

  // --------------------------------------------------
  // LOAD SESSION
  // --------------------------------------------------

  useEffect(() => {
    const loadSession = async () => {
      try {
        const saved = await AsyncStorage.getItem(
          SESSION_STORAGE_KEY
        );

        if (saved) {
          const parsed = JSON.parse(saved);

          setSession({
            status: parsed.status ?? 'idle',
            startedAt: parsed.startedAt,
            stats: {
              ...createEmptyStats(),
              ...(parsed.stats ?? {}),
            },
          });
        }
      } catch (error) {
        console.error(
          'DIALER SESSION LOAD ERROR:',
          error
        );
      } finally {
        setLoaded(true);
      }
    };

    loadSession();
  }, []);

  // --------------------------------------------------
  // SAVE SESSION
  // --------------------------------------------------

  useEffect(() => {
    if (!loaded) {
      return;
    }

    const saveSession = async () => {
      try {
        await AsyncStorage.setItem(
          SESSION_STORAGE_KEY,
          JSON.stringify(session)
        );
      } catch (error) {
        console.error(
          'DIALER SESSION SAVE ERROR:',
          error
        );
      }
    };

    saveSession();
  }, [session, loaded]);

  // --------------------------------------------------
  // START NEW SESSION
  // --------------------------------------------------

  const startSession = () => {
    const newSession: DialerSession = {
      status: 'active',
      startedAt: new Date().toISOString(),
      stats: createEmptyStats(),
    };

    setSession(newSession);

    console.log('DIALER SESSION: Started');
  };

  // --------------------------------------------------
  // PAUSE
  // --------------------------------------------------

  const pauseSession = () => {
    setSession((previous) => {
      if (previous.status !== 'active') {
        return previous;
      }

      return {
        ...previous,
        status: 'paused',
      };
    });

    console.log('DIALER SESSION: Paused');
  };

  // --------------------------------------------------
  // RESUME
  // --------------------------------------------------

  const resumeSession = () => {
    setSession((previous) => {
      if (previous.status !== 'paused') {
        return previous;
      }

      return {
        ...previous,
        status: 'active',
      };
    });

    console.log('DIALER SESSION: Resumed');
  };

  // --------------------------------------------------
  // STOP
  // --------------------------------------------------

  const stopSession = () => {
    setSession((previous) => {
      if (previous.status === 'stopped') {
        return previous;
      }

      return {
        ...previous,
        status: 'stopped',
      };
    });

    console.log('DIALER SESSION: Stopped');
  };

  // --------------------------------------------------
  // RECORD CALL
  // IMPORTANT:
  // This NEVER changes session status.
  // --------------------------------------------------

  const recordCall = (outcome: CallOutcome) => {
    setSession((previous) => {
      const stats = {
        ...previous.stats,

        callsAttempted:
          previous.stats.callsAttempted + 1,
      };

      switch (outcome) {
        case 'interested':
          stats.interested += 1;
          break;

        case 'not_interested':
          stats.notInterested += 1;
          break;

        case 'no_answer':
          stats.noAnswer += 1;
          break;

        case 'busy':
          stats.busy += 1;
          break;

        case 'call_back':
          stats.callBack += 1;
          break;

        case 'wrong_number':
          stats.wrongNumber += 1;
          break;
      }

      return {
        ...previous,

        // VERY IMPORTANT:
        // preserve current status
        status: previous.status,

        stats,
      };
    });

    console.log(
      'DIALER SESSION: Call recorded:',
      outcome
    );
  };

  // --------------------------------------------------
  // RECORD SKIP
  // --------------------------------------------------

  const recordSkip = () => {
    setSession((previous) => ({
      ...previous,

      // Preserve session status.
      status: previous.status,

      stats: {
        ...previous.stats,
        skipped:
          previous.stats.skipped + 1,
      },
    }));

    console.log(
      'DIALER SESSION: Student skipped'
    );
  };

  // --------------------------------------------------
  // RESET
  // --------------------------------------------------

  const resetSession = () => {
    setSession(createDefaultSession());

    console.log('DIALER SESSION: Reset');
  };

  return (
    <DialerSessionContext.Provider
      value={{
        session,

        startSession,
        pauseSession,
        resumeSession,
        stopSession,

        recordCall,
        recordSkip,

        resetSession,
      }}
    >
      {children}
    </DialerSessionContext.Provider>
  );
}

export function useDialerSession() {
  const context = useContext(
    DialerSessionContext
  );

  if (!context) {
    throw new Error(
      'useDialerSession must be used inside DialerSessionProvider'
    );
  }

  return context;
}