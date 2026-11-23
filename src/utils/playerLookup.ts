import { useEffect, useState } from 'react';
import { auth } from '../firebase.ts';
import { lookupDirectoryInFirestore } from './firestoreSync.ts';

export interface VerifiedPlayerMatch {
  uid?: string;
  handle: string;
  playerCode: string;
  displayName: string;
  isOnline?: boolean;
  lastActiveAt?: string;
}

export interface PlayerLookupState {
  status: 'idle' | 'checking' | 'valid' | 'invalid';
  user?: VerifiedPlayerMatch;
}

export function usePlayerLookup(rawQuery: string, enabled = true): PlayerLookupState {
  const cleanQuery = rawQuery.trim().replace(/^@+/, '');
  const [state, setState] = useState<PlayerLookupState>({ status: 'idle' });

  useEffect(() => {
    if (!enabled || !cleanQuery) {
      setState({ status: 'idle' });
      return;
    }

    let cancelled = false;
    setState((prev) => ({
      status: 'checking',
      user: prev.user,
    }));

    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/users/lookup?q=${encodeURIComponent(cleanQuery)}`
        );
        if (res.ok) {
          const data = (await res.json()) as {
            found?: boolean;
            user?: VerifiedPlayerMatch;
          };
          if (!cancelled && data.found && data.user) {
            setState({ status: 'valid', user: data.user });
            return;
          }
        }

        // Cross-device & cross-publish Firestore directory lookup when signed in
        if (auth.currentUser) {
          try {
            const cloudMatch = await lookupDirectoryInFirestore(cleanQuery);
            if (!cancelled && cloudMatch) {
              fetch('/api/sync/hydrate-player', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(cloudMatch),
              }).catch(() => {});
              setState({
                status: 'valid',
                user: {
                  uid: cloudMatch.uid,
                  handle: cloudMatch.handle,
                  playerCode: cloudMatch.playerCode,
                  displayName: cloudMatch.displayName,
                  isOnline: false,
                },
              });
              return;
            }
          } catch {
            // Fall through to invalid
          }
        }

        if (!cancelled) {
          setState({ status: 'invalid' });
        }
      } catch {
        if (!cancelled) {
          setState({ status: 'invalid' });
        }
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [cleanQuery, enabled]);

  return state;
}
