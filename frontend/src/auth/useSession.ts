import { useCallback, useEffect, useState } from 'react';
import { fetchSession } from './session';
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
  return { state, failed, retry };
}
