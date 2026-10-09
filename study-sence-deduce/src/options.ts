import type { Env, EnvironmentSet } from "./types";
import { getEnvironmentSets, setEnvironmentSets } from "./storage";

const root = document.getElementById("root") as HTMLDivElement;
let sets: EnvironmentSet[] = [];

function newId(prefix: string): string {
  return prefix + "_" + crypto.randomUUID().slice(0, 8);
}

function emptyEnv(): Env {
  return { key: "", label: "", color: "#888888", hostPattern: "", hostTemplate: "", downgradeToHttp: false };
}

async function load(): Promise<void> {
  sets = await getEnvironmentSets();
  render();
}

async function save(): Promise<void> {
  await setEnvironmentSets(sets);
}

function render(): void {
  root.innerHTML = "";
  sets.forEach((set, setIdx) => {
    const div = document.createElement("div");
    div.className = "set";

    const head = document.createElement("div");
    head.className = "set-head";
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = set.name;
    nameInput.placeholder = "セット名（例: My App）";
    nameInput.addEventListener("input", () => { set.name = nameInput.value; void save(); });
    const delBtn = document.createElement("button");
    delBtn.textContent = "セット削除";
    delBtn.className = "danger";
    delBtn.addEventListener("click", () => {
      if (!confirm(`「${set.name}」を削除する？`)) return;
      sets.splice(setIdx, 1);
      void save().then(render);
    });
    head.append(nameInput, delBtn);
    div.append(head);

    const table = document.createElement("table");
    table.innerHTML = `
      <thead><tr>
        <th style="width:80px">key</th>
        <th style="width:100px">label</th>
        <th style="width:60px">color</th>
        <th>hostPattern</th>
        <th>hostTemplate</th>
        <th style="width:60px" title="切り替え時に https を http へダウングレードする">http化</th>
        <th style="width:60px"></th>
      </tr></thead>
      <tbody></tbody>
    `;
    const tbody = table.querySelector("tbody")!;
    set.environments.forEach((env, envIdx) => {
      const tr = document.createElement("tr");
      tr.append(
        cell(env.key, v => env.key = v),
        cell(env.label, v => env.label = v),
        colorCell(env.color, v => env.color = v),
        cell(env.hostPattern, v => env.hostPattern = v),
        cell(env.hostTemplate, v => env.hostTemplate = v),
        checkboxCell(!!env.downgradeToHttp, v => env.downgradeToHttp = v),
      );
      const tdDel = document.createElement("td");
      const b = document.createElement("button");
      b.textContent = "削除";
      b.className = "danger";
      b.addEventListener("click", () => {
        set.environments.splice(envIdx, 1);
        void save().then(render);
      });
      tdDel.append(b);
      tr.append(tdDel);
      tbody.append(tr);
    });
    div.append(table);

    const actions = document.createElement("div");
    actions.className = "actions";
    const addEnvBtn = document.createElement("button");
    addEnvBtn.textContent = "環境を追加";
    addEnvBtn.addEventListener("click", () => {
      set.environments.push(emptyEnv());
      void save().then(render);
    });
    actions.append(addEnvBtn);
    div.append(actions);

    root.append(div);
  });
}

function cell(value: string, onChange: (v: string) => void): HTMLTableCellElement {
  const td = document.createElement("td");
  const input = document.createElement("input");
  input.type = "text";
  input.value = value;
  input.addEventListener("input", () => { onChange(input.value); void save(); });
  td.append(input);
  return td;
}

function checkboxCell(value: boolean, onChange: (v: boolean) => void): HTMLTableCellElement {
  const td = document.createElement("td");
  td.style.textAlign = "center";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = value;
  input.addEventListener("change", () => { onChange(input.checked); void save(); });
  td.append(input);
  return td;
}

function colorCell(value: string, onChange: (v: string) => void): HTMLTableCellElement {
  const td = document.createElement("td");
  const input = document.createElement("input");
  input.type = "color";
  input.value = value || "#888888";
  input.addEventListener("input", () => { onChange(input.value); void save(); });
  td.append(input);
  return td;
}

document.getElementById("add-set")!.addEventListener("click", () => {
  sets.push({ id: newId("set"), name: "新しいセット", environments: [] });
  void save().then(render);
});

void load();
