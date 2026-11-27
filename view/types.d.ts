/** The subset of `browser.tabs.Tab` the view relies on, with defaults applied. */
interface TabInfo {
  id: number;
  windowId: number;
  index: number;
  groupId: number;
  url: string;
  title: string;
  favIconUrl?: string;
  active: boolean;
  discarded: boolean;
  lastAccessed: number;
  incognito: boolean;
  createdAt?: number;
}

interface TabGroupInfo {
  id: number;
  windowId: number;
  title?: string;
  color: string;
}

interface TabData {
  tabs: TabInfo[];
  /** Other windows with the same privacy as the current one, and their tabs. */
  mergeable: { windows: number; tabs: number; groups: number };
  /** All normal windows, in window-list order. */
  layout: LayoutWindow[];
  /** Window ID to position in the window list. */
  windowOrder: Map<number, number>;
  currentWindowId: number;
  tabGroups: Map<number, TabGroupInfo>;
  /** Number of tabs per `duplicateKey()`. */
  urlCounts: Map<string, number>;
}

interface BucketInfo {
  key: string | number;
  label: string;
  /** Buckets sort by this first; without it, largest first. */
  order?: number;
  color?: string;
  /** Set for the window showing the view. */
  current?: boolean;
  /** Set if all tabs share this domain. */
  domain?: string;
  /** Set if the bucket collects tabs of unrelated domains. */
  mixed?: boolean;
}

interface Section extends BucketInfo {
  tabs: TabInfo[];
}

interface Bucket extends Section {
  id: string;
  /** Subdivision of `tabs`, in the same order. */
  sections?: Section[];
}

type TabComparator = (a: TabInfo, b: TabInfo) => number;

interface LayoutTab {
  id: number;
  pinned: boolean;
  groupId: number;
}

interface LayoutWindow {
  id: number;
  incognito: boolean;
  geometry: {
    state?: browser.windows.WindowState;
    left?: number;
    top?: number;
    width?: number;
    height?: number;
  };
  /** In tab order. */
  tabs: LayoutTab[];
}

type MergeStep =
  | { type: "moveTabs"; tabIds: number[]; index: number }
  | { type: "moveGroup"; groupId: number }
  | { type: "group"; tabIds: number[]; title: string; color: string };

interface MergePlan {
  steps: MergeStep[];
  /** Windows merged into the target. */
  windowCount: number;
  /** Tabs moved into the target. */
  tabCount: number;
  /** Tab groups moved or created from the merged windows. */
  groupCount: number;
}

/** Tabs to mirror into a tab group, or to keep ungrouped without a title. */
interface MirrorPart {
  tabIds: number[];
  title?: string;
  /** A `browser.tabGroups.Color`; picked in turn if unset. */
  color?: string;
}

interface MirrorPlan {
  steps: MergeStep[];
  /** Tabs moved into the target. */
  tabCount: number;
  /** Tab groups created. */
  groupCount: number;
}

interface SavedGroup {
  id: number;
  title?: string;
  color: string;
  collapsed: boolean;
}

interface LayoutSnapshot {
  targetWindowId: number;
  windows: LayoutWindow[];
  groups: SavedGroup[];
}

type WindowCreateData = Pick<
  browser.windows._CreateCreateData,
  "incognito" | "state" | "left" | "top" | "width" | "height"
>;

interface RestoreWindow {
  /** Set if the window still exists; otherwise it is recreated. */
  windowId?: number;
  createData: WindowCreateData;
  pinnedTabIds: number[];
  unpinnedTabIds: number[];
  groups: {
    tabIds: number[];
    title?: string;
    color: string;
    collapsed: boolean;
  }[];
}
