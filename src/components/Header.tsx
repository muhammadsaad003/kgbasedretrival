import type { ApiStatus, ThemePref } from "../hooks";
import { CodeIcon, LogoMark, MonitorIcon, MoonIcon, SunIcon } from "./icons";

const REPO_URL = "https://github.com/muhammadsaad003/kgbasedretrival";

const STATUS_TEXT: Record<ApiStatus, string> = {
  checking: "Checking API…",
  online: "API online",
  offline: "API unreachable · retrying",
};

const THEME_NEXT: Record<ThemePref, string> = { system: "light", light: "dark", dark: "system" };

interface Props {
  status: ApiStatus;
  onRecheck: () => void;
  theme: ThemePref;
  onCycleTheme: () => void;
}

export function Header({ status, onRecheck, theme, onCycleTheme }: Props) {
  const ThemeIcon = theme === "light" ? SunIcon : theme === "dark" ? MoonIcon : MonitorIcon;
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <a className="brand" href="./" aria-label="RadRetrieval home">
          <LogoMark />
          <span className="brand-text">
            <span className="brand-name">RadRetrieval</span>
            <span className="brand-sub">Knowledge-guided radiology image retrieval</span>
          </span>
        </a>
        <div className="topbar-actions">
          <button
            type="button"
            className={`status-pill status-${status}`}
            onClick={onRecheck}
            title="Click to check the backend again"
          >
            <span className="status-dot" aria-hidden="true" />
            <span className="status-text">{STATUS_TEXT[status]}</span>
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={onCycleTheme}
            aria-label={`Theme: ${theme}. Switch to ${THEME_NEXT[theme]}.`}
            title={`Theme: ${theme}`}
          >
            <ThemeIcon />
          </button>
          <a className="icon-btn" href={REPO_URL} target="_blank" rel="noreferrer" aria-label="Source code" title="Source code">
            <CodeIcon />
          </a>
        </div>
      </div>
    </header>
  );
}
