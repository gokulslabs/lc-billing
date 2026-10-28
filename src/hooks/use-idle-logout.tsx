import { useEffect, useRef, useState } from "react";
import { clearActivity, idlePhase, readLastActivity, recordActivity } from "@/lib/idle";
import { unsavedWork, watchUnsaved } from "@/lib/unsaved";

const ACTIVITY = ["pointerdown", "keydown", "touchstart"] as const;

export function useIdleLogout(enabled: boolean, onExpire: () => void) {
  const expireRef = useRef(onExpire);
  expireRef.current = onExpire;
  const last = useRef(0);
  const warningRef = useRef(false);
  const [warning, setWarning] = useState(false);
  const [unsaved, setUnsaved] = useState(false);

  function stay() {
    const now = Date.now();
    last.current = now;
    recordActivity(now);
    warningRef.current = false;
    setWarning(false);
  }

  useEffect(() => {
    if (!enabled) return;
    last.current = readLastActivity();
    const mark = () => {
      const now = Date.now();
      last.current = now;
      recordActivity(now);
      if (warningRef.current) {
        warningRef.current = false;
        setWarning(false);
      }
    };
    for (const event of ACTIVITY) window.addEventListener(event, mark, true);
    const timer = window.setInterval(() => {
      const phase = idlePhase(Date.now() - last.current);
      if (phase === "expired") {
        window.clearInterval(timer);
        clearActivity();
        void expireRef.current();
        return;
      }
      const show = phase === "warning";
      if (warningRef.current !== show) {
        warningRef.current = show;
        setWarning(show);
      }
      if (show) setUnsaved(unsavedWork());
    }, 1000);
    const stop = watchUnsaved(() => {
      if (warningRef.current) setUnsaved(unsavedWork());
    });
    return () => {
      for (const event of ACTIVITY) window.removeEventListener(event, mark, true);
      window.clearInterval(timer);
      stop();
    };
  }, [enabled]);

  return { warning, unsaved, stay };
}
