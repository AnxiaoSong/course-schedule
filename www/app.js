"use strict";

const DAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

const PERIODS = [
  { n: 1, label: "第一节", time: "08:00-08:45", section: "morning" },
  { n: 2, label: "第二节", time: "08:50-09:35", section: "morning" },
  { n: 3, label: "第三节", time: "09:50-10:35", section: "morning" },
  { n: 4, label: "第四节", time: "10:40-11:25", section: "morning" },
  { n: 5, label: "第五节", time: "11:30-12:15", section: "morning" },
  { n: 6, label: "第六节", time: "14:00-14:45", section: "afternoon" },
  { n: 7, label: "第七节", time: "14:50-15:35", section: "afternoon" },
  { n: 8, label: "第八节", time: "15:50-16:35", section: "afternoon" },
  { n: 9, label: "第九节", time: "16:40-17:25", section: "afternoon" },
  { n: 10, label: "第十节", time: "17:30-18:15", section: "afternoon" },
];

const SECTIONS = [
  { key: "morning", label: "上午", from: 1, to: 5 },
  { key: "afternoon", label: "下午", from: 6, to: 10 },
];

const COURSES = [
  { name: "线性代数", day: 1, start: 1, end: 2, room: "公共教学楼215", teacher: "宋安霄", weeks: [3, 5], cls: "26大数据3班" },
  { name: "线性代数", day: 1, start: 8, end: 10, room: "公共教学楼215", teacher: "宋安霄", weeks: [3, 18], cls: "26大数据3班" },
  { name: "线性代数", day: 2, start: 1, end: 2, room: "公共教学楼215", teacher: "宋安霄", weeks: [3, 5], cls: "26大数据2班" },
  { name: "线性代数", day: 2, start: 3, end: 5, room: "公共教学楼215", teacher: "宋安霄", weeks: [3, 18], cls: "26大数据1班" },
  { name: "线性代数", day: 3, start: 8, end: 10, room: "公共教学楼215", teacher: "宋安霄", weeks: [3, 18], cls: "26大数据2班" },
  { name: "线性代数", day: 4, start: 6, end: 7, room: "公共教学楼215", teacher: "宋安霄", weeks: [3, 5], cls: "26大数据1班" },
];

const COLORS = {
  "线性代数": { bg: "#eef2ff", accent: "#3b5bdb", text: "#1e2a78" },
};

const WEEK_MIN = 3;
const WEEK_MAX = 20;
const DEFAULT_WEEK = 3;
const WEEK3_MONDAY = new Date(2026, 8, 14);

const state = { week: DEFAULT_WEEK };

function mondayOf(week) {
  const d = new Date(WEEK3_MONDAY.getTime());
  d.setDate(d.getDate() + (week - 3) * 7);
  return d;
}

function dateOf(week, dayIndex) {
  const d = mondayOf(week);
  d.setDate(d.getDate() + (dayIndex - 1));
  return d;
}

function fmtMD(d) {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function activeInWeek(course, week) {
  return week >= course.weeks[0] && week <= course.weeks[1];
}

function weekText(course) {
  const [a, b] = course.weeks;
  return a === b ? `${a}周` : `${a}-${b}周`;
}

function courseTime(course) {
  const startT = PERIODS[course.start - 1].time.split("-")[0];
  const endT = PERIODS[course.end - 1].time.split("-")[1];
  return `${startT}-${endT}`;
}

function colorOf(name) {
  return COLORS[name] || { bg: "#eef1f6", accent: "#94a3b8", text: "#334155" };
}

function renderTimetable() {
  const grid = document.getElementById("timetable");
  grid.innerHTML = "";
  grid.style.gridTemplateRows = `42px repeat(10, 58px)`;

  const corner = document.createElement("div");
  corner.className = "corner";
  corner.style.gridArea = "1 / 1 / 2 / 3";
  corner.textContent = "时段";
  grid.appendChild(corner);

  DAYS.forEach((name, i) => {
    const head = document.createElement("div");
    head.className = "day-head";
    const isToday = fmtMD(dateOf(state.week, i + 1)) === fmtMD(new Date());
    if (isToday) head.classList.add("today");
    head.style.gridArea = `1 / ${i + 3} / 2 / ${i + 4}`;
    head.innerHTML = `<span class="dh-name">${name}</span><span class="dh-date">${fmtMD(dateOf(state.week, i + 1))}</span>`;
    grid.appendChild(head);
  });

  SECTIONS.forEach((s) => {
    const cell = document.createElement("div");
    cell.className = `section-cell ${s.key}`;
    cell.style.gridArea = `${s.from + 1} / 1 / ${s.to + 2} / 2`;
    cell.textContent = s.label;
    grid.appendChild(cell);
  });

  PERIODS.forEach((p) => {
    const t = document.createElement("div");
    t.className = `time-cell ${p.section}`;
    t.style.gridArea = `${p.n + 1} / 2 / ${p.n + 2} / 3`;
    const [startT, endT] = p.time.split("-");
    t.innerHTML = `<span class="p-time">${startT}</span><span class="p-label">${p.label}</span><span class="p-end">${endT}</span>`;
    grid.appendChild(t);

    for (let d = 1; d <= 7; d++) {
      const empty = document.createElement("div");
      empty.className = "day-cell";
      empty.style.gridArea = `${p.n + 1} / ${d + 2} / ${p.n + 2} / ${d + 3}`;
      grid.appendChild(empty);
    }
  });

  const list = COURSES.filter((c) => activeInWeek(c, state.week));
  list.forEach((c) => {
    const col = colorOf(c.name);
    const block = document.createElement("button");
    block.type = "button";
    block.className = "course-block";
    block.style.gridArea = `${c.start + 1} / ${c.day + 2} / ${c.end + 2} / ${c.day + 3}`;
    block.style.background = col.bg;
    block.style.borderLeftColor = col.accent;
    block.style.color = col.text;
    const compact = c.end - c.start === 0;
    block.innerHTML = `
      <span class="cb-name">${c.name}</span>
      ${compact ? "" : `<span class="cb-room">${c.room || "—"}</span>`}
      <span class="cb-meta">${c.room ? c.room.replace("公共教学楼", "") : ""}</span>
    `;
    block.addEventListener("click", () => openModal(c));
    grid.appendChild(block);
  });
}

function renderHeader() {
  document.getElementById("weekLabel").textContent = `第 ${state.week} 周`;
  const mon = mondayOf(state.week);
  const sun = dateOf(state.week, 7);
  document.getElementById("dateRange").textContent =
    `${mon.getFullYear()}.${fmtMD(mon)} - ${fmtMD(sun)}`;
}

function renderWeekPanel() {
  const panel = document.getElementById("todayPanel");
  const list = COURSES
    .filter((c) => activeInWeek(c, state.week))
    .sort((a, b) => a.day - b.day || a.start - b.start);

  if (!list.length) {
    panel.innerHTML = `<h2>本周线性代数</h2><p class="empty">本周暂无课程</p>`;
    return;
  }

  const title = "本周线性代数";
  const rows = list
    .map((c) => {
      const col = colorOf(c.name);
      const d = dateOf(state.week, c.day);
      return `
        <div class="row" data-name="${c.name}">
          <span class="dot" style="background:${col.accent}"></span>
          <div class="row-main">
            <div class="row-title">${c.name}${c.cls ? ` · ${c.cls}` : ""}</div>
            <div class="row-sub">${DAYS[c.day - 1]} ${fmtMD(d)} · ${courseTime(c)} · ${c.room || "地点待定"}${c.teacher ? ` · ${c.teacher}` : ""}</div>
          </div>
          <span class="row-weeks">${weekText(c)}</span>
        </div>`;
    })
    .join("");

  const summary = `<div class="la-summary">
       <div><strong>课程</strong><span>线性代数</span></div>
       <div><strong>教师</strong><span>宋安霄</span></div>
       <div><strong>地点</strong><span>公共教学楼215</span></div>
     </div>`;

  panel.innerHTML = `<h2>${title}</h2>${summary}${rows}`;
}

function openModal(c) {
  const modal = document.getElementById("modal");
  const card = document.getElementById("modalCard");
  const col = colorOf(c.name);
  card.style.borderTopColor = col.accent;
  card.innerHTML = `
    <div class="m-head">
      <span class="m-tag" style="background:${col.bg};color:${col.text}">${c.name}</span>
      <button class="m-close" id="mClose">×</button>
    </div>
    <h3>${c.name}</h3>
    <ul class="m-list">
      <li><span>班级</span><b>${c.cls || "—"}</b></li>
      <li><span>教师</span><b>${c.teacher || "—"}</b></li>
      <li><span>时间</span><b>${DAYS[c.day - 1]} 第${c.start}${c.end > c.start ? "-" + c.end : ""}节 · ${courseTime(c)}</b></li>
      <li><span>周次</span><b>${weekText(c)}</b></li>
      <li><span>地点</span><b>${c.room || "待定"}</b></li>
    </ul>`;
  modal.classList.add("open");
  document.getElementById("mClose").addEventListener("click", () => modal.classList.remove("open"));
}

function renderAll() {
  renderHeader();
  renderTimetable();
  renderWeekPanel();
}

function setWeek(w) {
  state.week = Math.min(WEEK_MAX, Math.max(WEEK_MIN, w));
  renderAll();
}

function init() {
  document.getElementById("prevWeek").addEventListener("click", () => setWeek(state.week - 1));
  document.getElementById("nextWeek").addEventListener("click", () => setWeek(state.week + 1));

  document.getElementById("modal").addEventListener("click", (e) => {
    if (e.target.id === "modal") e.currentTarget.classList.remove("open");
  });

  renderAll();
}

document.addEventListener("DOMContentLoaded", init);
