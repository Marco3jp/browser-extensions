import type { Env } from "./types";
import { getHostSlotsFor, removeHostSlot, touchHostSlot } from "./storage";

export interface PickContext {
  setId: string;
  env: Env;
}

export async function pickHostSlotValue(ctx: PickContext): Promise<string | null> {
  const dialog = document.createElement("dialog");
  dialog.className = "host-slot-dialog";
  dialog.innerHTML = `
    <form method="dialog">
      <div class="hs-title"></div>
      <div class="hs-template"></div>
      <div class="hs-list"></div>
      <div class="hs-input-row">
        <input type="text" class="hs-input" autocomplete="off" />
        <button type="button" class="hs-submit">開く</button>
      </div>
      <div class="hs-actions">
        <button type="button" class="hs-cancel">キャンセル</button>
      </div>
    </form>
  `;
  document.body.append(dialog);

  const title = dialog.querySelector(".hs-title") as HTMLDivElement;
  const tmpl = dialog.querySelector(".hs-template") as HTMLDivElement;
  const listEl = dialog.querySelector(".hs-list") as HTMLDivElement;
  const input = dialog.querySelector(".hs-input") as HTMLInputElement;
  const submitBtn = dialog.querySelector(".hs-submit") as HTMLButtonElement;
  const cancelBtn = dialog.querySelector(".hs-cancel") as HTMLButtonElement;

  title.textContent = `${ctx.env.label || ctx.env.key} に切り替え`;
  tmpl.textContent = ctx.env.hostTemplate;

  let resolved = false;
  let resolver!: (v: string | null) => void;
  const promise = new Promise<string | null>(res => { resolver = res; });

  function close(value: string | null): void {
    if (resolved) return;
    resolved = true;
    dialog.close();
    dialog.remove();
    resolver(value);
  }

  async function renderSlots(): Promise<void> {
    const slots = await getHostSlotsFor(ctx.setId, ctx.env.key);
    listEl.innerHTML = "";
    if (slots.length === 0) {
      const empty = document.createElement("div");
      empty.className = "hs-empty";
      empty.textContent = "保存済みの値はまだ無いわ";
      listEl.append(empty);
      return;
    }
    for (const slot of slots) {
      const row = document.createElement("div");
      row.className = "hs-row";
      const open = document.createElement("button");
      open.type = "button";
      open.className = "hs-open";
      open.textContent = slot.value;
      open.addEventListener("click", () => close(slot.value));
      const del = document.createElement("button");
      del.type = "button";
      del.className = "hs-del";
      del.title = "削除";
      del.textContent = "×";
      del.addEventListener("click", async () => {
        await removeHostSlot(ctx.setId, ctx.env.key, slot.value);
        await renderSlots();
      });
      row.append(open, del);
      listEl.append(row);
    }
  }

  submitBtn.addEventListener("click", () => {
    const v = input.value.trim();
    if (!v) {
      input.focus();
      return;
    }
    close(v);
  });
  input.addEventListener("keydown", ev => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      submitBtn.click();
    }
  });
  cancelBtn.addEventListener("click", () => close(null));
  dialog.addEventListener("cancel", ev => { ev.preventDefault(); close(null); });

  await renderSlots();
  dialog.showModal();
  input.focus();

  const value = await promise;
  if (value) await touchHostSlot(ctx.setId, ctx.env.key, value);
  return value;
}
