import type { EnvironmentSet, HostSlot, TemplateUrl } from "./types";

const KEY_SETS = "environmentSets";
const KEY_TEMPLATES = "templateUrls";
const KEY_HOST_SLOTS = "hostSlots";

export const HOST_SLOT_TTL_MS = 72 * 60 * 60 * 1000;

export async function getEnvironmentSets(): Promise<EnvironmentSet[]> {
  const r = await chrome.storage.local.get(KEY_SETS);
  return (r[KEY_SETS] as EnvironmentSet[] | undefined) ?? [];
}

export async function setEnvironmentSets(sets: EnvironmentSet[]): Promise<void> {
  await chrome.storage.local.set({ [KEY_SETS]: sets });
}

export async function getTemplateUrls(): Promise<TemplateUrl[]> {
  const r = await chrome.storage.local.get(KEY_TEMPLATES);
  return (r[KEY_TEMPLATES] as TemplateUrl[] | undefined) ?? [];
}

export async function setTemplateUrls(items: TemplateUrl[]): Promise<void> {
  await chrome.storage.local.set({ [KEY_TEMPLATES]: items });
}

async function readHostSlotsRaw(): Promise<HostSlot[]> {
  const r = await chrome.storage.local.get(KEY_HOST_SLOTS);
  return (r[KEY_HOST_SLOTS] as HostSlot[] | undefined) ?? [];
}

async function writeHostSlots(slots: HostSlot[]): Promise<void> {
  await chrome.storage.local.set({ [KEY_HOST_SLOTS]: slots });
}

export async function getHostSlots(): Promise<HostSlot[]> {
  const slots = await readHostSlotsRaw();
  const now = Date.now();
  const alive = slots.filter(s => now - s.lastUsedAt < HOST_SLOT_TTL_MS);
  if (alive.length !== slots.length) await writeHostSlots(alive);
  return alive;
}

export async function getHostSlotsFor(setId: string, envKey: string): Promise<HostSlot[]> {
  const slots = await getHostSlots();
  return slots
    .filter(s => s.setId === setId && s.envKey === envKey)
    .sort((a, b) => b.lastUsedAt - a.lastUsedAt);
}

export async function touchHostSlot(setId: string, envKey: string, value: string): Promise<void> {
  if (!value) return;
  const slots = await readHostSlotsRaw();
  const now = Date.now();
  const idx = slots.findIndex(s => s.setId === setId && s.envKey === envKey && s.value === value);
  if (idx >= 0) {
    slots[idx].lastUsedAt = now;
  } else {
    slots.push({ setId, envKey, value, lastUsedAt: now });
  }
  const alive = slots.filter(s => now - s.lastUsedAt < HOST_SLOT_TTL_MS);
  await writeHostSlots(alive);
}

export async function removeHostSlot(setId: string, envKey: string, value: string): Promise<void> {
  const slots = await readHostSlotsRaw();
  const next = slots.filter(s => !(s.setId === setId && s.envKey === envKey && s.value === value));
  if (next.length !== slots.length) await writeHostSlots(next);
}

export function onEnvironmentSetsChanged(cb: (sets: EnvironmentSet[]) => void): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[KEY_SETS]) cb((changes[KEY_SETS].newValue as EnvironmentSet[]) ?? []);
  });
}
