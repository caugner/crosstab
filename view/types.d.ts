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
