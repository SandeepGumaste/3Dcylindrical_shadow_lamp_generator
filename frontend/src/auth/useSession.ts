import { useCallback, useEffect, useState } from 'react';
import { fetchSession } from './session';
import { UNAUTHORIZED_EVENT } from '../api/unauthorized';
import type { SessionState } from './types';

export function useSession(): { state: SessionState; failed: boolean; retry: () => void } {
  const [state, setState] = useState<SessionState>({ status: 'loading' });
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setFailed(false);
    setState({ status: 'loading' });
    fetchSession().then(
      (s) => live && setState(s),
      () => live && setFailed(true),
    );
    return () => { live = false; };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  // A generate call that came back 401 means the session ended: re-check, which shows the sign-in screen.
  useEffect(() => {
    window.addEventListener(UNAUTHORIZED_EVENT, retry);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, retry);
  }, [retry]);
  return { state, failed, retry };
}
