import React from 'react';
import { studioHost } from './host';

/** UI diagnostics are opt-in and independent of full agent logging. No desktop host means off. */
export function useDebugMode(): boolean {
  const [debug, setDebug] = React.useState(false);
  React.useEffect(() => {
    const developer = studioHost?.developer;
    if (!developer) return;
    let live = true, changed = false;
    const stop = developer.onChange((prefs) => { changed = true; if (live) setDebug(prefs.debug === true); });
    void developer.get().then((prefs) => { if (live && !changed) setDebug(prefs.debug === true); }).catch(() => {});
    return () => { live = false; stop(); };
  }, []);
  return debug;
}
