"use strict";
const $ = (id) => document.getElementById(id);
const state = {
  stations: [],
  parks: null,
  yearData: new Map(),
  allData: null,
  record: null,
  station: "422153",
  tab: "map",
  map: null,
  markers: new Map(),
  allRank: false,
  inspections: [],
  editId: null,
  request: 0,
  allRecords: null,
  loadedRecords: [],
  windowRecords: [],
  deleteConfirmId: null,
  chartIdentity: null,
};
const format = (n, d = 1) =>
  n === null || n === undefined
    ? "—"
    : Number.isInteger(n)
      ? String(n)
      : Number(n).toFixed(d);
const signed = (n) => (n === null ? "—" : `${n > 0 ? "+" : ""}${format(n)}`);
const hourMs = 3600000;
const ms = (t) => Date.parse(t.replace(" ", "T") + ":00+09:00");
const keyFromMs = (v) =>
  new Date(v + 9 * hourMs).toISOString().slice(0, 16).replace("T", " ");
const timeLabel = (t) => t.replaceAll("-", ".").replace(" ", " · ");
const escapeHtml = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const isNumber = (n) => typeof n === "number" && Number.isFinite(n);
const color = (v) =>
  v === null
    ? "#a6adb5"
    : v <= 15
      ? "#018780"
      : v <= 35
        ? "#8ab94c"
        : v <= 75
          ? "#df9d18"
          : "#dc6657";
const darker = (hex) =>
  "#" +
  [1, 3, 5]
    .map((i) =>
      Math.round(parseInt(hex.slice(i, i + 2), 16) * 0.72)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");
const parkLabel = (name) =>
  name === "대구3"
    ? "대구 제3산업단지"
    : /^성서[1-5]$/.test(name)
      ? name.replace("성서", "성서 제") + "산업단지"
      : name + " 산업단지";
function stationPopup(s, value) {
  return `<div class="station-popup"><strong>${escapeHtml(s.name)}</strong><span>${value === null ? "자료 없음" : format(value) + " μg/m³"}</span><button data-station="${s.id}">측정소 상세 보기 →</button></div>`;
}
const directions = [
  "북풍",
  "북동풍",
  "동풍",
  "남동풍",
  "남풍",
  "남서풍",
  "서풍",
  "북서풍",
];
const windName = (deg, speed) =>
  deg === null
    ? "자료 없음"
    : deg === 0 || speed === 0
      ? "정온"
      : directions[Math.floor(((deg % 360) + 22.5) / 45) % 8];
function toast(text) {
  $("toast").textContent = text;
  $("toast").hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => ($("toast").hidden = true), 3500);
}
async function json(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`자료를 불러오지 못했습니다 (${r.status})`);
  return r.json();
}
async function loadYear(year) {
  if (!state.yearData.has(String(year)))
    state.yearData.set(String(year), json(`assets/data-${year}.json`));
  return state.yearData.get(String(year));
}
async function loadAll() {
  if (!state.allData)
    state.allData = Promise.all([2023, 2024, 2025].map(loadYear)).then((a) => {
      state.allRecords = a.flat();
      return state.allRecords;
    });
  return state.allData;
}
function recordAt(key) {
  const records = state.loadedRecords || [];
  return records.find((r) => r[0] === key) || null;
}
function stationIndex() {
  return state.stations.findIndex((s) => s.id === state.station);
}
function selectedStation() {
  return state.stations[stationIndex()];
}
function persist() {
  try {
    localStorage.setItem(
      "daegu-inspection-v1",
      JSON.stringify(state.inspections),
    );
    return true;
  } catch {
    toast(
      "브라우저 저장 공간을 사용할 수 없어요. 내려받기로 기록을 보관해 주세요.",
    );
    return false;
  }
}
function savedRecords() {
  try {
    const records = JSON.parse(
      localStorage.getItem("daegu-inspection-v1") || "[]",
    );
    return Array.isArray(records)
      ? records
          .filter(
            (x) =>
              typeof x.id === "string" &&
              typeof x.stationId === "string" &&
              typeof x.time === "string" &&
              typeof x.reason === "string" &&
              ["확인 전", "점검 예정", "확인 완료"].includes(x.status) &&
              state.stations.some((s) => s.id === x.stationId),
          )
          .map((x) => ({
            ...x,
            memo: typeof x.memo === "string" ? x.memo : "",
          }))
      : [];
  } catch {
    return [];
  }
}
function tab(name) {
  state.tab = name;
  for (const button of document.querySelectorAll("[data-tab]")) {
    const active = button.dataset.tab === name;
    button.setAttribute("aria-selected", active);
    button.tabIndex = active ? 0 : -1;
  }
  for (const n of ["map", "station", "inspect"])
    $("panel-" + n).hidden = n !== name;
  if (name === "map")
    setTimeout(() => {
      if (state.map) state.map.invalidateSize();
    }, 60);
  if (name === "station") renderStation();
  if (name === "inspect") renderInspections();
}
async function selectTime(key) {
  const request = ++state.request;
  const year = key.slice(0, 4);
  $("status").textContent = "관측자료를 확인하고 있어요.";
  try {
    const records = await loadYear(year);
    if (request !== state.request) return;
    state.loadedRecords = records;
    state.record = records.find((r) => r[0] === key) || null;
    $("date").value = key.slice(0, 10);
    $("hour").value = key.slice(11, 13);
    $("status").textContent = state.record
      ? ""
      : "이 시각에는 관측자료가 없어요. 다른 시간을 선택해 주세요.";
    renderOverview();
    if (state.tab === "station") renderStation();
  } catch {
    $("status").textContent =
      "자료를 불러오지 못했어요. 연결을 확인하고 새로고침해 주세요.";
  }
}
function previousRecord() {
  return state.record
    ? recordAt(keyFromMs(ms(state.record[0]) - hourMs))
    : null;
}
function weatherMarkup(r, detail = false) {
  const v = (idx, unit) =>
    r && r[idx] !== null ? `${format(r[idx])}${unit}` : "자료 없음";
  const values = {
    기온: v(5, "℃"),
    강수량: v(7, " mm"),
    풍속: v(3, " m/s"),
    습도: v(6, "%"),
    전운량: v(8, " / 10"),
    풍향: r ? windName(r[4], r[3]) : "자료 없음",
  };
  const order = detail
    ? ["기온", "습도", "강수량", "전운량", "풍속", "풍향"]
    : ["기온", "강수량", "풍속", "습도", "전운량", "풍향"];
  return `<div class="weather-title"><h2>선택 시각의 날씨</h2><span>대구 ASOS 143</span></div><div class="weather-grid">${order.map((label) => `<div class="weather-item"><span>${label}</span><strong>${values[label]}</strong></div>`).join("")}</div>`;
}
function renderOverview() {
  const r = state.record;
  $("near-value").textContent = format(r?.[1]);
  $("far-value").textContent = format(r?.[2]);
  $("gap-value").textContent = r ? signed(r[1] - r[2]) : "—";
  $("weather").innerHTML = weatherMarkup(r);
  renderRanking();
  renderMarkers();
}
function renderRanking() {
  const r = state.record,
    p = previousRecord();
  const entries = state.stations
    .map((s, i) => ({
      ...s,
      index: i,
      value: r?.[9][i] ?? null,
      previous: p?.[9][i] ?? null,
    }))
    .sort(
      (a, b) =>
        (b.value ?? -Infinity) - (a.value ?? -Infinity) ||
        a.name.localeCompare(b.name),
    );
  $("valid-count").textContent =
    `${entries.filter((s) => s.value !== null).length}/19곳`;
  const visible = state.allRank ? entries : entries.slice(0, 5);
  $("station-ranking").innerHTML = visible
    .map((s, i) => {
      const diff =
        s.value !== null && s.previous !== null ? s.value - s.previous : null;
      return `<button class="rank-row" data-station="${s.id}" aria-label="${s.name} 측정소 상세 보기"><span class="rank-index">${i + 1}</span><span class="rank-label"><strong>${s.name}</strong><small>산업단지 ${s.near ? "인접" : "비인접"}</small></span><span class="rank-value">${format(s.value)}<span class="rank-rise">${diff === null ? "이전 값 없음" : signed(diff) + " / 이전 시간"}</span></span></button>`;
    })
    .join("");
  $("all-stations").textContent = state.allRank
    ? "상위 5곳만 보기 ↑"
    : "전체 측정소 보기 ↓";
}
function selectStation(id, show = true) {
  state.station = id;
  $("station-select").value = id;
  if (show) tab("station");
  else renderStation();
}
function initMap() {
  if (!window.L) {
    renderFallbackMap();
    return;
  }
  const map = (state.map = L.map("map", {
    scrollWheelZoom: true,
    zoomControl: true,
  }).setView([35.833, 128.565], 11));
  const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
  }).addTo(map);
  let failures = 0;
  tiles.on("tileerror", () => {
    if (++failures >= 3) $("map-message").hidden = false;
  });
  tiles.on("tileload", () => ($("map-message").hidden = true));
  L.geoJSON(state.parks, {
    style: {
      color: "#9d7bc7",
      weight: 1,
      fillColor: "#ae8fd5",
      fillOpacity: 0.176,
    },
    onEachFeature: (feature, layer) =>
      layer.bindTooltip(parkLabel(feature.properties.DAN_NAME)),
  }).addTo(map);
  for (const s of state.stations) {
    const marker = L.circleMarker([s.lat, s.lon], {
      radius: 7.65,
      color: darker("#a6adb5"),
      weight: 1.5,
      fillColor: "#a6adb5",
      fillOpacity: 1,
    }).addTo(map);
    marker.bindTooltip(s.name, {
      direction: "top",
      offset: [0, -8],
      permanent: false,
    });
    marker.bindPopup(stationPopup(s, null), {
      closeButton: true,
      autoPan: true,
    });
    marker.on("click", () => {
      state.station = s.id;
      $("station-select").value = s.id;
      renderMarkers();
    });
    const el = marker.getElement();
    if (el) {
      el.setAttribute("tabindex", "0");
      el.setAttribute("role", "button");
      el.setAttribute("aria-label", s.name + " 측정소 농도 보기");
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          state.station = s.id;
          $("station-select").value = s.id;
          renderMarkers();
          marker.openPopup();
        }
      });
    }
    state.markers.set(s.id, marker);
  }
  const bounds = L.latLngBounds(state.stations.map((s) => [s.lat, s.lon]));
  map.fitBounds(bounds.pad(0.07));
}
function renderMarkers() {
  if (!state.map) {
    if (state.stations.length) renderFallbackMap();
    return;
  }
  for (let i = 0; i < state.stations.length; i++) {
    const s = state.stations[i],
      marker = state.markers.get(s.id),
      value = state.record?.[9][i] ?? null;
    if (!marker) continue;
    const fill = color(value);
    marker.setStyle({
      fillColor: fill,
      color: darker(fill),
      radius: s.id === state.station ? 9.35 : 7.65,
    });
    marker.setPopupContent(stationPopup(s, value));
    const el = marker.getElement();
    if (el) el.setAttribute("aria-label", s.name + " 측정소 농도 보기");
  }
}
function renderFallbackMap() {
  const width = 820,
    height = 440;
  const minX = 128.4,
    maxX = 128.79,
    minY = 35.65,
    maxY = 35.97;
  const xy = (c) => [
    ((c[0] - minX) / (maxX - minX)) * width,
    height - ((c[1] - minY) / (maxY - minY)) * height,
  ];
  const polygons = [];
  for (const f of state.parks?.features || []) {
    const rings =
      f.geometry.type === "MultiPolygon"
        ? f.geometry.coordinates.flat(1)
        : f.geometry.coordinates;
    for (const ring of rings) {
      polygons.push(
        `<polygon points="${ring
          .map((c) =>
            xy(c)
              .map((v) => v.toFixed(1))
              .join(","),
          )
          .join(
            " ",
          )}" fill="#ae8fd5" fill-opacity=".176" stroke="#a58ac7" stroke-width="1"/>`,
      );
    }
  }
  const dots = state.stations.map((s, i) => {
    const [x, y] = xy([s.lon, s.lat]);
    const v = state.record?.[9][i] ?? null;
    return `<g class="station-point" tabindex="0" role="button" aria-label="${s.name} 농도 보기" data-map-station="${s.id}"><title>${escapeHtml(s.name)}</title><circle cx="${x}" cy="${y}" r="${s.id === state.station ? 9.35 : 7.65}" fill="${color(v)}" stroke="${darker(color(v))}" stroke-width="1.5"/></g>`;
  });
  $("map").innerHTML =
    `<svg viewBox="0 0 ${width} ${height}" class="fallback-map" role="img" aria-label="배경지도 없는 실제 좌표 기반 측정소와 산업단지 위치">${polygons.join("")}${dots.join("")}</svg><div id="fallback-popup" class="fallback-popup" hidden></div>`;
  $("map-message").hidden = false;
}
function openFallbackStation(id) {
  const i = state.stations.findIndex((s) => s.id === id);
  if (i < 0) return;
  state.station = id;
  $("station-select").value = id;
  renderMarkers();
  const box = $("fallback-popup");
  box.innerHTML = stationPopup(state.stations[i], state.record?.[9][i] ?? null);
  box.hidden = false;
}
function comparisonStreak(idx) {
  const records = state.allRecords || state.loadedRecords || [];
  const current = records.findIndex((r) => r === state.record);
  let count = 0;
  for (let i = current; i >= 0; i--) {
    const r = records[i];
    if (i < current && ms(records[i + 1][0]) - ms(r[0]) !== hourMs) break;
    if (r[9][idx] === null || r[2] === null || r[9][idx] <= r[2]) break;
    count++;
  }
  return count;
}
async function stationWindow() {
  const r = state.record;
  if (!r) return [];
  const start = ms(r[0]) - 24 * hourMs,
    end = ms(r[0]) + 24 * hourMs;
  const yrs = [
    ...new Set([keyFromMs(start).slice(0, 4), keyFromMs(end).slice(0, 4)]),
  ].filter((y) => y >= "2023" && y <= "2025");
  return (await Promise.all(yrs.map(loadYear)))
    .flat()
    .filter((x) => ms(x[0]) >= start && ms(x[0]) <= end);
}
async function renderStation() {
  const s = selectedStation();
  if (!s) return;
  const idx = stationIndex(),
    r = state.record,
    v = r?.[9][idx] ?? null,
    p = previousRecord()?.[9][idx] ?? null;
  const gap = v !== null && r ? v - r[2] : null;
  $("station-select").value = s.id;
  $("station-group").textContent =
    s.near && s.nearestPark
      ? parkLabel(s.nearestPark) + " 인접"
      : "산업단지 비인접";
  $("station-group").title = s.near
    ? "가장 가까운 산업단지 · " +
      (s.nearbyParks || []).map(parkLabel).join(", ")
    : "";
  $("station-address").textContent = s.address;
  $("station-value").textContent = format(v);
  $("station-comparison").textContent = r ? format(r[2]) + " μg/m³" : "—";
  $("station-gap").textContent =
    gap === null ? "" : `비인접 중앙값과 ${signed(gap)} μg/m³ 차이`;
  $("station-delta").textContent =
    v === null
      ? "이 시각은 관측자료가 없어요."
      : p === null
        ? "이전 시간의 관측자료가 없어요."
        : v === p
          ? "이전 시간과 같은 농도예요."
          : `이전 시간보다 ${format(Math.abs(v - p))} μg/m³ ${v > p ? "증가" : "감소"}`;
  $("detail-weather").innerHTML = weatherMarkup(r, true);
  $("chart-station-name").textContent = s.name;
  $("register").disabled = v === null;
  const streak = comparisonStreak(idx);
  $("station-insight").textContent =
    v === null
      ? "이 시각에는 자료가 없어 비교할 수 없어요."
      : gap > 0
        ? `선택 시각까지 ${streak}시간 연속으로 비인접 중앙값보다 높아요.`
        : gap === 0
          ? "선택 시각에는 비인접 중앙값과 농도가 같아요."
          : "선택 시각에는 비인접 중앙값보다 농도가 낮아요.";
  const identity = s.id + "|" + r?.[0];
  state.chartIdentity = identity;
  try {
    const records = await stationWindow();
    if (state.chartIdentity !== identity) return;
    state.windowRecords = records;
    drawChart(records, idx);
  } catch {
    $("station-insight").textContent =
      "시간별 자료를 불러오지 못했어요. 다시 시도해 주세요.";
  }
}
function drawChart(records, idx) {
  const svg = $("chart");
  const w = 880,
    h = 300,
    left = 48,
    right = 18,
    top = 22,
    bottom = 43;
  const start = state.record ? ms(state.record[0]) - 24 * hourMs : 0;
  const end = start + 48 * hourMs;
  const max = Math.max(
    10,
    ...records.flatMap((r) => [r[9][idx], r[2]]).filter(isNumber),
  );
  const yMax = Math.ceil(max / 20) * 20;
  const xx = (t) =>
    left + ((ms(t) - start) / (end - start)) * (w - left - right);
  const yy = (v) => h - bottom - (v / yMax) * (h - top - bottom);
  let marks = `<title>${escapeHtml(selectedStation().name)}와 비인접 그룹의 시간별 초미세먼지 농도</title><desc>선택 시각 전후 24시간을 비교합니다. 단위는 μg/m³이며 결측값은 선을 연결하지 않습니다.</desc>`;
  for (let i = 0; i <= 4; i++) {
    const val = (yMax * i) / 4,
      y = yy(val);
    marks += `<line x1="${left}" y1="${y}" x2="${w - right}" y2="${y}" stroke="#e9edf1"/><text x="${left - 10}" y="${y + 4}" text-anchor="end" font-size="12" fill="#6b7684">${format(val)}</text>`;
  }
  marks += '<text x="2" y="12" fill="#6b7684" font-size="11">μg/m³</text>';
  for (let n = 0; n <= 4; n++) {
    const key = keyFromMs(start + n * 12 * hourMs),
      x = xx(key);
    marks += `<text x="${x}" y="${h - 15}" text-anchor="middle" font-size="12" fill="#6b7684">${key.slice(5, 10).replace("-", "/")} ${key.slice(11, 13)}시</text>`;
  }
  const selectedX = state.record ? xx(state.record[0]) : 0;
  marks += `<line x1="${selectedX}" y1="${top}" x2="${selectedX}" y2="${h - bottom}" stroke="#aeb8bf" stroke-dasharray="4 4"/><text x="${selectedX}" y="13" text-anchor="middle" font-size="11" fill="#6b7684">선택 시각</text>`;
  for (const [getValue, stroke] of [
    [(r) => r[2], "#d5a017"],
    [(r) => r[9][idx], "#018780"],
  ]) {
    let path = "",
      prev = null;
    for (const r of records) {
      const val = getValue(r);
      if (val === null) {
        prev = null;
        continue;
      }
      const move = prev === null || ms(r[0]) - ms(prev) !== hourMs;
      path += `${move ? "M" : "L"}${xx(r[0]).toFixed(2)},${yy(val).toFixed(2)} `;
      prev = r[0];
    }
    marks += `<path d="${path}" stroke="${stroke}" stroke-width="2.7" fill="none" stroke-linejoin="round" stroke-linecap="round"/>`;
    for (const r of records) {
      const val = getValue(r);
      if (val !== null && r === state.record)
        marks += `<circle cx="${xx(r[0])}" cy="${yy(val)}" r="4" fill="${stroke}"/>`;
    }
  }
  for (let i = 0; i < records.length; i++) {
    const r = records[i],
      x = xx(r[0]);
    marks += `<rect x="${Math.max(left, x - 8)}" y="${top}" width="16" height="${h - top - bottom}" fill="transparent" tabindex="0" data-point="${i}" aria-label="${r[0]}, ${selectedStation().name} ${format(r[9][idx])}, 비인접 ${format(r[2])} μg/m³"/>`;
  }
  svg.innerHTML = marks;
  const show = (e) => {
    const rect = e.target.closest("[data-point]");
    if (!rect) return;
    const r = records[Number(rect.dataset.point)];
    $("chart-tooltip").textContent =
      `${timeLabel(r[0])} | ${selectedStation().name} ${format(r[9][idx])} · 비인접 ${format(r[2])} μg/m³`;
    $("chart-tooltip").hidden = false;
  };
  svg.onpointerover = show;
  svg.onfocusin = show;
  svg.onpointerleave = () => ($("chart-tooltip").hidden = true);
  svg.onfocusout = () => ($("chart-tooltip").hidden = true);
}
function registerInspection() {
  const s = selectedStation(),
    r = state.record,
    idx = stationIndex();
  if (!r || r[9][idx] === null) return;
  if (state.inspections.some((x) => x.stationId === s.id && x.time === r[0])) {
    toast("같은 측정소와 시각이 이미 등록되어 있어요.");
    tab("inspect");
    return;
  }
  const entry = {
    id:
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : Date.now() + "-" + Math.random().toString(36).slice(2),
    stationId: s.id,
    time: r[0],
    value: r[9][idx],
    far: r[2],
    wind: r[3],
    reason: $("reason").value,
    status: "확인 전",
    memo: "",
  };
  state.inspections.unshift(entry);
  state.editId = entry.id;
  persist();
  tab("inspect");
  toast("점검 대상으로 등록했어요.");
}
function renderInspections() {
  state.deleteConfirmId = null;
  $("delete-inspection").textContent = "삭제";
  const list = state.inspections;
  $("count-badge").textContent = list.length;
  $("count-badge").hidden = !list.length;
  const unique = new Set(list.map((x) => x.stationId));
  $("inspection-title").textContent =
    `확인할 지역 ${unique.size}곳${list.length !== unique.size ? " · 기록 " + list.length + "건" : ""}`;
  $("export-inspections").disabled = !list.length;
  if (!list.length) {
    $("inspection-list").innerHTML =
      '<div class="empty"><h2>아직 등록한 지역이 없어요</h2><p>측정소의 농도 변화를 확인하고<br>점검 대상을 등록해 보세요.</p><button id="empty-to-station">측정소 살펴보기 →</button></div>';
    $("inspection-editor").hidden = true;
    return;
  }
  if (!list.some((x) => x.id === state.editId)) state.editId = list[0].id;
  $("inspection-list").innerHTML = list
    .map((x) => {
      const s = state.stations.find((s) => s.id === x.stationId);
      return `<button class="inspection-row" data-inspection="${escapeHtml(x.id)}" aria-pressed="${x.id === state.editId}"><span><h2>${s.name}</h2><p>${escapeHtml(x.reason)}</p><p>${timeLabel(x.time)}</p></span><span class="state ${x.status === "점검 예정" ? "scheduled" : x.status === "확인 완료" ? "done" : ""}">${x.status}</span></button>`;
    })
    .join("");
  const x = list.find((x) => x.id === state.editId),
    s = state.stations.find((s) => s.id === x.stationId);
  $("inspection-editor").hidden = false;
  $("edit-title").textContent = s.name + " 점검 메모";
  $("edit-date").textContent = timeLabel(x.time) + " 관측 기준";
  $("edit-observation").textContent =
    `측정소 ${format(x.value)} · 비인접 중앙값 ${format(x.far)} μg/m³ · 풍속 ${x.wind === null ? "자료 없음" : format(x.wind) + " m/s"}`;
  $("edit-state").value = x.status;
  $("edit-memo").value = x.memo;
}
function csvDownload(filename, headers, rows) {
  const cell = (v) => '"' + String(v ?? "").replaceAll('"', '""') + '"';
  const text =
    "\uFEFF" +
    [headers, ...rows].map((row) => row.map(cell).join(",")).join("\r\n");
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function preset(kind) {
  const buttons = [...document.querySelectorAll("[data-preset]")];
  buttons.forEach((b) => (b.disabled = true));
  try {
    const data = await loadYear($("date").value.slice(0, 4));
    const candidates = data.filter((r) =>
      kind === "weak"
        ? r[3] !== null && r[3] < 1
        : kind === "summer"
          ? [6, 7, 8].includes(Number(r[0].slice(5, 7))) &&
            r[0].slice(11, 13) === "07"
          : true,
    );
    const chosen = candidates.reduce(
      (best, r) => (!best || r[1] - r[2] > best[1] - best[2] ? r : best),
      null,
    );
    if (!chosen) {
      toast("해당 조건의 자료가 없어요.");
      return;
    }
    await selectTime(chosen[0]);
    toast(
      `${chosen[0].slice(0, 4)}년 ${kind === "weak" ? "약풍" : kind === "summer" ? "여름 07시" : "전체"} 관측 중 그룹 격차가 가장 큰 시각이에요.`,
    );
  } catch {
    toast("상황 자료를 불러오지 못했어요.");
  } finally {
    buttons.forEach((b) => (b.disabled = false));
  }
}
async function start() {
  for (let h = 0; h < 24; h++)
    $("hour").add(
      new Option(
        String(h).padStart(2, "0") + ":00",
        String(h).padStart(2, "0"),
      ),
    );
  $("hour").value = "10";
  for (const button of document.querySelectorAll("[data-tab]"))
    button.onclick = () => tab(button.dataset.tab);
  document.querySelector(".tabs").onkeydown = (e) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const ids = ["map", "station", "inspect"];
    const i = ids.indexOf(state.tab);
    const n =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? 2
          : (i + (e.key === "ArrowRight" ? 1 : 2)) % 3;
    tab(ids[n]);
    $("tab-" + ids[n]).focus();
  };
  $("date").onchange = $("hour").onchange = () => {
    const d = $("date").value;
    if (!/^202[345]-\d{2}-\d{2}$/.test(d)) {
      toast("2023~2025년의 날짜를 선택해 주세요.");
      return;
    }
    selectTime(d + " " + $("hour").value + ":00");
  };
  document.querySelector(".brand").onclick = (e) => {
    e.preventDefault();
    tab("map");
  };
  $("all-stations").onclick = () => {
    state.allRank = !state.allRank;
    renderRanking();
  };
  $("station-ranking").onclick = (e) => {
    const b = e.target.closest("[data-station]");
    if (b) selectStation(b.dataset.station);
  };
  $("map").addEventListener("click", (e) => {
    const dot = e.target.closest("[data-map-station]");
    if (dot) {
      openFallbackStation(dot.dataset.mapStation);
      return;
    }
    const b = e.target.closest("[data-station]");
    if (b) selectStation(b.dataset.station);
  });
  $("map").addEventListener("keydown", (e) => {
    const dot = e.target.closest("[data-map-station]");
    if (dot && ["Enter", " "].includes(e.key)) {
      e.preventDefault();
      openFallbackStation(dot.dataset.mapStation);
    }
  });
  $("station-select").onchange = (e) => selectStation(e.target.value, false);
  $("back-map").onclick = () => {
    tab("map");
    const s = selectedStation();
    if (state.map) state.map.setView([s.lat, s.lon], 13);
  };
  $("register").onclick = registerInspection;
  $("inspection-list").onclick = (e) => {
    if (e.target.closest("#empty-to-station")) {
      tab("station");
      return;
    }
    const b = e.target.closest("[data-inspection]");
    if (b) {
      state.editId = b.dataset.inspection;
      renderInspections();
    }
  };
  $("save-inspection").onclick = () => {
    const x = state.inspections.find((x) => x.id === state.editId);
    if (!x) return;
    x.status = $("edit-state").value;
    x.memo = $("edit-memo").value;
    const ok = persist();
    renderInspections();
    if (ok) toast("기록을 저장했어요.");
  };
  $("delete-inspection").onclick = () => {
    if (state.deleteConfirmId !== state.editId) {
      state.deleteConfirmId = state.editId;
      $("delete-inspection").textContent = "삭제 확인";
      toast("삭제 확인을 한 번 더 누르면 이 기록을 지워요.");
      return;
    }
    state.deleteConfirmId = null;
    state.inspections = state.inspections.filter((x) => x.id !== state.editId);
    state.editId = null;
    persist();
    renderInspections();
  };
  $("view-observation").onclick = async () => {
    const x = state.inspections.find((x) => x.id === state.editId);
    if (!x) return;
    state.station = x.stationId;
    await selectTime(x.time);
    tab("station");
  };
  $("export-inspections").onclick = () =>
    csvDownload(
      "대구_가상점검목록.csv",
      [
        "측정소",
        "관측시각_KST",
        "PM2.5_ug_m3",
        "비인접중앙값_ug_m3",
        "풍속_m_s",
        "선정이유",
        "상태",
        "가상점검메모",
      ],
      state.inspections.map((x) => [
        state.stations.find((s) => s.id === x.stationId).name,
        x.time,
        x.value,
        x.far,
        x.wind,
        x.reason,
        x.status,
        x.memo,
      ]),
    );
  $("export-series").onclick = () => {
    const s = selectedStation(),
      i = stationIndex();
    csvDownload(
      s.name + "_시간별_초미세먼지.csv",
      [
        "시각_KST",
        "측정소",
        "PM2.5_ug_m3",
        "비인접중앙값_ug_m3",
        "풍속_m_s",
        "풍향_도",
        "기온_C",
        "습도_pct",
        "강수량관측값_mm",
      ],
      (state.windowRecords || []).map((r) => [
        r[0],
        s.name,
        r[9][i],
        r[2],
        r[3],
        r[4],
        r[5],
        r[6],
        r[7],
      ]),
    );
  };
  $("about-toggle").onclick = () => {
    const open = $("about").hidden;
    $("about").hidden = !open;
    $("about-toggle").setAttribute("aria-expanded", open);
  };
  document
    .querySelectorAll("[data-preset]")
    .forEach((b) => (b.onclick = () => preset(b.dataset.preset)));
  try {
    [state.stations, state.parks] = await Promise.all([
      json("assets/stations.json"),
      json("assets/parks.json"),
    ]);
    for (const s of state.stations)
      $("station-select").add(new Option(s.name, s.id));
    const chimsan = state.stations.find((s) => s.name === "침산동");
    state.station = chimsan.id;
    state.inspections = savedRecords();
    renderInspections();
    initMap();
    await selectTime("2023-12-11 10:00");
    loadAll().catch(() => {});
  } catch (e) {
    $("status").textContent =
      "자료를 불러오지 못했어요. 새로고침하거나 연결을 확인해 주세요.";
    console.error(e);
  }
}
start();
