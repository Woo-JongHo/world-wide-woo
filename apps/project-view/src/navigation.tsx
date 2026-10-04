import      { useCallback, useEffect, useState } from "react" ;
import type { MouseEvent, ReactNode            } from "react" ;

type HistoryState = { scrollY: number; scrollPositions: Record<string, number> } | null;
type NavigationOptions = { replace?: boolean; preserveScroll?: boolean; trigger?: HTMLElement | null };

let latestNavigationTrigger: HTMLElement | null = null  ;
let dispatchingNavigation                       = false ;

export function navigationTrigger() {
  return latestNavigationTrigger;
}

function scrollPositions() {
  return Object.fromEntries([...document.querySelectorAll<HTMLElement>("[data-history-scroll]")].map((element) => [element.dataset.historyScroll ?? "", element.scrollTop]).filter(([key]) => key));
}

function readHistoryState(value: unknown): HistoryState {
  if (!value || typeof value !== "object") return null;
  const scrollY   = "scrollY" in value && typeof value.scrollY === "number" ? value.scrollY : 0                                                   ;
  const source    = "scrollPositions" in value && value.scrollPositions && typeof value.scrollPositions === "object" ? value.scrollPositions : {} ;
  const positions = Object.fromEntries(Object.entries(source).filter((entry): entry is [string, number] => typeof entry[1] === "number"))         ;
  return { scrollY, scrollPositions: positions };
}

function restoreScroll(state: HistoryState) {
  window.scrollTo({ top: state?.scrollY ?? 0, behavior: "instant" });
  for (const [key, top] of Object.entries(state?.scrollPositions ?? {})) {
    const element = document.querySelector<HTMLElement>(`[data-history-scroll="${CSS.escape(key)}"]`);
    element?.scrollTo({ top, behavior: "instant" });
  }
}

export function navigateTo(href: string, options: NavigationOptions = {}) {
  const currentScroll = window.scrollY                                   ;
  history.replaceState({ scrollY: currentScroll, scrollPositions: scrollPositions() }, "", window.location.href);

  const nextScroll = options.preserveScroll ? currentScroll : 0 ;
  const nextState  = { scrollY: nextScroll }                    ;
  if (options.replace) history.replaceState(nextState, "", href);
  else history.pushState(nextState, "", href);

  latestNavigationTrigger = options.trigger ?? null;
  dispatchingNavigation = true;
  try { window.dispatchEvent(new PopStateEvent("popstate", { state: nextState })); }
  finally { dispatchingNavigation = false; }
}

export function useLocationState() {
  const [locationKey, setLocationKey] = useState(() => `${window.location.pathname}${window.location.search}`);
  useEffect(() => {
    const onPop = (event: PopStateEvent) => {
      if (!dispatchingNavigation) latestNavigationTrigger = null;
      setLocationKey(`${window.location.pathname}${window.location.search}`);
      const state = readHistoryState(event.state);
      requestAnimationFrame(() => restoreScroll(state));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const navigate = useCallback((href: string, replace = false) => {
    navigateTo(href, { replace });
  }, []);
  return { locationKey, pathname: window.location.pathname, params: new URLSearchParams(window.location.search), navigate };
}

export function AppLink({ href, children, className, ariaLabel, ariaCurrent, onNavigate, preserveScroll = false }: { href: string; children: ReactNode; className?: string; ariaLabel?: string; ariaCurrent?: "page"; onNavigate?: () => void; preserveScroll?: boolean }) {
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigateTo(href, { preserveScroll, trigger: event.currentTarget });
    onNavigate?.();
  };
  return <a href={href} className={className} aria-label={ariaLabel} aria-current={ariaCurrent} onClick={onClick}>{children}</a>;
}

export const pathForRef = (table: string, id: string) => `/projects/www/database?table=${encodeURIComponent(table)}&row=${encodeURIComponent(id)}`;
