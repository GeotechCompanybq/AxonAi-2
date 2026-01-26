// Sidebar navigation state persistence

export type NavItem = {
  href: string;
  label: string;
  icon: string; // icon name for serialization
  pinned?: boolean;
  order?: number;
};

export type SidebarState = {
  items: NavItem[];
  recentItems: string[]; // hrefs in order of access
  expandedMenus: string[]; // hrefs of expanded parent items
};

const STORAGE_KEY = "axon_sidebar_state";

export function getSidebarState(): SidebarState {
  if (typeof window === "undefined") {
    return { items: [], recentItems: [], expandedMenus: [] };
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {}
  return { items: [], recentItems: [], expandedMenus: [] };
}

export function saveSidebarState(state: SidebarState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

export function trackRecentItem(href: string): void {
  const state = getSidebarState();
  // Remove if already exists, then add to front
  state.recentItems = state.recentItems.filter((h) => h !== href);
  state.recentItems.unshift(href);
  // Keep only last 10
  state.recentItems = state.recentItems.slice(0, 10);
  saveSidebarState(state);
}

export function toggleMenuExpanded(href: string): void {
  const state = getSidebarState();
  const index = state.expandedMenus.indexOf(href);
  if (index >= 0) {
    state.expandedMenus.splice(index, 1);
  } else {
    state.expandedMenus.push(href);
  }
  saveSidebarState(state);
}

export function isMenuExpanded(href: string): boolean {
  const state = getSidebarState();
  return state.expandedMenus.includes(href);
}

export function toggleItemPinned(href: string): void {
  const state = getSidebarState();
  const item = state.items.find((i) => i.href === href);
  if (item) {
    item.pinned = !item.pinned;
  } else {
    state.items.push({ href, label: "", icon: "", pinned: true });
  }
  saveSidebarState(state);
}

export function isItemPinned(href: string): boolean {
  const state = getSidebarState();
  return state.items.find((i) => i.href === href)?.pinned === true;
}

export function getMostRecentItem(): string | null {
  const state = getSidebarState();
  return state.recentItems[0] || null;
}

