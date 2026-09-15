"use strict";

(function () {
  const PREFIX = "roster:";
  const INDEX_KEY = "roster:index";
  const HISTORY_PREFIX = "roster:history:";

  const state = {
    code: null,
    students: [],
    pool: [],
    count: 1,
    rolling: false,
    timer: null,
  };

  const $ = (id) => document.getElementById(id);

  function readIndex() {
    try { return JSON.parse(localStorage.getItem(INDEX_KEY)) || []; } catch (e) { return []; }
  }
  function writeIndex(list) { localStorage.setItem(INDEX_KEY, JSON.stringify(list)); }
  function saveRoster(key, data) {
    localStorage.setItem(PREFIX + key, JSON.stringify(data));
    const idx = readIndex();
    if (!idx.includes(key)) { idx.push(key); writeIndex(idx); }
  }
  function loadRoster(key) {
    let parsed;
    try { parsed = JSON.parse(localStorage.getItem(PREFIX + key)); } catch (e) { return null; }
    if (!parsed) return null;
    if (Array.isArray(parsed)) return { label: key + "班", students: parsed };
    return parsed;
  }
  function removeRoster(code) {
    localStorage.removeItem(PREFIX + code);
    localStorage.removeItem(HISTORY_PREFIX + code);
    writeIndex(readIndex().filter((c) => c !== code));
  }
  function readHistory(code) {
    try { return JSON.parse(localStorage.getItem(HISTORY_PREFIX + code)) || []; } catch (e) { return []; }
  }
  function pushHistory(names) {
    const list = readHistory(state.code);
    list.unshift({ names, time: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) });
    localStorage.setItem(HISTORY_PREFIX + state.code, JSON.stringify(list.slice(0, 50)));
  }

  function classLabelFrom(classCount, fileName) {
    const entries = Object.keys(classCount)
      .filter((k) => k && !/^[-\s]*$/.test(k))
      .map((raw) => ({
        name: String(raw).replace(/海南|校区/g, "").replace(/\s+/g, "").replace(/班+$/, ""),
        count: classCount[raw],
      }))
      .filter((e) => e.name);
    if (!entries.length) return "";
    const total = entries.reduce((s, e) => s + e.count, 0);
    const dominant = entries.slice().sort((a, b) => b.count - a.count)[0];
    if (dominant.count / total >= 0.85) return dominant.name + "班";

    const names = [...new Set(entries.map((e) => e.name))]
      .sort((a, b) => a.localeCompare(b, "zh", { numeric: true }));
    let common = names[0];
    names.forEach((n) => { while (common && !n.startsWith(common)) common = common.slice(0, -1); });
    const prefix = common.replace(/\d+$/, "");

    const m = String(fileName || "").match(/(\d{1,2})\s*班/);
    if (prefix && m) {
      const num = m[1].replace(/^0+(?=\d)/, "");
      return prefix + num + "班";
    }
    const suffixes = names.map((n) => n.slice(common.length));
    if (common && suffixes.every((s) => /^[\dA-Za-z]+$/.test(s))) return common + suffixes.join("/") + "班";
    return names.join("+") + "班";
  }

  function parseRoster(arrayBuffer, fileName) {
    const wb = XLSX.read(arrayBuffer, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
    let hIdx = -1, cId = -1, cName = -1, cGender = -1, cClass = -1;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i].map((c) => String(c));
      if (r.includes("学号") && r.includes("姓名")) {
        hIdx = i;
        cId = r.indexOf("学号");
        cName = r.indexOf("姓名");
        cGender = r.indexOf("性别");
        cClass = r.indexOf("班级");
        break;
      }
    }
    const students = [];
    const classCount = {};
    if (hIdx >= 0) {
      for (let i = hIdx + 1; i < rows.length; i++) {
        const id = String(rows[i][cId] || "").trim();
        const name = String(rows[i][cName] || "").trim();
        if (!name) continue;
        if (id && !/^\d+$/.test(id)) continue;
        const cls = cClass >= 0 ? String(rows[i][cClass] || "").trim() : "";
        if (cls) classCount[cls] = (classCount[cls] || 0) + 1;
        students.push({ id, name, gender: String(rows[i][cGender] || "").trim() });
      }
    } else {
      rows.forEach((r) => {
        const name = String(r[0] || "").trim();
        if (name) students.push({ id: "", name, gender: "" });
      });
    }
    let rawClass = "";
    let max = 0;
    Object.keys(classCount).forEach((k) => {
      if (classCount[k] > max) { max = classCount[k]; rawClass = k; }
    });
    return { students, className: classLabelFrom(classCount, fileName) };
  }

  function renderChips() {
    const box = $("rcChips");
    box.innerHTML = "";
    readIndex().forEach((code) => {
      const roster = loadRoster(code);
      if (!roster) return;
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "rc-chip" + (code === state.code ? " active" : "");
      chip.innerHTML =
        `<span class="rc-chip-name">${roster.label} · ${roster.students.length}人</span>` +
        (code === state.code ? `<span class="rc-chip-edit" data-code="${code}" title="改标签">✎</span>` : "") +
        `<span class="rc-chip-x" data-code="${code}" title="删除">×</span>`;
      chip.addEventListener("click", (e) => {
        const x = e.target.closest(".rc-chip-x");
        if (x) { removeRoster(x.dataset.code); if (state.code === x.dataset.code) selectCode(null); renderChips(); return; }
        const edit = e.target.closest(".rc-chip-edit");
        if (edit) { renameRoster(edit.dataset.code); return; }
        selectCode(code);
      });
      box.appendChild(chip);
    });
  }

  function renameRoster(code) {
    const roster = loadRoster(code);
    if (!roster) return;
    const input = prompt("修改班级标签（简短，如 26大数据1班）", roster.label);
    if (input === null) return;
    const label = input.trim();
    if (!label || label === roster.label) return;
    roster.label = label;
    localStorage.setItem(PREFIX + code, JSON.stringify(roster));
    renderChips();
    if (state.code === code) $("rcInfo").textContent = `${label} · 共 ${roster.students.length} 人`;
  }

  function selectCode(code) {
    if (state.rolling) stopTimer();
    state.code = code;
    if (code) {
      const roster = loadRoster(code) || { label: code, students: [] };
      state.students = roster.students;
      state.pool = state.students.slice();
      $("rcGo").disabled = false;
      $("rcReset").disabled = false;
      resetStage();
      $("rcInfo").textContent = `${roster.label} · 共 ${state.students.length} 人 · 点击开始`;
      $("rcStage").classList.remove("picked");
    } else {
      state.students = [];
      state.pool = [];
      $("rcGo").disabled = true;
      $("rcReset").disabled = true;
      resetStage();
      $("rcInfo").textContent = "上传教学记录表（.xls），自动识别班级标签";
    }
    renderChips();
    renderHistory();
  }

  function showGroup(list) {
    const nameEl = $("rcName");
    nameEl.classList.toggle("multi", list.length > 1);
    nameEl.innerHTML = list.map((s) => `<span class="rc-n">${s.name}</span>`).join("");
    $("rcInfo").textContent = list.map((s) => [s.id, s.gender].filter(Boolean).join("·")).filter(Boolean).join(" ｜ ") || "—";
  }

  function pickGroup(n, source) {
    const arr = source.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr.slice(0, n);
  }

  function flash() {
    if (!state.students.length) return;
    showGroup(pickGroup(state.count, state.students));
  }

  function setCount(n) {
    state.count = Math.min(10, Math.max(1, n));
    $("rcCountNum").textContent = state.count;
    if (state.rolling) flash();
  }

  function resetStage() {
    $("rcName").classList.remove("multi");
    $("rcName").textContent = "?";
  }

  function startTimer() {
    state.rolling = true;
    $("rcGo").textContent = "停 止";
    $("rcStage").classList.add("rolling");
    $("rcStage").classList.remove("picked");
    state.timer = setInterval(flash, 70);
  }

  function stopTimer() {
    clearInterval(state.timer);
    state.timer = null;
    state.rolling = false;
    $("rcGo").textContent = "开始点名";
    $("rcStage").classList.remove("rolling");
  }

  function pickOnce() {
    const noRepeat = $("rcNoRepeat").checked;
    const source = noRepeat ? state.pool : state.students;
    if (!source.length) {
      $("rcInfo").textContent = "本轮已全部抽完，请重置本轮";
      $("rcName").classList.remove("multi");
      $("rcName").textContent = "无";
      return;
    }
    const n = Math.min(state.count, source.length);
    const group = pickGroup(n, source);
    if (noRepeat) state.pool = state.pool.filter((s) => !group.includes(s));
    pushHistory(group.map((s) => s.name));
    showGroup(group);
    $("rcStage").classList.add("picked");
    $("rcInfo").textContent =
      `已抽 ${group.length} 人 · 本轮剩余 ${noRepeat ? state.pool.length : state.students.length}/${state.students.length}`;
    renderHistory();
  }

  function syncPoolWithHistory() {
    if (!state.code) { state.pool = []; return; }
    if (!$("rcNoRepeat").checked) { state.pool = state.students.slice(); return; }
    const picked = [];
    readHistory(state.code).forEach((h) => {
      if (h.names) picked.push(...h.names);
      else if (h.name) picked.push(h.name);
    });
    state.pool = state.students.filter((s) => !picked.includes(s.name));
  }

  function deleteHistory(idx) {
    const list = readHistory(state.code);
    if (idx < 0 || idx >= list.length) return;
    list.splice(idx, 1);
    localStorage.setItem(HISTORY_PREFIX + state.code, JSON.stringify(list));
    syncPoolWithHistory();
    renderHistory();
  }

  function clearHistory() {
    if (!state.code) return;
    localStorage.removeItem(HISTORY_PREFIX + state.code);
    syncPoolWithHistory();
    renderHistory();
  }

  function renderHistory() {
    const box = $("rcHistory");
    const list = state.code ? readHistory(state.code) : [];
    if (!list.length) { box.innerHTML = ""; return; }
    box.innerHTML =
      `<div class="rc-h-title">抽取记录（${list.length}）<button type="button" class="rc-h-clear">清空</button></div>` +
      list.map((h, i) => {
        const names = h.names && h.names.length ? h.names : (h.name ? [h.name] : []);
        return `<span class="rc-h-item">${names.join("、")}<i>${h.time || ""}</i><b class="rc-h-del" data-i="${i}" title="删除">×</b></span>`;
      }).join("");
  }

  function guessLabelFromName(name) {
    const m = String(name || "").match(/(\d{1,2})\s*班/);
    return m ? m[1] + "班" : "";
  }

  async function handleFile(file) {
    try {
      const buf = await file.arrayBuffer();
      const parsed = parseRoster(buf, file.name);
      if (!parsed.students.length) { $("rcInfo").textContent = "未解析到学生，请检查文件"; return; }
      const key = parsed.className || guessLabelFromName(file.name);
      if (!key) { $("rcInfo").textContent = "无法识别班级，请检查表格是否含“班级”列"; return; }
      if (loadRoster(key)) {
        selectCode(key);
        $("rcInfo").textContent = `「${loadRoster(key).label}」已有名单，无需重复上传（更新请先删除）`;
        return;
      }
      saveRoster(key, { label: key, students: parsed.students });
      selectCode(key);
    } catch (err) {
      $("rcInfo").textContent = "解析失败：" + (err && err.message ? err.message : "文件格式不支持");
    }
  }

  function init() {
    $("rcFab").addEventListener("click", () => {
      $("rcOverlay").classList.add("open");
      if (!state.code) {
        const idx = readIndex();
        if (idx.length) selectCode(idx[idx.length - 1]);
      }
    });
    $("rcClose").addEventListener("click", () => {
      if (state.rolling) stopTimer();
      $("rcOverlay").classList.remove("open");
    });
    $("rcOverlay").addEventListener("click", (e) => {
      if (e.target.id === "rcOverlay") $("rcClose").click();
    });

    $("rcFile").addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) handleFile(file);
      e.target.value = "";
    });

    const sheet = document.querySelector(".rc-sheet");
    sheet.addEventListener("dragover", (e) => { e.preventDefault(); sheet.classList.add("dragging"); });
    sheet.addEventListener("dragleave", (e) => {
      if (!sheet.contains(e.relatedTarget)) sheet.classList.remove("dragging");
    });
    sheet.addEventListener("drop", (e) => {
      e.preventDefault();
      sheet.classList.remove("dragging");
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) handleFile(file);
    });

    $("rcGo").addEventListener("click", () => {
      if (!state.students.length) return;
      if (state.rolling) { stopTimer(); pickOnce(); }
      else startTimer();
    });
    $("rcReset").addEventListener("click", () => {
      if (state.rolling) stopTimer();
      state.pool = state.students.slice();
      $("rcStage").classList.remove("picked");
      resetStage();
      $("rcInfo").textContent = `${loadRoster(state.code).label} · 共 ${state.students.length} 人 · 已重置`;
    });
    $("rcNoRepeat").addEventListener("change", syncPoolWithHistory);

    $("rcHistory").addEventListener("click", (e) => {
      const del = e.target.closest(".rc-h-del");
      if (del) { deleteHistory(Number(del.dataset.i)); return; }
      if (e.target.closest(".rc-h-clear")) clearHistory();
    });

    $("rcMinus").addEventListener("click", () => setCount(state.count - 1));
    $("rcPlus").addEventListener("click", () => setCount(state.count + 1));
  }

  document.addEventListener("DOMContentLoaded", init);
})();
