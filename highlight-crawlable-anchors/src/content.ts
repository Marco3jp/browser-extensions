const STYLE_ID = "hca-styles";
const ATTR = "data-hca-status";

type BlockReason =
  | "rel=nofollow"
  | "rel=ugc"
  | "rel=sponsored"
  | "meta-robots:nofollow"
  | "robots.txt:Disallow"
  | "no-href";

interface AnchorStatus {
  crawlable: boolean;
  reasons: BlockReason[];
}

type PageIndexReason = "meta-robots:noindex" | "robots.txt:Disallow";

export interface PageIndexStatus {
  indexable: boolean;
  reasons: PageIndexReason[];
}

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    [${ATTR}="crawlable"] {
      outline: 2px solid #22c55e !important;
      background-color: rgba(34, 197, 94, 0.12) !important;
    }
    [${ATTR}="blocked"] {
      outline: 2px solid #ef4444 !important;
      background-color: rgba(239, 68, 68, 0.12) !important;
    }
    .hca-tooltip {
      position: fixed;
      background: #0f172a;
      color: #e2e8f0;
      padding: 8px 12px;
      border-radius: 8px;
      font-size: 12px;
      font-family: system-ui, sans-serif;
      line-height: 1.6;
      z-index: 2147483647;
      pointer-events: none;
      max-width: 340px;
      white-space: pre;
      box-shadow: 0 4px 16px rgba(0,0,0,0.4);
      border: 1px solid #1e293b;
    }
  `;
  document.head.appendChild(style);
}

function removeStyles(): void {
  document.getElementById(STYLE_ID)?.remove();
}

function getPageMetaRobots(): string {
  const general = document
    .querySelector('meta[name="robots"]')
    ?.getAttribute("content")
    ?.toLowerCase() ?? "";
  const googlebot = document
    .querySelector('meta[name="googlebot"]')
    ?.getAttribute("content")
    ?.toLowerCase() ?? "";
  return `${general} ${googlebot}`;
}

function parseRobotsTxt(text: string): { disallowed: string[]; allowed: string[] } {
  const disallowed: string[] = [];
  const allowed: string[] = [];
  let inApplicableBlock = false;

  for (const rawLine of text.split("\n")) {
    const line = rawLine.split("#")[0].trim();
    if (line === "") {
      inApplicableBlock = false;
      continue;
    }

    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim().toLowerCase();
    const value = line.slice(colonIdx + 1).trim();

    if (key === "user-agent") {
      if (value === "*" || value.toLowerCase() === "googlebot") {
        inApplicableBlock = true;
      }
    } else if (inApplicableBlock) {
      if (key === "disallow" && value) {
        disallowed.push(value);
      } else if (key === "allow" && value) {
        allowed.push(value);
      }
    }
  }

  return { disallowed, allowed };
}

function isPathDisallowedByRobots(
  pathname: string,
  disallowed: string[],
  allowed: string[]
): boolean {
  let bestDisallow = "";
  let bestAllow = "";

  for (const path of disallowed) {
    if (pathname.startsWith(path) && path.length > bestDisallow.length) {
      bestDisallow = path;
    }
  }
  for (const path of allowed) {
    if (pathname.startsWith(path) && path.length > bestAllow.length) {
      bestAllow = path;
    }
  }

  if (!bestDisallow) return false;
  return bestAllow.length <= bestDisallow.length;
}

function checkAnchor(
  anchor: HTMLAnchorElement,
  metaRobots: string,
  robotsRules: { disallowed: string[]; allowed: string[] }
): AnchorStatus {
  const href = anchor.getAttribute("href");
  const reasons: BlockReason[] = [];

  if (
    !href ||
    href === "#" ||
    href.startsWith("javascript:") ||
    href.startsWith("mailto:") ||
    href.startsWith("tel:")
  ) {
    return { crawlable: false, reasons: ["no-href"] };
  }

  const relValues = (anchor.getAttribute("rel") ?? "")
    .toLowerCase()
    .split(/[\s,]+/)
    .filter(Boolean);

  if (relValues.includes("nofollow")) reasons.push("rel=nofollow");
  if (relValues.includes("ugc")) reasons.push("rel=ugc");
  if (relValues.includes("sponsored")) reasons.push("rel=sponsored");

  if (metaRobots.includes("nofollow") || metaRobots.includes("none")) {
    reasons.push("meta-robots:nofollow");
  }

  try {
    const url = new URL(href, window.location.href);
    if (url.origin === window.location.origin) {
      if (
        isPathDisallowedByRobots(
          url.pathname,
          robotsRules.disallowed,
          robotsRules.allowed
        )
      ) {
        reasons.push("robots.txt:Disallow");
      }
    }
  } catch {
    // 無効なURL
  }

  return { crawlable: reasons.length === 0, reasons };
}

let cachedRobotsRules: { disallowed: string[]; allowed: string[] } | null = null;

async function fetchRobotsRules(): Promise<{ disallowed: string[]; allowed: string[] }> {
  if (cachedRobotsRules) return cachedRobotsRules;
  try {
    const res = await fetch(`${window.location.origin}/robots.txt`, {
      cache: "no-store",
    });
    if (res.ok) {
      cachedRobotsRules = parseRobotsTxt(await res.text());
      return cachedRobotsRules;
    }
  } catch {
    // robots.txt 取得不可
  }
  cachedRobotsRules = { disallowed: [], allowed: [] };
  return cachedRobotsRules;
}

async function getPageIndexStatus(): Promise<PageIndexStatus> {
  const metaRobots = getPageMetaRobots();
  const reasons: PageIndexReason[] = [];

  if (metaRobots.includes("noindex") || metaRobots.includes("none")) {
    reasons.push("meta-robots:noindex");
  }

  const robotsRules = await fetchRobotsRules();
  if (
    isPathDisallowedByRobots(
      window.location.pathname,
      robotsRules.disallowed,
      robotsRules.allowed
    )
  ) {
    reasons.push("robots.txt:Disallow");
  }

  return { indexable: reasons.length === 0, reasons };
}

let tooltipEl: HTMLDivElement | null = null;

function showTooltip(e: MouseEvent, anchor: HTMLAnchorElement, status: AnchorStatus): void {
  if (!tooltipEl) {
    tooltipEl = document.createElement("div");
    tooltipEl.className = "hca-tooltip";
    document.body.appendChild(tooltipEl);
  }

  const header = status.crawlable ? "✅ クロール可能" : "🚫 クロール不可";
  const url = (() => {
    try {
      return new URL(anchor.getAttribute("href") ?? "", window.location.href).href;
    } catch {
      return anchor.getAttribute("href") ?? "";
    }
  })();

  const lines = [
    header,
    url.length > 60 ? url.slice(0, 57) + "..." : url,
    ...(status.reasons.includes("no-href")
      ? []
      : status.reasons.map((r) => `  ・${r}`)),
  ];

  tooltipEl.textContent = lines.join("\n");

  const x = Math.min(e.clientX + 12, window.innerWidth - 360);
  const y = Math.min(e.clientY + 12, window.innerHeight - 120);
  tooltipEl.style.left = `${x}px`;
  tooltipEl.style.top = `${y}px`;
}

function hideTooltip(): void {
  tooltipEl?.remove();
  tooltipEl = null;
}

const anchorHandlers = new WeakMap<
  HTMLAnchorElement,
  { enter: (e: MouseEvent) => void; leave: () => void }
>();

async function highlight(): Promise<void> {
  injectStyles();

  const metaRobots = getPageMetaRobots();
  const robotsRules = await fetchRobotsRules();

  const anchors = document.querySelectorAll<HTMLAnchorElement>("a");

  anchors.forEach((anchor) => {
    const status = checkAnchor(anchor, metaRobots, robotsRules);

    if (status.reasons.includes("no-href")) return;

    anchor.setAttribute(ATTR, status.crawlable ? "crawlable" : "blocked");

    const enterHandler = (e: MouseEvent) => showTooltip(e, anchor, status);
    const leaveHandler = () => hideTooltip();

    anchorHandlers.set(anchor, { enter: enterHandler, leave: leaveHandler });
    anchor.addEventListener("mouseenter", enterHandler);
    anchor.addEventListener("mouseleave", leaveHandler);
  });
}

function clearHighlights(): void {
  document.querySelectorAll<HTMLAnchorElement>(`[${ATTR}]`).forEach((el) => {
    el.removeAttribute(ATTR);
    const handlers = anchorHandlers.get(el);
    if (handlers) {
      el.removeEventListener("mouseenter", handlers.enter);
      el.removeEventListener("mouseleave", handlers.leave);
      anchorHandlers.delete(el);
    }
  });
  removeStyles();
  hideTooltip();
}

chrome.runtime.onMessage.addListener(
  (
    message: { type: string },
    _sender,
    sendResponse: (res: PageIndexStatus) => void
  ) => {
    if (message.type === "HCA_ON") {
      highlight();
    } else if (message.type === "HCA_OFF") {
      clearHighlights();
    } else if (message.type === "HCA_GET_PAGE_STATUS") {
      getPageIndexStatus().then(sendResponse);
      return true;
    }
  }
);
