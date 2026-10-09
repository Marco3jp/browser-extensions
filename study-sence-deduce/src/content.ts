import { getEnvironmentSets, onEnvironmentSetsChanged } from "./storage";
import { findEnvForUrl } from "./env-match";
import type { EnvironmentSet } from "./types";

const HOST_ID = "ssd-ribbon-host";

function removeRibbon(): void {
  document.getElementById(HOST_ID)?.remove();
}

function renderRibbon(label: string, color: string): void {
  removeRibbon();
  const host = document.createElement("div");
  host.id = HOST_ID;
  host.style.cssText = "all: initial;";
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = `
    .ribbon {
      position: fixed;
      left: -60px;
      bottom: 28px;
      width: 200px;
      text-align: center;
      transform: rotate(45deg);
      transform-origin: center;
      background: ${color};
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 20px;
      font-weight: 700;
      letter-spacing: 0.05em;
      padding: 4px 0;
      box-shadow: 0 1px 4px rgba(0,0,0,0.35);
      text-shadow: 0 1px 0 rgba(0,0,0,0.2);
      user-select: none;
      pointer-events: none;
      z-index: 2147483647;
    }
  `;
  const el = document.createElement("div");
  el.className = "ribbon";
  el.textContent = label;
  shadow.append(style, el);
  (document.body || document.documentElement).append(host);
}

function apply(sets: EnvironmentSet[]): void {
  const m = findEnvForUrl(new URL(location.href), sets);
  if (!m) {
    removeRibbon();
    return;
  }
  renderRibbon(m.env.label || m.env.key, m.env.color || "#888");
}

async function init(): Promise<void> {
  const sets = await getEnvironmentSets();
  apply(sets);
}

onEnvironmentSetsChanged(sets => apply(sets));
void init();
