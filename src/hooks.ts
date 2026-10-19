import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from "react";
import { checkHealth } from "./api";

/**
 * Modal dialog behaviour: locks page scroll, focuses `initialFocus`, closes on Escape,
 * restores focus on unmount. Spread `onKeyDown` on the dialog element to keep Tab inside it.
 */
export function useDialog(onClose: () => void, initialFocus: RefObject<HTMLElement | null>) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    initialFocus.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [initialFocus]);

  const onKeyDown = useCallback((e: ReactKeyboardEvent) => {
    if (e.key !== "Tab" || !dialogRef.current) return;
    const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])',
    );
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }, []);

  return { dialogRef, onKeyDown };
}

export type ApiStatus = "checking" | "online" | "offline";

const RETRY_MS = 20_000;

/** Pings the backend on load and keeps retrying while it is unreachable (e.g. a sleeping Space). */
export function useApiStatus() {
  const [status, setStatus] = useState<ApiStatus>("checking");
  const timer = useRef<number | undefined>(undefined);

  const probe = useCallback(async () => {
    window.clearTimeout(timer.current);
    const ok = await checkHealth();
    setStatus(ok ? "online" : "offline");
    if (!ok) timer.current = window.setTimeout(probe, RETRY_MS);
  }, []);

  useEffect(() => {
    probe();
    return () => window.clearTimeout(timer.current);
  }, [probe]);

  const markOnline = useCallback(() => {
    window.clearTimeout(timer.current);
    setStatus("online");
  }, []);

  const markOffline = useCallback(() => {
    setStatus("offline");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(probe, RETRY_MS);
  }, [probe]);

  return { status, recheck: probe, markOnline, markOffline };
}

export type ThemePref = "system" | "light" | "dark";

const THEME_KEY = "radretrieval.theme";

function readTheme(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* storage unavailable */
  }
  return "system";
}

export function useTheme() {
  const [theme, setTheme] = useState<ThemePref>(readTheme);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* storage unavailable */
    }
  }, [theme]);

  const cycle = useCallback(() => {
    setTheme((t) => (t === "system" ? "light" : t === "light" ? "dark" : "system"));
  }, []);

  return { theme, cycle };
}

/** Elapsed milliseconds since `start`, ticking while `running`. */
export function useElapsed(start: number | null, running: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(id);
  }, [running, start]);
  return start === null ? 0 : Math.max(0, now - start);
}

export function useCopy(timeoutMs = 1500) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), timeoutMs);
    },
    [timeoutMs],
  );
  return { copied, copy };
}
