/** Acknowledgement never determines whether the native call happened. */
export async function acknowledgeCallStarted(
  send: () => Promise<void>, active: () => boolean,
  wait: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms)),
): Promise<void> {
  for (const delay of [0, 500, 1500, 3000]) {
    if (delay) await wait(delay);
    if (!active()) return;
    try { await send(); return; }
    catch (error) {
      const status = (error as { status?: number })?.status;
      console.warn('DIALER: call-started acknowledgement failed; preserving native call lifecycle', status ?? 'network');
      if (status && status < 500 && status !== 408 && status !== 429) return;
    }
  }
}
