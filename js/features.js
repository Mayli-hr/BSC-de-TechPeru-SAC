/* Módulos de análisis y seguimiento. Todos usan el mismo estado del BSC. */
window.BSCFeatures = function (api) {
  "use strict";
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const { clone, uid, normalize, normalizeYear } = BSCStorage;
  const { escapeHtml: h, fmt, currency, today, perspectives, pageHead, metricCard } = api;
  const store = BSCStorage.create(api.initialState);
  const S = () => api.getState();
  const number = value => value !== "" && value !== null && value !== undefined && Number.isFinite(Number(value)) ? Number(value) : null;
  const average = values => { const valid = values.filter(v => v !== null && Number.isFinite(v)); return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null; };
  const objectiveName = id => S().objectives.find(o => o.id === id)?.name || "Sin objetivo";
  const kpiName = id => S().kpis.find(k => k.id === id)?.name || "Sin indicador";
  const label = key => perspectives[key]?.label || key;
  const score = k => api.baseAchievement(k);
  const percent = value => value === null ? "—" : fmt(value) + "%";
  let cut = null, perspectiveTab = "financiera", selectedReport = "general", reportModel = null;
  let urls = [], dashboardCharts = [], pending = false;

  function latest(k, period) {
    return k.measurements.filter(m => m.period === period).sort((a, b) => (a.recordedAt || a.date || "").localeCompare(b.recordedAt || b.date || "") || a.id.localeCompare(b.id)).at(-1);
  }
  function effective(k, period = cut || S().period) {
    if (period === S().period) return { ...k, evaluationPeriod: period };
    return { ...k, current: latest(k, period)?.value ?? null, target: k.targets?.[period] ?? null, evaluationPeriod: period };
  }
  const viewKpis = () => S().kpis.map(k => effective(k));
  const validPeriod = period => new RegExp("^" + S().period + "(?:-(?:0[1-9]|1[0-2]|Q[1-4]))?$").test(period);
  const periodLabel = period => /^20\d{2}-Q[1-4]$/.test(period) ? `${period.slice(-1)}.º trimestre ${period.slice(0, 4)}` : /^20\d{2}-\d{2}$/.test(period) ? `${["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"][Number(period.slice(-2)) - 1]} ${period.slice(0, 4)}` : `Acumulado anual ${period}`;
  function periods() { return [...new Set([S().period, ...(S().plannedPeriods || []), ...S().kpis.flatMap(k => [...k.measurements.map(m => m.period), ...Object.keys(k.targets || {})])])].sort(); }
  function loadState() { const data = store.load(); cut = data.period; return data; }
  function saveState() {
    if (!S().users.some(u => u.role === "Administrador")) throw new Error("Debe conservarse al menos un administrador.");
    try {
      S().kpis.forEach(k => { const o = S().objectives.find(o => o.id === k.objectiveId); if (o) k.perspective = o.perspective; });
      const user = S().users.find(u => u.id === api.getUser()?.id); if (user) Object.assign(api.getUser(), user);
      return store.save(S());
    }
    catch (e) { throw new Error("No se pudo guardar. Descarga un respaldo y revisa el espacio del navegador."); }
  }
  function syncSourceUI() {
    cut ||= S().period;
    if (!cut.startsWith(S().period)) cut = S().period;
    if (!periods().includes(cut)) cut = S().period;
    $("#globalPeriod").innerHTML = store.years().map(year => `<option ${year === S().period ? "selected" : ""}>${year}</option>`).join("");
    $("#globalCut").innerHTML = periods().map(period => `<option value="${h(period)}" ${period === cut ? "selected" : ""}>${h(periodLabel(period))}</option>`).join("");
    $("#sourceSummary").textContent = `${S().source?.organization || "TechPeru SAC"} · ${periodLabel(cut)}`;
    document.title = `TechPeru BSC · ${S().period}`;
    const user = api.getUser();
    if (user) for (const [id, value] of [["sideUserName", user.name], ["topUserName", user.name], ["sideUserRole", user.role], ["topUserRole", user.role]]) if ($("#" + id)) $("#" + id).textContent = value;
  }
  function refresh(page = api.getPage()) { syncSourceUI(); api.renderPage(page); }
  function globalCompliance() { return average(viewKpis().map(score)); }
  function perspectiveBreakdown() {
    return Object.entries(perspectives).map(([key, p]) => { const ks = viewKpis().filter(k => k.perspective === key), pct = average(ks.map(score)); return { key, ...p, pct, count: ks.length, has: pct !== null }; });
  }
  function statusOf(k, value = k.current) {
    if (value === null || value === undefined || value === "") return { key: "neutral", label: "Sin resultado", pct: null };
    if (k.target === null || k.target === undefined) return { key: "neutral", label: "Sin meta del corte", pct: null };
    const result = api.baseStatusOf(k, value); if (result.key === "good") result.label = "Logrado"; return result;
  }
  const badge = k => { const s = statusOf(k); return `<span class="status ${s.key}">${h(s.label)}</span>`; };
  const totalBadge = value => `<span class="status ${value === null ? "neutral" : value >= 90 ? "good" : value >= 75 ? "warn" : "bad"}">${value === null ? "Sin datos" : value >= 90 ? "Logrado" : value >= 75 ? "En riesgo" : "Crítico"}</span>`;
  const direction = k => k.direction === "menor" ? "↓ Menor es mejor" : k.direction === "rango" ? "Dentro de un rango" : "↑ Mayor es mejor";
  function gap(k) {
    if (number(k.current) === null) return "Sin resultado";
    if (number(k.target) === null) return "Define la meta del corte";
    const unit = k.unit === "%" ? "puntos porcentuales" : k.unit;
    if (k.direction === "rango") return k.current >= k.lower && k.current <= k.upper ? "Dentro del rango" : "Fuera del rango definido";
    const difference = k.direction === "menor" ? k.current - k.target : k.target - k.current;
    return difference <= 0 ? "Meta alcanzada" : `${k.direction === "menor" ? "Debe bajar" : "Faltan"} ${fmt(difference, 2)} ${unit}`;
  }
  const audit = (action, entity, detail) => api.recordAudit(action, entity, detail);
  function closeModal() { urls.forEach(URL.revokeObjectURL); urls = []; api.closeModal(); }
  function showModal(title, body, submitLabel = "Guardar", submitFn = null, eyebrow = "GESTIÓN") {
    api.showModal(title, body, submitLabel, submitFn, eyebrow);
    $("#modalClose").onclick = closeModal; $("#modalCancel").onclick = closeModal;
    $("#modalSubmit").onclick = async () => {
      if (pending || !submitFn) return;
      const button = $("#modalSubmit"); pending = true; button.disabled = true;
      try { await submitFn(); } catch (error) { api.toast(error.message || "No se pudo completar la operación.", "error"); }
      finally { pending = false; if (button.isConnected) button.disabled = false; }
    };
    $("#modalLayer").onclick = event => { if (event.target === $("#modalLayer")) closeModal(); };
  }
  function input(title, id, value = "", type = "text", extra = "") { return `<div class="field"><label for="${id}">${title}</label><input id="${id}" type="${type}" value="${h(value ?? "")}" ${extra}></div>`; }
  function textarea(title, id, value = "") { return `<div class="field full-span"><label for="${id}">${title}</label><textarea id="${id}">${h(value)}</textarea></div>`; }
  function select(title, id, options) { return `<div class="field"><label for="${id}">${title}</label><select id="${id}">${options}</select></div>`; }
  const option = (value, text, selected) => `<option value="${h(value)}" ${value === selected ? "selected" : ""}>${h(text)}</option>`;
  const owners = selected => [...new Set(["Responsable por asignar", ...S().users.map(u => u.name), selected].filter(Boolean))].map(n => option(n, n, selected)).join("");
  const objectives = selected => `<option value="">Selecciona un objetivo</option>` + S().objectives.map(o => option(o.id, o.id + " · " + o.name, selected)).join("");
  const kpis = selected => `<option value="">Sin indicador específico</option>` + S().kpis.map(k => option(k.id, k.id + " · " + k.name, selected)).join("");
  function required(ids) { for (const id of ids) if (!$("#" + id)?.value.trim()) throw new Error("Completa los campos obligatorios."); }
  const notifySaved = (message, page) => { saveState(); closeModal(); refresh(page); api.toast(message); };
  function counts(items = viewKpis()) { return Object.fromEntries(["good", "warn", "bad", "neutral"].map(key => [key, items.filter(k => statusOf(k).key === key).length])); }
  function table(headers, rows, empty = "No hay registros con estos filtros.") {
    return `<div class="table-scroll"><table><thead><tr>${headers.map(title => `<th>${h(title)}</th>`).join("")}</tr></thead><tbody>${rows.length ? rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${headers.length}"><div class="empty-state">${h(empty)}</div></td></tr>`}</tbody></table></div>`;
  }
  function kpiTable(items) {
    return table(["Indicador", "Objetivo", "Meta", "Real", "Cumplimiento", "Estado", "Brecha", "Acciones"], items.map(k => [
      `<span class="code">${h(k.id)}</span><strong class="subcell">${h(k.name)}</strong><span class="direction-tag">${h(direction(k))}</span>`, h(objectiveName(k.objectiveId)), `${fmt(k.target, 2)} ${h(k.unit)}`, `${fmt(k.current, 2)} ${h(k.unit)}`, percent(score(k)), badge(k), h(gap(k)), `<button class="text-action" data-action="kpi-detail" data-id="${h(k.id)}">Detalle</button><button class="text-action" data-action="measure-kpi" data-id="${h(k.id)}">Medir</button>${api.canEdit() ? `<button class="text-action" data-action="edit-kpi" data-id="${h(k.id)}">Editar</button><button class="text-action" data-action="delete-kpi" data-id="${h(k.id)}">Eliminar</button>` : ""}`
    ]));
  }

  function renderDashboard() {
    const items = viewKpis(), c = counts(items), global = globalCompliance();
    const rank = items.filter(k => score(k) !== null).sort((a, b) => score(a) - score(b));
    const ranking = (list, title, subtitle) => `<section class="panel"><div class="panel-head"><div><h2>${title}</h2><p>${subtitle}</p></div></div><div class="ranking-list">${list.map((k, index) => `<button class="ranking-item" data-action="kpi-detail" data-id="${h(k.id)}"><span class="ranking-position">${index + 1}</span><span><strong>${h(k.name)}</strong><small>${h(label(k.perspective))} · ${h(gap(k))}</small></span><b class="${statusOf(k).key}">${percent(score(k))}</b></button>`).join("") || `<p class="muted">No hay resultados calculables en este corte.</p>`}</div></section>`;
    const overdue = S().initiatives.filter(isOverdue);
    return `${pageHead("Dashboard ejecutivo", `TechPeru SAC · ${periodLabel(cut)} · ${items.length} indicadores`, `${api.canEdit() ? `<button class="btn" data-action="import-excel">↑ Cargar Excel</button>` : ""}<button class="btn" data-action="export-dashboard">↓ Resumen</button><button class="btn primary" data-action="new-measurement">＋ Registrar resultado</button>`)}
    <div class="overview-banner"><div><span class="eyebrow">CUMPLIMIENTO GLOBAL</span><strong>${percent(global)}</strong>${totalBadge(global)}</div><p>Promedio de ${items.filter(k => score(k) !== null).length} KPI calculables. El semáforo y el cumplimiento de la meta se muestran por separado.</p><span class="tag">${S().objectives.length} objetivos · ${S().kpis.length} KPI</span></div>
    <div class="grid metric-grid state-cards">${[["good", "Logrados", "Cumplimiento ≥ 90%", "green"], ["warn", "En riesgo", "Desde 75% hasta menos de 90%", "amber"], ["bad", "Críticos", "Cumplimiento menor a 75%", "red"], ["neutral", "Sin cálculo", "Falta resultado o meta del corte", "blue"]].map(([key, title, note, color]) => `<button class="metric-filter" data-action="filter-status" data-value="${key}">${metricCard(title, c[key], note, key === "good" ? "✓" : "!", color)}</button>`).join("")}</div>
    <div class="grid dashboard-grid"><section class="panel"><div class="panel-head"><div><h2>Desempeño por perspectiva</h2><p>Selecciona una perspectiva para explorar sus objetivos.</p></div></div><div class="perspective-bars">${perspectiveBreakdown().map(p => `<button class="perspective-row perspective-button" data-action="open-perspective" data-value="${p.key}"><span class="perspective-name"><span class="persp-dot" style="background:${p.color}"></span>${p.label}</span><span class="progress-track"><span class="progress-fill" style="display:block;width:${Math.min(100, Math.max(0, p.pct || 0))}%;background:${p.color}"></span></span><strong>${percent(p.pct)}</strong></button>`).join("")}</div><div class="chart-wrap short"><canvas id="perspectiveChart" aria-label="Cumplimiento por perspectiva"></canvas></div></section>
    <section class="panel"><div class="panel-head"><div><h2 id="secondaryChartTitle">Distribución del semáforo</h2><p id="secondaryChartNote">${h(periodLabel(cut))}. No se genera una tendencia con un único dato.</p></div></div><div class="chart-wrap"><canvas id="secondaryChart" aria-label="Distribución o evolución de cumplimiento"></canvas></div></section></div>
    <div class="grid two-columns">${ranking(rank.slice(0, 5), "Indicadores prioritarios", "Los cinco cumplimientos más bajos del corte.")}${ranking([...rank].reverse().slice(0, 5), "Mejor desempeño", "Los cinco cumplimientos más altos del corte.")}</div>
    <section class="panel action-summary"><div><h2>Seguimiento de acciones</h2><p>${S().initiatives.length} planes registrados · <strong>${overdue.length} vencidos</strong> · ${S().initiatives.filter(i => i.status === "Finalizada").length} finalizados</p></div><button class="btn" data-action="go-actions">Ver planes de acción →</button></section>`;
  }
  function drawDashboardCharts() {
    dashboardCharts.forEach(chart => chart.destroy()); dashboardCharts = [];
    if (!window.Chart) return;
    const per = perspectiveBreakdown();
    const baseOptions = { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, suggestedMax: 100, ticks: { callback: v => v + "%" } }, x: { grid: { display: false }, ticks: { font: { size: 10 } } } } };
    dashboardCharts.push(new Chart($("#perspectiveChart"), { type: "bar", data: { labels: per.map(p => p.label), datasets: [{ data: per.map(p => p.pct), backgroundColor: per.map(p => p.color), borderRadius: 7 }] }, options: baseOptions }));
    let labels = [], values = [], description = "";
    for (const grain of ["month", "quarter"]) {
      const cuts = periods().filter(p => grain === "month" ? /^20\d{2}-\d{2}$/.test(p) : /^20\d{2}-Q[1-4]$/.test(p));
      const results = cuts.map(p => average(S().kpis.map(k => score(effective(k, p)))));
      if (results.filter(v => v !== null).length >= 2) { labels = cuts; values = results; description = grain === "month" ? "Cortes mensuales con sus propias metas; sin mezclar el acumulado anual." : "Cortes trimestrales con sus propias metas."; break; }
    }
    if (labels.length < 2 && store.years().length >= 2) {
      labels = store.years(); values = labels.map(year => average((year === S().period ? S().kpis : store.year(year).kpis).map(score)));
      description = "Comparación de promedios anuales. Cada ejercicio puede contener un catálogo diferente.";
    }
    if (values.filter(v => v !== null).length >= 2) {
      $("#secondaryChartTitle").textContent = "Evolución de cumplimiento"; $("#secondaryChartNote").textContent = description;
      dashboardCharts.push(new Chart($("#secondaryChart"), { type: "line", data: { labels, datasets: [{ data: values, borderColor: "#2563eb", backgroundColor: "#2563eb16", fill: true, pointRadius: 4, spanGaps: false }] }, options: baseOptions }));
    } else {
      const c = counts(); dashboardCharts.push(new Chart($("#secondaryChart"), { type: "doughnut", data: { labels: ["Logrados", "En riesgo", "Críticos", "Sin cálculo"], datasets: [{ data: [c.good, c.warn, c.bad, c.neutral], backgroundColor: ["#18a875", "#e99a2d", "#d64b59", "#b2bdcc"], borderWidth: 3 }] }, options: { responsive: true, maintainAspectRatio: false, animation: false, cutout: "70%", plugins: { legend: { position: "bottom" } } } }));
    }
  }

  function renderPerspectives() {
    return `${pageHead("Perspectivas", "Explora cada perspectiva, sus objetivos y sus indicadores del corte seleccionado.")}
    <div class="perspective-tabs" role="tablist" aria-label="Perspectivas del BSC">${Object.entries(perspectives).map(([key, p]) => `<button role="tab" aria-selected="${key === perspectiveTab}" class="perspective-tab ${key === perspectiveTab ? "active" : ""}" data-action="open-perspective" data-value="${key}" style="--perspective-color:${p.color}">${p.label}<span>${S().kpis.filter(k => k.perspective === key).length} KPI</span></button>`).join("")}</div>
    <section class="panel"><div class="panel-head"><div><h2>${label(perspectiveTab)}</h2><p>${h(periodLabel(cut))} · ${S().objectives.filter(o => o.perspective === perspectiveTab).length} objetivos</p></div>${totalBadge(average(viewKpis().filter(k => k.perspective === perspectiveTab).map(score)))}</div>
    ${S().objectives.filter(o => o.perspective === perspectiveTab).map(o => `<details class="objective-group" open><summary><span><b>${h(o.id)}</b> ${h(o.name)}</span><strong>${percent(average(viewKpis().filter(k => k.objectiveId === o.id).map(score)))}</strong></summary>${kpiTable(viewKpis().filter(k => k.objectiveId === o.id))}</details>`).join("") || `<div class="empty-state">No hay objetivos en esta perspectiva.</div>`}</section>`;
  }
  function filteredKpis(prefix = "filter") {
    const q = ($("#" + prefix + "Search")?.value || "").toLowerCase(), p = $("#" + prefix + "Perspective")?.value || "", st = $("#" + prefix + "Status")?.value || "", owner = $("#" + prefix + "Owner")?.value || "";
    return viewKpis().filter(k => (!q || `${k.id} ${k.name} ${objectiveName(k.objectiveId)} ${k.analysis} ${k.recommendation}`.toLowerCase().includes(q)) && (!p || k.perspective === p) && (!st || statusOf(k).key === st) && (!owner || k.owner === owner));
  }
  function filters(prefix) {
    return `<div class="toolbar"><div class="search-box"><input id="${prefix}Search" placeholder="Buscar indicador, objetivo o análisis…" aria-label="Buscar indicadores"></div><select id="${prefix}Perspective" aria-label="Filtrar perspectiva"><option value="">Todas las perspectivas</option>${Object.entries(perspectives).map(([key, p]) => option(key, p.label, "")).join("")}</select><select id="${prefix}Status" aria-label="Filtrar estado"><option value="">Todos los estados</option>${[["good", "Logrados"], ["warn", "En riesgo"], ["bad", "Críticos"], ["neutral", "Sin cálculo"]].map(([key, text]) => option(key, text, "")).join("")}</select><select id="${prefix}Owner" aria-label="Filtrar responsable"><option value="">Todos los responsables</option>${[...new Set(S().kpis.map(k => k.owner))].map(n => option(n, n, "")).join("")}</select></div>`;
  }
  function renderKpis() {
    return `${pageHead("Indicadores (KPI)", `Metas, resultados y brechas · ${periodLabel(cut)}`, api.canEdit() ? `<button class="btn primary" data-action="new-kpi">＋ Nuevo indicador</button>` : "")}${filters("filter")}<div class="table-panel" id="filteredKpis">${kpiTable(viewKpis())}</div><p class="form-note">Logrado desde 90% de cumplimiento. “Meta alcanzada” indica que se llegó al 100% o se mejoró la meta según el sentido del indicador.</p>`;
  }
  function matrixTable(items) {
    const blocks = Object.entries(perspectives).map(([key, p]) => {
      const list = items.filter(k => k.perspective === key); if (!list.length) return "";
      return `<section class="matrix-section"><h2 style="border-left-color:${p.color}">${p.label} <small>${list.length} indicadores</small></h2>${S().objectives.filter(o => o.perspective === key).map(o => {
        const linked = list.filter(k => k.objectiveId === o.id); if (!linked.length) return "";
        return `<details class="objective-group" open><summary>${h(o.id)} · ${h(o.name)} <span>${linked.length} KPI</span></summary>${table(["Indicador", "Unidad / sentido", "Meta", "Real", "% cumplimiento", "Estado", "Brecha", "Análisis del resultado", "Acción recomendada"], linked.map(k => [`<button class="inline-link" data-action="kpi-detail" data-id="${h(k.id)}">${h(k.name)}</button>`, `${h(k.unit)}<span class="subcell">${h(direction(k))}</span>`, fmt(k.target, 2), fmt(k.current, 2), percent(score(k)), badge(k), h(gap(k)), `<span class="long-cell">${h(k.analysis || "Por analizar")}</span>`, `<span class="long-cell">${h(k.recommendation || "Por definir")}</span>${api.canEdit() ? `<button class="text-action" data-action="action-from-kpi" data-id="${h(k.id)}">Crear plan</button>` : ""}`]))}</details>`;
      }).join("")}${list.some(k => !S().objectives.some(o => o.id === k.objectiveId)) ? kpiTable(list.filter(k => !S().objectives.some(o => o.id === k.objectiveId))) : ""}</section>`;
    }).join("");
    return blocks || `<div class="empty-state">No hay indicadores con los filtros seleccionados.</div>`;
  }
  function renderMatrix() {
    return `${pageHead("Matriz BSC completa", `La información del Excel, organizada por perspectiva y objetivo · ${periodLabel(cut)}`, `<button class="btn" data-action="matrix-csv">↓ CSV</button><button class="btn primary" data-action="matrix-xlsx">↓ Excel</button>`)}${filters("matrix")}<div class="panel" id="matrixResults">${matrixTable(viewKpis())}</div>`;
  }
  function renderObjectives() {
    return `${pageHead("Objetivos estratégicos", "Consulta el desempeño de los objetivos y sus indicadores asociados.", api.canEdit() ? `<button class="btn primary" data-action="new-objective">＋ Nuevo objetivo</button>` : "")}<div class="grid objective-cards">${S().objectives.map(o => {
      const ks = viewKpis().filter(k => k.objectiveId === o.id), value = average(ks.map(score));
      return `<article class="panel objective-summary"><span class="eyebrow">${h(o.id)} · ${h(label(o.perspective))}</span><h2>${h(o.name)}</h2><p>${h(o.description || "Sin descripción adicional")}</p><div class="objective-score"><strong>${percent(value)}</strong>${totalBadge(value)}</div><small>${ks.length} indicadores · ${h(o.owner)}</small><div class="head-actions"><button class="btn small" data-action="objective-detail" data-id="${h(o.id)}">Ver indicadores</button>${api.canEdit() ? `<button class="text-action" data-action="edit-objective" data-id="${h(o.id)}">Editar</button><button class="text-action" data-action="delete-objective" data-id="${h(o.id)}">Eliminar</button>` : ""}</div></article>`;
    }).join("")}</div>`;
  }
  function showObjectiveDetail(id) {
    const o = S().objectives.find(x => x.id === id); if (!o) return;
    const items = viewKpis().filter(k => k.objectiveId === id);
    showModal(o.name, `<p class="eyebrow">${h(o.id)} · ${h(periodLabel(cut))}</p><p>${h(o.description)}</p><div class="objective-score"><strong>${percent(average(items.map(score)))}</strong>${totalBadge(average(items.map(score)))}</div>${kpiTable(items)}`, "Cerrar", closeModal, "OBJETIVO ESTRATÉGICO");
  }

  function openKpiForm(id = null) {
    if (!api.canEdit()) return api.toast("Tu rol no permite modificar indicadores.", "error");
    const existing = S().kpis.find(k => k.id === id);
    const k = existing || { name: "", objectiveId: "", unit: "%", direction: "mayor", target: null, current: null, owner: "Responsable por asignar", area: S().areas[0] || "General", baseline: null, frequency: "Anual", formula: "", analysis: "", recommendation: "", alertAt: 90, criticalAt: 75, lower: null, upper: null };
    const body = `<form class="detail-form-grid">${input("Nombre del indicador *", "kName", k.name)}${select("Objetivo asociado *", "kObjective", objectives(k.objectiveId))}${input("Unidad *", "kUnit", k.unit)}${select("Sentido del indicador", "kDirection", [["mayor", "Mayor es mejor"], ["menor", "Menor es mejor"], ["rango", "Dentro de un rango"]].map(([value, text]) => option(value, text, k.direction)).join(""))}${input(`Meta anual ${S().period} (por definir si queda vacía)`, "kTarget", k.target, "number", 'step="any"')}${input("Resultado anual", "kCurrent", k.current, "number", `step="any" ${existing ? "readonly" : ""}`)}${select("Responsable", "kOwner", owners(k.owner))}${input("Área *", "kArea", k.area, "text", 'list="areaSuggestions"')}<datalist id="areaSuggestions">${S().areas.map(a => `<option value="${h(a)}"></option>`).join("")}</datalist>${textarea("Análisis del resultado", "kAnalysis", k.analysis)}${textarea("Acción recomendada", "kRecommendation", k.recommendation)}<details class="advanced-fields full-span"><summary>Ficha técnica y umbrales</summary><div class="detail-form-grid">${input("Fórmula descriptiva", "kFormula", k.formula)}${select("Frecuencia de seguimiento", "kFrequency", ["Mensual", "Trimestral", "Semestral", "Anual"].map(f => option(f, f, k.frequency)).join(""))}${input("Línea base (opcional)", "kBaseline", k.baseline, "number", 'step="any"')}${input("Verde desde (%)", "kAlert", k.alertAt, "number", 'min="0" max="100" step="any"')}${input("Ámbar desde (%)", "kCritical", k.criticalAt, "number", 'min="0" max="100" step="any"')}${input("Límite inferior (solo rango)", "kLower", k.lower, "number", 'step="any"')}${input("Límite superior (solo rango)", "kUpper", k.upper, "number", 'step="any"')}</div></details><p class="form-note full-span">La meta de esta ficha es anual. Las metas mensuales y trimestrales se definen por corte desde el detalle. ${existing ? "Para cambiar el resultado, registra una medición." : "El resultado inicial es opcional."}</p></form>`;
    showModal(existing ? "Editar indicador" : "Nuevo indicador", body, "Guardar indicador", () => {
      required(["kName", "kObjective", "kUnit", "kArea"]);
      const objective = S().objectives.find(o => o.id === $("#kObjective").value), target = number($("#kTarget").value), alertAt = number($("#kAlert").value), criticalAt = number($("#kCritical").value), directionValue = $("#kDirection").value;
      if (!objective || (target !== null && target <= 0) || alertAt === null || criticalAt === null || alertAt > 100 || alertAt < criticalAt || criticalAt < 0) throw new Error("Define una meta positiva o déjala pendiente; revisa los umbrales: 0 ≤ ámbar ≤ verde ≤ 100.");
      const lower = number($("#kLower").value), upper = number($("#kUpper").value);
      if (directionValue === "rango" && (lower === null || upper === null || lower > upper)) throw new Error("Define un rango válido.");
      const payload = { name: $("#kName").value.trim(), objectiveId: objective.id, perspective: objective.perspective, unit: $("#kUnit").value.trim(), direction: directionValue, target, owner: $("#kOwner").value, area: $("#kArea").value.trim(), analysis: $("#kAnalysis").value.trim(), recommendation: $("#kRecommendation").value.trim(), baseline: number($("#kBaseline").value), frequency: $("#kFrequency").value, formula: $("#kFormula").value.trim() || (directionValue === "menor" ? "Meta / Real × 100" : "Real / Meta × 100"), lower, upper, alertAt, criticalAt, weight: 1, calculation: "excel" };
      if (S().kpis.some(other => other.id !== id && normalize(other.name) === normalize(payload.name))) throw new Error("Ya existe un indicador con ese nombre.");
      if (existing) Object.assign(existing, payload);
      else {
        let index = S().kpis.length + 1, newId; do { newId = `KPI-${S().period}-${String(index++).padStart(3, "0")}`; } while (S().kpis.some(item => item.id === newId));
        const actual = number($("#kCurrent").value), created = { id: newId, ...payload, current: actual, measurements: [], targets: {} };
        if (actual !== null) created.measurements.push({ id: uid("M"), period: S().period, date: "", value: actual, target, recordedAt: new Date().toISOString(), responsible: payload.owner, notes: "Resultado inicial registrado en la ficha del indicador.", evidence: [] });
        S().kpis.push(created);
      }
      if (!S().areas.includes(payload.area)) S().areas.push(payload.area);
      audit(existing ? "Edición" : "Creación", "Indicador", payload.name); notifySaved("Indicador guardado");
    });
  }
  function openTarget(id) {
    if (!api.canEdit()) return;
    const k = S().kpis.find(item => item.id === id); if (!k) return;
    showModal("Definir meta del corte", `<p>${h(k.name)} · ${h(k.unit)}</p><form class="detail-form-grid">${input("Corte: AAAA, AAAA-MM o AAAA-Q1 *", "targetPeriod", cut)}${input("Meta del corte *", "targetValue", effective(k).target, "number", 'step="any"')}</form><p class="form-note">La meta anual no se divide automáticamente entre meses o trimestres.</p>`, "Guardar meta", () => {
      const period = $("#targetPeriod").value.trim(), target = number($("#targetValue").value);
      if (!validPeriod(period) || target === null || target <= 0) throw new Error("Indica un corte válido del ejercicio activo y una meta positiva.");
      if (period === S().period) k.target = target; else k.targets[period] = target;
      audit("Meta del corte", "Indicador", `${k.name}: ${period} → ${target}`); cut = period; notifySaved("Meta del corte guardada");
    });
    $("#targetPeriod").onchange = () => { $("#targetValue").value = effective(k, $("#targetPeriod").value.trim()).target ?? ""; };
  }
  function showKpiDetail(id) {
    const raw = S().kpis.find(k => k.id === id); if (!raw) return;
    const k = effective(raw), history = [...raw.measurements].sort((a, b) => b.period.localeCompare(a.period) || (b.recordedAt || b.date).localeCompare(a.recordedAt || a.date));
    showModal(k.name, `<span class="eyebrow">${h(k.id)} · ${h(label(k.perspective))} · ${h(periodLabel(cut))}</span><div class="detail-score-grid"><div><small>Resultado</small><strong>${fmt(k.current, 2)} ${h(k.unit)}</strong></div><div><small>Meta del corte</small><strong>${fmt(k.target, 2)} ${h(k.unit)}</strong></div><div><small>Cumplimiento</small><strong>${percent(score(k))}</strong>${badge(k)}</div></div><div class="gap-callout">${h(gap(k))} <span class="direction-tag">${h(direction(k))}</span></div><p class="form-note">Verde no implica necesariamente haber alcanzado la meta completa. Meta alcanzada: ≥100% de cumplimiento o resultado dentro del rango.</p><div class="grid two-columns"><section class="analysis-box"><h3>Análisis del resultado</h3><p>${h(raw.analysis || "Por analizar")}</p></section><section class="analysis-box"><h3>Acción recomendada</h3><p>${h(raw.recommendation || "Por definir")}</p>${api.canEdit() ? `<button class="btn small" data-action="action-from-kpi" data-id="${h(id)}">Crear plan de acción</button>` : ""}</section></div><p class="form-note"><strong>Objetivo:</strong> ${h(objectiveName(k.objectiveId))}<br><strong>Responsable:</strong> ${h(k.owner)} · <strong>Área:</strong> ${h(k.area)}<br><strong>Fórmula descriptiva:</strong> ${h(k.formula)}<br><strong>Frecuencia:</strong> ${h(k.frequency)}</p><div class="head-actions">${api.canEdit() ? `<button class="btn small" data-action="edit-kpi" data-id="${h(id)}">Editar ficha y análisis</button><button class="btn small" data-action="edit-target" data-id="${h(id)}">Definir meta por corte</button>` : ""}</div><h3>Metas por corte</h3>${table(["Corte", "Meta"], [[h(periodLabel(S().period)), `${fmt(raw.target, 2)} ${h(raw.unit)}`], ...Object.entries(raw.targets).sort().map(([period, value]) => [h(periodLabel(period)), `${fmt(value, 2)} ${h(raw.unit)}`])])}<h3>Historial de mediciones</h3>${measurementTable(history.map(m => ({ ...m, kpi: raw })))}`, "Registrar medición", () => openMeasurementForm(null, id), "FICHA DEL INDICADOR");
  }
  function dateMatches(period, date) {
    if (!date) return true;
    if (!date.startsWith(S().period + "-")) return false;
    if (period.includes("Q")) return Math.ceil(Number(date.slice(5, 7)) / 3) === Number(period.slice(-1));
    return date.startsWith(period);
  }
  function openMeasurementForm(measureId = null, kpiId = null) {
    let sourceKpi = S().kpis.find(k => k.id === kpiId), existing;
    if (measureId) { sourceKpi = S().kpis.find(k => k.measurements.some(m => m.id === measureId)); existing = sourceKpi?.measurements.find(m => m.id === measureId); }
    sourceKpi ||= S().kpis[0]; if (!sourceKpi) return api.toast("Primero registra un indicador.", "error");
    const measurement = existing || { period: cut || S().period, date: "", value: "", notes: "", responsible: sourceKpi.owner, evidence: [] };
    const mTarget = existing && existing.target !== undefined ? existing.target : effective(sourceKpi, measurement.period).target;
    showModal(existing ? "Editar medición" : "Registrar resultado", `<form class="detail-form-grid">${select("Indicador *", "mKpi", S().kpis.map(k => option(k.id, k.id + " · " + k.name, sourceKpi.id)).join(""))}${input("Corte: AAAA, AAAA-MM o AAAA-Q1 *", "mPeriod", measurement.period)}${input("Fecha de medición (opcional)", "mDate", measurement.date, "date")}${input(`Resultado (${sourceKpi.unit}) *`, "mValue", measurement.value, "number", 'step="any"')}${input("Meta aplicada a este corte *", "mTarget", mTarget, "number", `step="any" ${api.canEdit() ? "" : "readonly"}`)}${select("Responsable del registro", "mOwner", owners(measurement.responsible))}${textarea("Observaciones", "mNotes", measurement.notes)}<div class="field full-span"><label for="mEvidence">Evidencias: hasta 3 archivos por medición</label><input id="mEvidence" type="file" multiple accept="image/png,image/jpeg,image/webp,application/pdf"><small class="form-note">PNG, JPG, WebP o PDF · hasta 5 MB por archivo. Conserva las evidencias con el respaldo ZIP.</small>${(measurement.evidence || []).map(e => `<label class="evidence-keep"><input type="checkbox" data-keep-evidence="${h(e.id)}" checked> Conservar ${h(e.name)}</label>`).join("")}</div><p class="form-note full-span">Las metas mensuales y trimestrales son independientes de la anual. Cada medición conserva la meta con la que fue registrada.</p></form>`, "Guardar resultado", async () => {
      required(["mKpi", "mPeriod", "mValue", "mTarget"]);
      const targetKpi = S().kpis.find(k => k.id === $("#mKpi").value), period = $("#mPeriod").value.trim(), date = $("#mDate").value;
      const value = number($("#mValue").value), target = number($("#mTarget").value);
      if (!targetKpi || !validPeriod(period) || value === null || target === null || target <= 0 || !dateMatches(period, date)) throw new Error("Revisa el corte, la fecha, el valor y la meta positiva.");
      if (!api.canEdit() && effective(targetKpi, period).target !== target) throw new Error("Solicita al administrador o gerente que defina la meta del corte.");
      const keep = (measurement.evidence || []).filter(e => $(`[data-keep-evidence="${CSS.escape(e.id)}"]`)?.checked), files = [...$("#mEvidence").files];
      if (keep.length + files.length > 3) throw new Error("Solo se admiten 3 evidencias por medición.");
      const added = await BSCStorage.evidence.add(files);
      try {
        if (existing && sourceKpi !== targetKpi) sourceKpi.measurements = sourceKpi.measurements.filter(m => m.id !== existing.id);
        const payload = { id: existing?.id || uid("M"), period, date, value, target, recordedAt: new Date().toISOString(), notes: $("#mNotes").value.trim(), responsible: $("#mOwner").value, evidence: [...keep, ...added] };
        if (existing && sourceKpi === targetKpi) Object.assign(existing, payload); else targetKpi.measurements.push(payload);
        if (period === S().period) targetKpi.target = target; else targetKpi.targets[period] = target;
        for (const k of new Set([sourceKpi, targetKpi])) k.current = latest(k, S().period)?.value ?? null;
        audit(existing ? "Corrección de medición" : "Medición", targetKpi.name, `${period}: ${value} ${targetKpi.unit}; meta ${target}.`);
        cut = period; notifySaved("Resultado guardado con su meta y evidencias", api.getPage());
      } catch (error) { await Promise.all(added.map(e => BSCStorage.evidence.remove(e.id))); throw error; }
    });
    const update = () => {
      const k = S().kpis.find(x => x.id === $("#mKpi").value), period = $("#mPeriod").value.trim();
      $("#mTarget").value = effective(k, period).target ?? ""; $("#mOwner").value = k.owner;
      $("#mValue").parentElement.querySelector("label").textContent = `Resultado (${k.unit}) *`;
    };
    $("#mKpi").onchange = update; $("#mPeriod").onchange = update;
  }
  function measurementTable(items) {
    return table(["Corte", "Fecha", "Indicador", "Valor", "Meta registrada", "Cumplimiento", "Responsable", "Observaciones / evidencias", "Acciones"], items.map(m => {
      const captured = { ...m.kpi, target: m.target ?? null, current: m.value }, evidence = m.evidence || [];
      return [h(periodLabel(m.period)), h(m.date || "Sin fecha indicada"), `<span class="code">${h(m.kpi.id)}</span><span class="subcell">${h(m.kpi.name)}</span>`, `${fmt(m.value, 2)} ${h(m.kpi.unit)}`, fmt(m.target, 2), percent(score(captured)), h(m.responsible), `<span class="long-cell">${h(m.notes || "—")}</span>${evidence.length ? `<button class="text-action" data-action="measurement-evidence" data-id="${h(m.id)}">${evidence.length} evidencia(s)</button>` : ""}`, `<button class="text-action" data-action="edit-measurement" data-id="${h(m.id)}" data-kpi="${h(m.kpi.id)}">Editar</button>`];
    }));
  }
  function allMeasurements() { return S().kpis.flatMap(k => k.measurements.map(m => ({ ...m, kpi: k }))).sort((a, b) => b.period.localeCompare(a.period) || (b.recordedAt || b.date).localeCompare(a.recordedAt || a.date)); }
  function filteredMeasurements() {
    const q = ($("#mSearch")?.value || "").toLowerCase(), kpi = $("#mFilterKpi")?.value || "", period = $("#mFilterPeriod")?.value || "";
    return allMeasurements().filter(m => (!q || `${m.kpi.name} ${m.notes} ${m.responsible}`.toLowerCase().includes(q)) && (!kpi || m.kpi.id === kpi) && (!period || m.period === period));
  }
  function renderMeasurements() {
    return `${pageHead("Registro de resultados", "Cada corte conserva su meta, historial, observaciones y evidencias.", `<button class="btn primary" data-action="new-measurement">＋ Registrar medición</button>`)}<div class="toolbar"><div class="search-box"><input id="mSearch" placeholder="Buscar indicador, nota o responsable…" aria-label="Buscar mediciones"></div><select id="mFilterKpi" aria-label="Filtrar indicador"><option value="">Todos los indicadores</option>${kpis("").replace('<option value="">Sin indicador específico</option>', "")}</select><select id="mFilterPeriod" aria-label="Filtrar corte"><option value="">Todos los cortes</option>${periods().map(p => option(p, periodLabel(p), "")).join("")}</select><button class="btn" data-action="measurement-csv">↓ CSV filtrado</button></div><div class="table-panel" id="measurementResults">${measurementTable(allMeasurements())}</div>`;
  }
  function measurementEvidence(id) {
    const record = allMeasurements().find(m => m.id === id); if (!record) return;
    showModal("Evidencias de la medición", `<p>${h(record.kpi.name)} · ${h(periodLabel(record.period))}</p>${(record.evidence || []).map(e => `<div class="evidence-item"><div><strong>${h(e.name)}</strong><small>${fmt(e.size / 1024, 1)} KB</small></div><button class="btn small" data-action="view-evidence" data-id="${h(e.id)}">Ver</button><button class="btn small" data-action="download-evidence" data-id="${h(e.id)}">Descargar</button></div>`).join("")}`, "Cerrar", closeModal, "RESPALDO DEL RESULTADO");
  }
  async function evidenceFile(id, download = false) {
    const record = await BSCStorage.evidence.get(id);
    if (!record?.blob) throw new Error("La evidencia no está en este navegador. Restaura el respaldo ZIP que contiene el archivo.");
    if (download) return BSCExport.download(record.name, record.blob);
    const url = URL.createObjectURL(record.blob); urls.push(url);
    showModal(record.name, record.type === "application/pdf" ? `<iframe class="evidence-preview" src="${url}" title="Documento PDF adjunto"></iframe>` : `<img class="evidence-image" src="${url}" alt="${h(record.name)}">`, "Cerrar", closeModal, "EVIDENCIA");
  }

  function isOverdue(i) { return Boolean(i.end && i.end < today() && i.progress < 100 && !["Finalizada", "Cancelada"].includes(i.status)); }
  function canFollow(i) { return S().exerciseStatus !== "Cerrado" && (api.canEdit() || i.owner === api.getUser()?.name); }
  function actionTable(items) {
    return table(["Plan de acción", "Objetivo / indicador", "Responsable", "Vencimiento", "Avance", "Estado", "Acciones"], items.map(i => [`<strong>${h(i.name)}</strong><span class="subcell">${h(i.id)}</span>`, `${h(objectiveName(i.objectiveId))}<span class="subcell">${h(kpiName(i.kpiId))}</span>`, h(i.owner), `${h(i.end || "Por definir")}${isOverdue(i) ? '<span class="status bad">Vencido</span>' : ""}`, `<div class="initiative-progress"><div class="progress-track"><div class="progress-fill" style="width:${Math.max(0, Math.min(100, i.progress))}%"></div></div><b>${fmt(i.progress)}%</b></div>`, `<span class="status ${i.status === "Finalizada" ? "good" : i.status === "En riesgo" || isOverdue(i) ? "bad" : "neutral"}">${h(i.status)}</span>`, `<button class="text-action" data-action="initiative-detail" data-id="${h(i.id)}">Seguimiento</button>${api.canEdit() ? `<button class="text-action" data-action="edit-initiative" data-id="${h(i.id)}">Editar plan</button><button class="text-action" data-action="delete-initiative" data-id="${h(i.id)}">Eliminar</button>` : ""}`]));
  }
  function filteredActions() {
    const q = ($("#actionSearch")?.value || "").toLowerCase(), status = $("#actionStatus")?.value || "", owner = $("#actionOwner")?.value || "";
    return S().initiatives.filter(i => (!q || `${i.name} ${i.description} ${kpiName(i.kpiId)}`.toLowerCase().includes(q)) && (!status || (status === "vencida" ? isOverdue(i) : i.status === status)) && (!owner || i.owner === owner));
  }
  function renderInitiatives() {
    return `${pageHead("Planes de acción", "Convierte las recomendaciones en actividades, responsables, plazos y seguimiento.", api.canEdit() ? `<button class="btn primary" data-action="new-initiative">＋ Nuevo plan</button>` : "")}<div class="grid metric-grid">${metricCard("Planes registrados", S().initiatives.length, "Sin planes inventados a partir del Excel", "◈")}${metricCard("En ejecución", S().initiatives.filter(i => i.status === "En ejecución").length, "Seguimiento activo", "↗", "green")}${metricCard("Vencidos", S().initiatives.filter(isOverdue).length, "Pendientes fuera de plazo", "!", "red")}${metricCard("Finalizados", S().initiatives.filter(i => i.status === "Finalizada").length, "Avance completado", "✓", "green")}</div><div class="toolbar"><div class="search-box"><input id="actionSearch" placeholder="Buscar plan, indicador o descripción…" aria-label="Buscar planes"></div><select id="actionStatus" aria-label="Estado del plan"><option value="">Todos los estados</option>${["Planificada", "En ejecución", "En riesgo", "Finalizada", "Cancelada", "vencida"].map(status => option(status, status === "vencida" ? "Solo vencidos" : status, "")).join("")}</select><select id="actionOwner" aria-label="Responsable del plan"><option value="">Todos los responsables</option>${[...new Set(S().initiatives.map(i => i.owner))].map(n => option(n, n, "")).join("")}</select></div><div class="table-panel" id="actionResults">${actionTable(S().initiatives)}</div>`;
  }
  function openInitiativeForm(id = null, fromKpi = null) {
    if (!api.canEdit()) return;
    const existing = S().initiatives.find(i => i.id === id), k = S().kpis.find(k => k.id === fromKpi);
    const i = existing || { name: k ? "Mejora de " + k.name : "", objectiveId: k?.objectiveId || "", kpiId: k?.id || "", owner: "Responsable por asignar", area: k?.area || "", start: today(), end: "", budget: null, description: k?.recommendation || "" };
    showModal(existing ? "Editar plan de acción" : "Nuevo plan de acción", `<form class="detail-form-grid">${input("Nombre del plan *", "iName", i.name)}${select("Objetivo *", "iObjective", objectives(i.objectiveId))}${select("Indicador vinculado", "iKpi", kpis(i.kpiId))}${select("Responsable", "iOwner", owners(i.owner))}${input("Área", "iArea", i.area)}${input("Inicio *", "iStart", i.start, "date")}${input("Fecha límite *", "iEnd", i.end, "date")}${input("Presupuesto en S/ (opcional)", "iBudget", i.budget, "number", 'min="0" step="any"')}${textarea("Descripción y acción propuesta", "iDescription", i.description)}<p class="form-note full-span">${k ? "La descripción recoge la recomendación del Excel. Define el responsable y el plazo antes de ejecutarla." : "El avance, las actividades y las notas se registran en Seguimiento."}</p></form>`, "Guardar plan", () => {
      required(["iName", "iObjective", "iStart", "iEnd"]);
      const objectiveId = $("#iObjective").value, kpiId = $("#iKpi").value, linkedKpi = S().kpis.find(k => k.id === kpiId), start = $("#iStart").value, end = $("#iEnd").value, budget = number($("#iBudget").value);
      if (end < start || (budget !== null && budget < 0)) throw new Error("Revisa las fechas y el presupuesto.");
      if (linkedKpi && linkedKpi.objectiveId !== objectiveId) throw new Error("El indicador debe pertenecer al objetivo seleccionado.");
      const payload = { name: $("#iName").value.trim(), objectiveId, kpiId, owner: $("#iOwner").value, area: $("#iArea").value.trim(), start, end, budget, description: $("#iDescription").value.trim() };
      if (existing) Object.assign(existing, payload); else S().initiatives.push({ id: uid("PLAN"), ...payload, progress: 0, status: "Planificada", tasks: [], updates: [{ date: new Date().toISOString(), user: api.getUser().name, note: "Plan creado", progress: 0, status: "Planificada" }] });
      audit(existing ? "Edición" : "Creación", "Plan de acción", payload.name); notifySaved("Plan de acción guardado");
    });
    $("#iKpi").onchange = () => { const selected = S().kpis.find(k => k.id === $("#iKpi").value); if (selected) { $("#iObjective").value = selected.objectiveId; $("#iArea").value = selected.area; } };
  }
  function showInitiativeDetail(id) {
    const i = S().initiatives.find(i => i.id === id); if (!i) return;
    const editable = canFollow(i);
    const body = `<div class="info-box"><strong>${h(i.name)}</strong><p>${h(i.description || "Sin descripción")}</p><p>${h(objectiveName(i.objectiveId))} · ${h(kpiName(i.kpiId))}<br>Responsable: ${h(i.owner)}<br>Plazo: ${h(i.start)} → ${h(i.end)} ${isOverdue(i) ? '<span class="status bad">Vencido</span>' : ""}<br>Presupuesto: ${i.budget === null || i.budget === undefined ? "No definido" : currency(i.budget)}</p></div><h3>Actividades del plan</h3><div class="task-list">${i.tasks.map(task => `<label><input type="checkbox" data-task="${h(task.id)}" ${task.done ? "checked" : ""} ${editable ? "" : "disabled"}>${h(task.name)}</label>`).join("") || '<p class="muted">Aún no se han registrado actividades.</p>'}</div>${editable ? `<form class="detail-form-grid">${textarea("Agregar actividades (una por línea)", "pNewTasks")}${input("Avance (%)", "pProgress", i.progress, "number", `min="0" max="100" ${i.tasks.length ? "readonly" : ""}`)}${select("Estado", "pStatus", ["Planificada", "En ejecución", "En riesgo", "Finalizada", "Cancelada"].map(status => option(status, status, i.status)).join(""))}${textarea("Nota de seguimiento", "pNote")}<p class="form-note full-span">Si existen actividades, el avance se calcula por actividades completadas. Sin actividades puedes indicar un avance manual.</p></form>` : '<p class="form-note">Solo el responsable asignado, el administrador o el gerente pueden actualizar este plan.</p>'}<h3>Historial de seguimiento</h3>${table(["Fecha", "Usuario", "Avance", "Estado", "Nota"], [...i.updates].reverse().map(u => [h(new Date(u.date).toLocaleString("es-PE")), h(u.user), fmt(u.progress) + "%", h(u.status), `<span class="long-cell">${h(u.note)}</span>`]))}`;
    showModal("Seguimiento del plan", body, editable ? "Guardar seguimiento" : "Cerrar", editable ? () => {
      const tasks = i.tasks.map(task => ({ ...task, done: $(`[data-task="${CSS.escape(task.id)}"]`).checked }));
      $("#pNewTasks").value.split("\n").map(t => t.trim()).filter(Boolean).forEach(name => tasks.push({ id: uid("T"), name, done: false }));
      const progress = tasks.length ? Math.round(tasks.filter(task => task.done).length / tasks.length * 100) : number($("#pProgress").value);
      if (progress === null || progress < 0 || progress > 100) throw new Error("El avance debe estar entre 0 y 100.");
      let status = $("#pStatus").value;
      if (status !== "Cancelada") { if (progress === 100) status = "Finalizada"; else if (status === "Finalizada") throw new Error("Completa las actividades o registra 100% antes de finalizar el plan."); else if (progress > 0 && status === "Planificada") status = "En ejecución"; }
      i.tasks = tasks; i.progress = progress; i.status = status;
      i.updates.push({ date: new Date().toISOString(), user: api.getUser().name, progress, status, note: $("#pNote").value.trim() || "Actualización de avance y actividades." });
      audit("Seguimiento", "Plan de acción", `${i.name}: ${progress}%`); notifySaved("Seguimiento guardado");
    } : closeModal, "PLAN DE ACCIÓN");
    $$("[data-task]").forEach(box => box.onchange = () => { if ($("#pProgress")) $("#pProgress").value = Math.round($$("[data-task]:checked").length / i.tasks.length * 100); });
  }
  function confirmDelete(type, id) {
    if (type === "usuario" ? !api.canAdmin() : !api.canEdit()) return api.toast("Tu rol no permite eliminar este registro.", "error");
    const collection = { objetivo: "objectives", KPI: "kpis", iniciativa: "initiatives", usuario: "users" }[type], item = S()[collection]?.find(item => item.id === id); if (!item) return;
    if (type === "usuario" && (id === "u1" || id === api.getUser().id)) return api.toast("No puedes eliminar esta cuenta administrativa o tu propia sesión.", "error");
    if (type === "objetivo" && S().kpis.some(k => k.objectiveId === id)) return showModal("Objetivo con indicadores vinculados", `<div class="info-box">Reasigna o elimina sus indicadores antes de eliminar el objetivo. Así se conservan las relaciones del BSC.</div>`, "Entendido", closeModal);
    showModal("Confirmar eliminación", `<div class="info-box">¿Eliminar <strong>${h(item.name || item.email)}</strong>?${type === "KPI" ? " Se retirarán sus mediciones del ejercicio activo." : ""}<p>Descarga un respaldo si deseas conservar una copia.</p></div>`, "Eliminar registro", () => {
      S()[collection] = S()[collection].filter(item => item.id !== id);
      if (type === "objetivo") { S().links = S().links.filter(l => l.from !== id && l.to !== id); S().initiatives.forEach(i => { if (i.objectiveId === id) i.objectiveId = ""; }); }
      if (type === "KPI") S().initiatives.forEach(i => { if (i.kpiId === id) i.kpiId = ""; });
      audit("Eliminación", type, item.name || item.email); notifySaved("Registro eliminado");
    }, "CONFIRMACIÓN");
  }
  function renderMap() {
    return `${pageHead("Mapa estratégico", "Define qué objetivos impulsan a otros y explica la relación de causa y efecto.", api.canEdit() ? `<button class="btn primary" data-action="new-link">＋ Conectar objetivos</button>` : "")}<section class="panel"><div class="panel-head"><div><h2>Objetivos y relaciones estratégicas</h2><p>${S().links.length} conexiones definidas · ${h(periodLabel(cut))}</p></div></div><div class="map-scroll"><div class="map-board" id="mapBoard"><svg id="causalLines" aria-hidden="true"></svg>${Object.entries(perspectives).map(([key, p]) => `<div class="map-lane"><div class="map-lane-label" style="background:${p.soft};color:${p.color}">${p.label}</div><div class="map-lane-items">${S().objectives.filter(o => o.perspective === key).map(o => { const scoreValue = average(viewKpis().filter(k => k.objectiveId === o.id).map(score)); return `<button class="map-objective" data-map-node="${h(o.id)}" data-action="objective-detail" data-id="${h(o.id)}"><span class="code">${h(o.id)}</span><strong>${h(o.name)}</strong><small>${percent(scoreValue)}</small></button>`; }).join("")}</div></div>`).join("")}</div></div>${!S().links.length ? '<div class="empty-state">Aún no hay conexiones. Define las relaciones que expliquen la estrategia de TechPeru.</div>' : ""}</section><section class="panel"><div class="panel-head"><div><h2>Relaciones definidas</h2><p>Cada conexión puede incluir una explicación.</p></div></div>${table(["Objetivo que impulsa", "Objetivo beneficiado", "Explicación", "Acciones"], S().links.map(l => [h(objectiveName(l.from)), h(objectiveName(l.to)), `<span class="long-cell">${h(l.reason || "Sin explicación adicional")}</span>`, api.canEdit() ? `<button class="text-action" data-action="delete-link" data-id="${h(l.id)}">Eliminar conexión</button>` : "Solo lectura"]))}</section>`;
  }
  function drawMap() {
    const board = $("#mapBoard"), svg = $("#causalLines"); if (!board || !svg) return;
    const rectangle = board.getBoundingClientRect();
    svg.setAttribute("width", board.scrollWidth); svg.setAttribute("height", board.scrollHeight);
    svg.setAttribute("viewBox", `0 0 ${board.scrollWidth} ${board.scrollHeight}`);
    let paths = '<defs><marker id="causalArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#5c7fa9"/></marker></defs>';
    S().links.forEach((l, index) => {
      const from = $(`[data-map-node="${CSS.escape(l.from)}"]`, board)?.getBoundingClientRect(), to = $(`[data-map-node="${CSS.escape(l.to)}"]`, board)?.getBoundingClientRect(); if (!from || !to) return;
      const upwards = to.top < from.top, sameLane = Math.abs(to.top - from.top) < 20;
      let x1 = from.left + from.width / 2 - rectangle.left, y1 = (upwards ? from.top : from.bottom) - rectangle.top;
      let x2 = to.left + to.width / 2 - rectangle.left, y2 = (upwards ? to.bottom : to.top) - rectangle.top;
      const offset = 35 + index % 4 * 7;
      const path = sameLane ? `M ${x1},${y1} C ${x1},${y1 + offset} ${x2},${y2 + offset} ${x2},${y2}` : `M ${x1},${y1} C ${x1},${(y1 + y2) / 2} ${x2},${(y1 + y2) / 2} ${x2},${y2}`;
      paths += `<path d="${path}" fill="none" stroke="#5c7fa9" stroke-width="2" marker-end="url(#causalArrow)"><title>${h(objectiveName(l.from) + " → " + objectiveName(l.to))}</title></path>`;
    });
    svg.innerHTML = paths;
  }
  function openLink() {
    if (!api.canEdit()) return;
    showModal("Conectar objetivos", `<form class="detail-form-grid">${select("Objetivo que impulsa *", "linkFrom", objectives(""))}${select("Objetivo beneficiado *", "linkTo", objectives(""))}${textarea("¿Cómo ayuda un objetivo al otro?", "linkReason")}</form>`, "Crear conexión", () => {
      required(["linkFrom", "linkTo"]); const from = $("#linkFrom").value, to = $("#linkTo").value;
      if (from === to || S().links.some(l => l.from === from && l.to === to)) throw new Error("Selecciona dos objetivos diferentes y una conexión que no exista.");
      const reaches = (node, target, visited = new Set()) => node === target || (!visited.has(node) && (visited.add(node), S().links.filter(l => l.from === node).some(l => reaches(l.to, target, visited))));
      if (reaches(to, from)) throw new Error("Esa conexión formaría un ciclo. Define una cadena de causa y efecto sin regresar al mismo objetivo.");
      S().links.push({ id: uid("LINK"), from, to, reason: $("#linkReason").value.trim() }); audit("Conexión", "Mapa estratégico", from + " → " + to); notifySaved("Conexión creada", "mapa");
    });
  }

  function reportItems() {
    const query = ($("#rSearch")?.value || "").toLowerCase(), perspective = $("#rPerspective")?.value || "", state = $("#rStatus")?.value || "";
    const annual = selectedReport === "comparativo";
    return (annual ? S().kpis.map(k => effective(k, S().period)) : viewKpis()).filter(k => (!query || `${k.name} ${k.id} ${k.owner} ${k.analysis} ${k.recommendation}`.toLowerCase().includes(query)) && (!perspective || k.perspective === perspective) && (!state || selectedReport === "mediciones" || statusOf(k).key === state));
  }
  function kpiReport(items, title = "Detalle de indicadores") {
    return { title, subtitle: `${S().source.organization} · ${periodLabel(cut)} · ${items.length} KPI · Cumplimiento de la selección: ${percent(average(items.map(score)))}`, headers: ["Código", "Perspectiva", "Objetivo", "Indicador", "Unidad", "Sentido", "Meta", "Real", "Cumplimiento (%)", "Estado", "Brecha", "Análisis", "Acción recomendada"], rows: items.map(k => [k.id, label(k.perspective), objectiveName(k.objectiveId), k.name, k.unit, direction(k), k.target, k.current, score(k), statusOf(k).label, gap(k), k.analysis, k.recommendation]) };
  }
  function buildReport() {
    let items = reportItems();
    const base = { title: "Reporte general del BSC", subtitle: `${S().source.organization} · ${periodLabel(cut)}`, headers: [], rows: [] };
    if (["kpis", "matriz", "criticos"].includes(selectedReport)) {
      if (selectedReport === "criticos") items = items.filter(k => statusOf(k).key !== "good");
      return kpiReport(items, selectedReport === "criticos" ? "Indicadores que requieren atención" : selectedReport === "matriz" ? "Matriz BSC completa" : "Detalle de indicadores");
    }
    if (["general", "perspectivas"].includes(selectedReport)) {
      base.title = selectedReport === "general" ? "Reporte general del BSC" : "Desempeño por perspectiva";
      base.headers = ["Perspectiva", "KPI", "Logrados", "En riesgo", "Críticos", "Sin cálculo", "Cumplimiento promedio (%)"];
      base.rows = Object.entries(perspectives).map(([key, p]) => { const selected = items.filter(k => k.perspective === key), c = counts(selected); return [p.label, selected.length, c.good, c.warn, c.bad, c.neutral, average(selected.map(score))]; }).filter(row => row[1] > 0);
      const c = counts(items); base.rows.push(["TOTAL DE LA SELECCIÓN", items.length, c.good, c.warn, c.bad, c.neutral, average(items.map(score))]); return base;
    }
    if (selectedReport === "acciones") {
      const query = ($("#rSearch")?.value || "").toLowerCase(), perspective = $("#rPerspective")?.value || "", status = $("#rActionStatus")?.value || "";
      const plans = S().initiatives.filter(i => (!query || `${i.name} ${i.owner} ${i.description}`.toLowerCase().includes(query)) && (!perspective || S().objectives.find(o => o.id === i.objectiveId)?.perspective === perspective) && (!status || (status === "vencida" ? isOverdue(i) : i.status === status)));
      base.title = "Seguimiento de planes de acción"; base.subtitle = `${S().source.organization} · Ejercicio ${S().period} · ${plans.length} planes`;
      base.headers = ["Código", "Plan", "Objetivo", "Indicador", "Responsable", "Inicio", "Fecha límite", "Presupuesto S/", "Avance (%)", "Estado", "Vencido", "Descripción"];
      base.rows = plans.map(i => [i.id, i.name, objectiveName(i.objectiveId), kpiName(i.kpiId), i.owner, i.start, i.end, i.budget, i.progress, i.status, isOverdue(i) ? "Sí" : "No", i.description]); return base;
    }
    if (selectedReport === "mediciones") {
      const ids = new Set(items.map(k => k.id)), state = $("#rStatus")?.value || "", records = allMeasurements().filter(m => m.period === cut && ids.has(m.kpi.id) && (!state || statusOf({ ...m.kpi, current: m.value, target: m.target ?? null }).key === state));
      base.title = "Historial de mediciones del corte"; base.headers = ["Indicador", "Corte", "Fecha", "Valor", "Unidad", "Meta registrada", "Cumplimiento (%)", "Responsable", "Observaciones", "Evidencias"];
      base.rows = records.map(m => [m.kpi.name, m.period, m.date, m.value, m.kpi.unit, m.target ?? null, score({ ...m.kpi, current: m.value, target: m.target ?? null }), m.responsible, m.notes, (m.evidence || []).map(e => e.name).join(", ")]); return base;
    }
    if (selectedReport === "comparativo") {
      const otherYear = $("#rCompareYear")?.value || store.years().filter(y => y !== S().period).at(-1);
      base.title = "Comparativo anual de indicadores"; base.subtitle = `${S().source.organization} · ${S().period} frente a ${otherYear || "otro ejercicio aún no registrado"} · Comparación por nombre de indicador`;
      base.headers = ["Indicador", `Real ${S().period}`, `Meta ${S().period}`, `Cumplimiento ${S().period} (%)`, `Real ${otherYear || "anterior"}`, `Meta ${otherYear || "anterior"}`, `Cumplimiento ${otherYear || "anterior"} (%)`, "Variación en cumplimiento (p.p.)", "Comparabilidad"];
      if (!otherYear) return base;
      const others = new Map(store.year(otherYear).kpis.map(k => [normalize(k.name), k]));
      base.rows = items.map(k => { const old = others.get(normalize(k.name)), comparable = old && old.unit === k.unit && old.direction === k.direction, oldScore = comparable ? score(old) : null, currentScore = score(k); return [k.name, k.current, k.target, currentScore, comparable ? old.current : null, comparable ? old.target : null, oldScore, comparable && oldScore !== null && currentScore !== null ? Math.round((currentScore - oldScore) * 10) / 10 : null, comparable ? "Mismo indicador, unidad y sentido" : "Sin registro comparable"]; }); return base;
    }
    return base;
  }
  function paintReport() {
    reportModel = buildReport(); const root = $("#reportDocument"); if (!root) return;
    root.innerHTML = `<div class="report-heading"><span class="eyebrow">TECHPERU SAC · BALANCED SCORECARD</span><h2>${h(reportModel.title)}</h2><p>${h(reportModel.subtitle)}</p><p class="form-note">Generado: ${h(new Date().toLocaleString("es-PE"))} · ${reportModel.rows.length} fila(s) · Se aplican los filtros visibles.</p></div>${table(reportModel.headers, reportModel.rows.map(row => row.map(value => `<span class="report-cell">${h(typeof value === "number" ? fmt(value, 2) : value ?? "—")}</span>`)), selectedReport === "comparativo" && store.years().length < 2 ? "Importa o crea un segundo ejercicio para comparar sus indicadores anuales." : "No hay registros para este reporte y sus filtros.")}<p class="form-note">Cumplimiento directo: Real/Meta × 100. Inverso: Meta/Real × 100. Umbrales iniciales: verde ≥90%, ámbar ≥75%, rojo &lt;75%. Los datos no calculables no se convierten en cero. Los archivos exportados son reportes; para volver a importar datos utiliza la plantilla original del BSC.</p>`;
  }
  const reportTypes = { general: "Resumen general", perspectivas: "Por perspectiva", kpis: "Detalle de indicadores", matriz: "Matriz BSC completa", criticos: "Indicadores que requieren atención", acciones: "Planes de acción", mediciones: "Historial del corte", comparativo: "Comparativo anual" };
  function renderReports() {
    return `${pageHead("Reportes", "Filtra la vista y exporta exactamente los datos que estás consultando.", `<button class="btn" data-action="print-report-v4">Imprimir / PDF</button><button class="btn" data-action="report-csv">↓ CSV</button><button class="btn primary" data-action="report-xlsx">↓ Excel</button>`)}<div class="toolbar">${select("Tipo de reporte", "rType", Object.entries(reportTypes).map(([value, text]) => option(value, text, selectedReport)).join(""))}<div class="search-box"><input id="rSearch" placeholder="Buscar en el reporte…" aria-label="Buscar en el reporte"></div><select id="rPerspective" aria-label="Perspectiva del reporte"><option value="">Todas las perspectivas</option>${Object.entries(perspectives).map(([key, p]) => option(key, p.label, "")).join("")}</select><select id="rStatus" aria-label="Semáforo del reporte" ${selectedReport === "acciones" ? "disabled" : ""}><option value="">Todos los estados KPI</option>${[["good", "Logrado"], ["warn", "En riesgo"], ["bad", "Crítico"], ["neutral", "Sin cálculo"]].map(([key, text]) => option(key, text, "")).join("")}</select><select id="rActionStatus" aria-label="Estado del plan en el reporte" class="${selectedReport === "acciones" ? "" : "hidden"}"><option value="">Todos los estados de planes</option>${["Planificada", "En ejecución", "En riesgo", "Finalizada", "Cancelada", "vencida"].map(status => option(status, status === "vencida" ? "Vencidos" : status, "")).join("")}</select><select id="rCompareYear" aria-label="Ejercicio a comparar" class="${selectedReport === "comparativo" ? "" : "hidden"}">${store.years().filter(year => year !== S().period).map(year => option(year, "Comparar con " + year, "")).join("")}</select></div><section class="panel report-document" id="reportDocument"></section>`;
  }
  function generateReport(type) { selectedReport = type === "iniciativas" ? "acciones" : type; if (!reportTypes[selectedReport]) selectedReport = "kpis"; refresh("reportes"); }
  function exportCurrentReport() { if (!reportModel) paintReport(); api.exportCSV(`bsc_${selectedReport}_${S().period}.csv`, [reportModel.headers, ...reportModel.rows]); }
  function importDiff(imported, old) {
    const previous = new Map((old?.kpis || []).map(k => [normalize(k.name), k]));
    const incoming = new Set(imported.kpis.map(k => normalize(k.name)));
    const fields = { target: "Meta", current: "Real anual", unit: "Unidad", direction: "Sentido", analysis: "Análisis", recommendation: "Recomendación", objectiveId: "Objetivo" };
    const rows = imported.kpis.map(k => {
      const before = previous.get(normalize(k.name));
      if (!before) return { k, kind: "Nuevo", changes: "Nuevo indicador", before: null };
      const changes = Object.entries(fields).filter(([key]) => JSON.stringify(before[key] ?? null) !== JSON.stringify(k[key] ?? null)).map(([, name]) => name);
      return { k, kind: changes.length ? "Modificado" : "Sin cambios", changes: changes.join(", "), before };
    });
    return { rows, added: rows.filter(r => r.kind === "Nuevo").length, changed: rows.filter(r => r.kind === "Modificado").length, absent: (old?.kpis || []).filter(k => !incoming.has(normalize(k.name))) };
  }
  function mergeImport(imported, old, diff) {
    if (!old) return imported;
    const result = clone(old), existingIds = new Set(result.kpis.map(k => k.id));
    result.source = clone(imported.source);
    imported.objectives.forEach(o => {
      const match = result.objectives.find(existing => existing.id === o.id);
      if (match) { const owner = match.owner; Object.assign(match, o); if (owner && owner !== "Responsable por asignar") match.owner = owner; }
      else result.objectives.push(clone(o));
    });
    diff.rows.forEach(row => {
      const incoming = row.k;
      if (row.before) {
        const k = result.kpis.find(k => k.id === row.before.id), preserved = { id: k.id, owner: k.owner, area: k.area, frequency: k.frequency, baseline: k.baseline, measurements: k.measurements, targets: k.targets };
        Object.assign(k, clone(incoming), preserved);
        if (row.kind === "Modificado" && (row.before.current !== incoming.current || row.before.target !== incoming.target)) k.measurements.push({ id: uid("M"), period: imported.period, date: "", value: incoming.current, target: incoming.target, recordedAt: new Date().toISOString(), responsible: "Responsable por asignar", notes: "Actualización anual importada desde " + imported.source.filename, evidence: [] });
        k.current = incoming.current;
      } else {
        const k = clone(incoming);
        if (existingIds.has(k.id)) k.id = uid("KPI");
        k.measurements.forEach(m => { m.id = uid("M"); }); existingIds.add(k.id); result.kpis.push(k);
      }
    });
    result.areas = [...new Set([...result.areas, ...imported.kpis.map(k => k.area)])];
    return normalizeYear(result);
  }
  async function importExcel(event) {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file || !api.canEdit()) return;
    try {
      if (!/\.xlsx$/i.test(file.name) || file.size > 10 * 1024 * 1024) throw new Error("Selecciona un Excel .xlsx de hasta 10 MB.");
      api.toast("Leyendo el Excel y comparando sus datos…");
      const imported = normalizeYear(await BSCExcel.parse(await file.arrayBuffer(), file.name));
      const old = store.years().includes(imported.period) ? (S().period === imported.period ? clone(S()) : normalizeYear(store.year(imported.period))) : null;
      if (old?.exerciseStatus === "Cerrado") throw new Error(`El ejercicio ${imported.period} está cerrado. Reábrelo desde Administración antes de modificarlo.`);
      const diff = importDiff(imported, old);
      const body = `<div class="info-box"><strong>${h(file.name)}</strong><p>Ejercicio ${h(imported.period)} · ${imported.objectives.length} objetivos · ${imported.kpis.length} KPI</p><p><strong>${diff.added} nuevos · ${diff.changed} modificados · ${diff.absent.length} no presentes en el Excel</strong></p><p>${old ? "En modo actualizar se conservan los registros no presentes, las mediciones históricas, las metas de otros cortes, las evidencias y los planes." : "Se creará un ejercicio nuevo. Los ejercicios existentes se conservarán."}</p></div>${old ? select("Forma de importar", "importMode", option("update", "Actualizar y conservar historial y planes", "update") + option("replace", "Reemplazar SOLO este ejercicio (descarta su historial y planes)", "update")) : '<input id="importMode" type="hidden" value="new">'}<p class="form-note">Meta y Real proceden de BSC Completo. Los análisis y recomendaciones proceden de las hojas por perspectiva.</p><div class="import-preview">${table(["Indicador", "Cambio", "Campos", "Meta anterior → nueva", "Real anterior → nuevo"], diff.rows.map(row => [h(row.k.name), `<span class="status ${row.kind === "Nuevo" ? "blue" : row.kind === "Modificado" ? "warn" : "neutral"}">${row.kind}</span>`, h(row.changes || "—"), `${fmt(row.before?.target, 2)} → ${fmt(row.k.target, 2)}`, `${fmt(row.before?.current, 2)} → ${fmt(row.k.current, 2)}`]))}</div>${diff.absent.length ? `<p class="form-note">No presentes: ${diff.absent.map(k => h(k.name)).join(", ")}. Actualizar los conserva; reemplazar los retira del ejercicio.</p>` : ""}${imported.source.warnings?.length ? `<details class="info-box"><summary>Diferencias entre hojas (${imported.source.warnings.length})</summary><ul>${imported.source.warnings.map(w => `<li>${h(w)}</li>`).join("")}</ul></details>` : ""}<button class="btn small" data-action="backup-complete">Descargar respaldo completo antes de importar</button>`;
      showModal("Vista previa de importación", body, "Confirmar importación", () => {
        const mode = $("#importMode").value;
        const prepared = mode === "update" ? mergeImport(imported, old, diff) : imported;
        const next = store.activate(S(), prepared); api.setState(next); cut = next.period;
        audit("Importación", "Excel", `${file.name}; ${mode === "update" ? "actualización" : mode === "replace" ? "reemplazo del ejercicio" : "nuevo ejercicio"}; ${diff.added} nuevos, ${diff.changed} modificados.`);
        notifySaved("Excel importado; los otros ejercicios se conservaron", "dashboard");
      }, "REVISIÓN DE CAMBIOS");
    } catch (error) { api.toast(error.message || "No se pudo leer el Excel.", "error"); }
  }
  function newYear() {
    if (!api.canEdit()) return;
    showModal("Crear ejercicio anual", `<form class="detail-form-grid">${input("Año (2000–2099) *", "newYear", Number(S().period) + 1, "number", 'min="2000" max="2099"')}${select("Estado inicial", "newYearStatus", ["Planificado", "En seguimiento"].map(status => option(status, status, "Planificado")).join(""))}${select("Estructura del ejercicio", "yearCopy", option("structure", "Copiar objetivos e indicadores del ejercicio activo", "structure") + option("empty", "Empezar con un catálogo vacío", "structure"))}<label class="evidence-keep"><input id="copyTargets" type="checkbox"> Copiar también las metas anuales del ejercicio activo</label><p class="form-note full-span">Puedes registrar años pasados o futuros. No se copian resultados, mediciones, evidencias, análisis ni planes de acción.</p></form>`, "Crear ejercicio", () => {
      const year = $("#newYear").value.trim();
      if (!/^20\d{2}$/.test(year) || store.years().includes(year)) throw new Error("Indica un año entre 2000 y 2099 que todavía no exista.");
      const data = clone(S()), copy = $("#yearCopy").value === "structure", targets = $("#copyTargets").checked;
      data.period = year; data.exerciseStatus = $("#newYearStatus").value; data.plannedPeriods = [year]; data.initiatives = []; data.audit = [];
      data.source = { organization: S().source.organization, period: year, filename: "Ejercicio creado en la aplicación", importedAt: new Date().toISOString() };
      if (copy) data.kpis.forEach(k => { k.current = null; if (!targets) k.target = null; k.measurements = []; k.targets = {}; k.analysis = ""; k.recommendation = ""; k.originalAnalysis = ""; k.description = ""; });
      else { data.objectives = []; data.kpis = []; data.links = []; }
      api.setState(store.activate(S(), data)); cut = year; audit("Creación", "Ejercicio", year + "; sin resultados copiados."); notifySaved("Ejercicio creado", "administracion");
    });
  }
  function bulkTargets() {
    if (!api.canEdit()) return;
    showModal("Planificar metas por corte", `${input("Corte: AAAA, AAAA-MM o AAAA-Q1", "bulkPeriod", cut)}<p class="form-note">Deja una meta vacía si todavía no se ha definido. Los resultados no se crean ni se reparten automáticamente.</p><div class="import-preview">${table(["Indicador", "Unidad", "Meta del corte"], S().kpis.map(k => [h(k.name), h(k.unit), `<input class="table-input" type="number" step="any" min="0" data-meta-kpi="${h(k.id)}" value="${h(effective(k).target ?? "")}" aria-label="Meta de ${h(k.name)}">`]))}</div>`, "Guardar planificación", () => {
      const period = $("#bulkPeriod").value.trim(); if (!validPeriod(period)) throw new Error("Usa un corte válido del ejercicio activo.");
      const values = $$('[data-meta-kpi]').map(input => ({ id: input.dataset.metaKpi, target: number(input.value), empty: input.value.trim() === "" }));
      if (values.some(v => !v.empty && (v.target === null || v.target <= 0))) throw new Error("Las metas definidas deben ser números positivos.");
      values.forEach(({ id, target }) => { const k = S().kpis.find(k => k.id === id); if (period === S().period) k.target = target; else k.targets[period] = target; });
      S().plannedPeriods = [...new Set([...S().plannedPeriods, period])]; cut = period;
      audit("Planificación", "Metas del corte", `${period}; ${values.filter(v => v.target !== null).length} metas definidas.`); notifySaved("Metas del corte guardadas");
    });
    $("#bulkPeriod").onchange = () => { const period = $("#bulkPeriod").value.trim(); $$('[data-meta-kpi]').forEach(input => { input.value = effective(S().kpis.find(k => k.id === input.dataset.metaKpi), period).target ?? ""; }); };
  }
  async function restoreBackup(event) {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file || !api.canAdmin()) return;
    try {
      const result = await BSCExport.readBackup(file);
      showModal("Restaurar respaldo", `<div class="info-box"><strong>${h(file.name)}</strong><p>Ejercicios incluidos: ${Object.keys(result.workspace.years).map(h).join(", ")}</p><p>Reemplazará los datos de todos los ejercicios de este navegador.</p><p>${result.jsonOnly ? "Este JSON no contiene los archivos de evidencias; solo sus referencias. El ZIP es el respaldo completo." : `${result.records.length} archivos de evidencia incluidos.`}</p></div>`, "Restaurar estos datos", async () => {
        await BSCStorage.evidence.restore(result.records);
        api.setState(store.restore(result.workspace)); cut = S().period;
        audit("Restauración", "Respaldo", file.name); notifySaved("Respaldo restaurado", "dashboard");
      }, "RESTAURACIÓN");
    } catch (error) { api.toast(error.message || "No se pudo restaurar el respaldo.", "error"); }
  }
  function confirmReset() {
    if (!api.canAdmin()) return api.toast("Solo el administrador puede restaurar el Excel inicial.", "error");
    const year = String(window.BSC_INITIAL_DATA.period);
    if (store.years().includes(year) && store.year(year).exerciseStatus === "Cerrado") return api.toast("Reabre el ejercicio inicial antes de restaurarlo.", "error");
    showModal("Restaurar el Excel inicial", `<div class="info-box">Se reemplazará únicamente el ejercicio ${h(year)} por los datos originales. Los demás ejercicios se conservarán.<p>Se descartarán sus modificaciones, planes y conexiones actuales.</p><button class="btn small" data-action="backup-complete">Descargar respaldo completo</button></div>`, "Restaurar ejercicio inicial", () => {
      api.setState(store.activate(S(), normalizeYear(api.initialState()))); cut = S().period; audit("Restauración", "Excel inicial", year); notifySaved("Ejercicio inicial restaurado", "dashboard");
    });
  }
  function renderAdministration() {
    return `${pageHead("Administración", "Organiza ejercicios, metas, áreas y usuarios del prototipo.", api.canEdit() ? `<button class="btn" data-action="bulk-targets">Planificar metas</button><button class="btn primary" data-action="new-year">＋ Crear ejercicio</button>` : "")}<div class="grid two-columns"><section class="panel"><div class="panel-head"><div><h2>Ejercicios y cortes</h2><p>Los ejercicios pasados y futuros conservan sus datos separados.</p></div></div>${table(["Año", "Estado", "Indicadores", "Acción"], store.years().map(year => { const data = year === S().period ? S() : store.year(year); return [h(year), h(data.exerciseStatus), String(data.kpis.length), `<button class="text-action" data-action="switch-year" data-value="${year}">${year === S().period ? "Activo" : "Abrir"}</button>`]; }))}<form id="yearStatusForm" class="detail-form-grid">${select("Estado del ejercicio activo", "exerciseStatus", ["Planificado", "En seguimiento", "Cerrado"].map(status => option(status, status, S().exerciseStatus)).join(""))}<div class="field"><label>&nbsp;</label><button class="btn" type="submit" ${api.canEdit() ? "" : "disabled"}>Guardar estado</button></div></form><p class="form-note">Un ejercicio cerrado se consulta y exporta. Reábrelo aquí para registrar cambios.</p></section><section class="panel"><div class="panel-head"><div><h2>Importación y respaldos</h2><p>Importa cambios o conserva una copia portable de todo tu trabajo.</p></div></div><p class="form-note">Fuente del ejercicio activo: ${h(S().source.filename || "Sin archivo importado")}</p><div class="admin-actions">${api.canEdit() ? '<button class="btn" data-action="import-excel">Cargar Excel y revisar cambios</button>' : ""}<button class="btn primary" data-action="backup-complete">Descargar respaldo ZIP con evidencias</button><button class="btn" data-action="backup-json">Exportar datos JSON</button>${api.canAdmin() ? '<button class="btn" data-action="restore-backup">Restaurar respaldo ZIP / JSON</button><button class="btn danger" data-action="reset-demo">Restaurar Excel inicial</button>' : ""}</div></section></div>
    <div class="grid two-columns"><section class="panel"><div class="panel-head"><div><h2>Catálogo de áreas</h2><p>Las áreas se usan en las fichas de indicadores del ejercicio.</p></div></div><form id="areaForm">${textarea("Áreas, una por línea", "areasCatalog", S().areas.join("\n"))}<button class="btn" type="submit" ${api.canEdit() ? "" : "disabled"}>Guardar áreas</button></form></section><section class="panel"><div class="panel-head"><div><h2>Usuarios y roles</h2><p>Acceso de demostración; la autenticación real se implementará en Spring Boot.</p></div>${api.canAdmin() ? '<button class="btn small" data-action="new-user">＋ Usuario</button>' : ""}</div>${table(["Usuario", "Rol", "Acciones"], S().users.map(u => [`<strong>${h(u.name)}</strong><span class="subcell">${h(u.email)}</span>`, h(u.role), api.canAdmin() ? `<button class="text-action" data-action="edit-user" data-id="${h(u.id)}">Editar</button>${u.id !== "u1" && u.id !== api.getUser()?.id ? `<button class="text-action" data-action="delete-user" data-id="${h(u.id)}">Eliminar</button>` : ""}` : "Solo lectura"]))}</section></div><section class="panel"><div class="panel-head"><div><h2>Registro de cambios</h2><p>Últimas 100 acciones del ejercicio activo.</p></div></div>${table(["Fecha", "Usuario", "Acción", "Registro", "Detalle"], S().audit.slice(0, 100).map(a => [h(new Date(a.date).toLocaleString("es-PE")), h(a.user), h(a.action), h(a.entity), `<span class="long-cell">${h(a.detail)}</span>`]))}</section>`;
  }
  function help() {
    showModal("Guía del BSC", `<div class="help-content"><h3>1. Selecciona ejercicio y corte</h3><p>Cada año conserva sus propios indicadores, resultados y planes. Un corte puede ser anual, mensual o trimestral. Puedes crear ejercicios futuros para planificar metas.</p><h3>2. Interpreta el semáforo y la brecha</h3><p>Umbrales iniciales: logrado desde 90%, en riesgo desde 75%, crítico por debajo de 75%. La brecha muestra cuánto falta para la meta completa. En indicadores inversos, un resultado menor es mejor.</p><h3>3. Registra resultados con su meta</h3><p>No se divide la meta anual automáticamente. Cada medición conserva su meta histórica y puede incluir hasta tres evidencias.</p><h3>4. Convierte recomendaciones en acciones</h3><p>Desde la ficha o la matriz, crea un plan. Define responsable, plazo y actividades. Si agregas actividades, el avance se calcula por las completadas.</p><h3>5. Conserva tu trabajo</h3><p>Descarga un respaldo ZIP para incluir datos de todos los años y evidencias. El JSON contiene solo los datos. Las exportaciones Excel y CSV son reportes, no la plantilla de importación.</p><h3>6. Estado de esta versión</h3><p>Es un frontend funcional con guardado en este navegador. La base de datos y el acceso compartido entre computadoras se incorporarán al conectar Spring Boot.</p></div>`, "Entendido", closeModal, "GUÍA DE USO");
  }
  const mutationActions = new Set(["new-objective", "edit-objective", "delete-objective", "new-kpi", "edit-kpi", "delete-kpi", "edit-target", "bulk-targets", "new-measurement", "edit-measurement", "measure-kpi", "new-initiative", "edit-initiative", "delete-initiative", "action-from-kpi", "new-link", "delete-link"]);
  const run = fn => Promise.resolve().then(fn).catch(error => api.toast(error.message || "No se pudo completar la operación.", "error"));
  function handleAction(action, id, data = {}) {
    if (S().exerciseStatus === "Cerrado" && mutationActions.has(action)) return api.toast("El ejercicio está cerrado. Reábrelo desde Administración para realizar cambios.", "error");
    const actions = {
      "filter-status": () => { api.navigate("kpis"); $("#filterStatus").value = data.value; $("#filteredKpis").innerHTML = kpiTable(filteredKpis()); },
      "open-perspective": () => { perspectiveTab = data.value || "financiera"; api.navigate("perspectivas"); },
      "go-actions": () => api.navigate("iniciativas"),
      "go-administration": () => api.navigate("administracion"),
      "objective-detail": () => showObjectiveDetail(id),
      "action-from-kpi": () => openInitiativeForm(null, id),
      "edit-target": () => openTarget(id),
      "measurement-evidence": () => measurementEvidence(id),
      "view-evidence": () => evidenceFile(id),
      "download-evidence": () => evidenceFile(id, true),
      "new-link": openLink,
      "delete-link": () => showModal("Eliminar conexión", "<p>Se retirará esta relación del mapa estratégico.</p>", "Eliminar conexión", () => { S().links = S().links.filter(l => l.id !== id); audit("Eliminación", "Mapa", id); notifySaved("Conexión eliminada", "mapa"); }),
      "matrix-csv": () => { const report = kpiReport(filteredKpis("matrix"), "Matriz BSC completa"); api.exportCSV(`matriz_bsc_${cut}.csv`, [report.headers, ...report.rows]); },
      "matrix-xlsx": () => BSCExport.xlsx(kpiReport(filteredKpis("matrix"), "Matriz BSC completa"), `matriz_bsc_${cut}.xlsx`),
      "report-csv": exportCurrentReport,
      "report-xlsx": () => { if (!reportModel) paintReport(); return BSCExport.xlsx(reportModel, `reporte_bsc_${selectedReport}_${cut}.xlsx`); },
      "print-report-v4": () => { document.body.classList.add("printing-report"); window.print(); },
      "measurement-csv": () => { const rows = filteredMeasurements().map(m => [m.kpi.id, m.kpi.name, m.period, m.date, m.value, m.target ?? null, m.responsible, m.notes, (m.evidence || []).map(e => e.name).join(", ")]); api.exportCSV(`mediciones_${S().period}.csv`, [["KPI", "Indicador", "Corte", "Fecha", "Valor", "Meta registrada", "Responsable", "Notas", "Evidencias"], ...rows]); },
      "backup-complete": () => BSCExport.backup(store.export(S())),
      "backup-json": () => api.downloadBlob("datos_bsc_todos_los_ejercicios.json", JSON.stringify(store.export(S()), null, 2), "application/json"),
      "restore-backup": () => $("#backupFile").click(),
      "new-year": newYear,
      "bulk-targets": bulkTargets,
      "switch-year": () => switchYear(data.value),
      "export-dashboard": () => { const c = counts(); api.exportCSV(`resumen_bsc_${cut}.csv`, [["Ejercicio", S().period], ["Corte", cut], ["Estado del ejercicio", S().exerciseStatus], ["Cumplimiento global (%)", globalCompliance()], ["Objetivos", S().objectives.length], ["Indicadores", S().kpis.length], ["Logrados", c.good], ["En riesgo", c.warn], ["Críticos", c.bad], ["Sin cálculo", c.neutral]]); }
    };
    if (actions[action]) return run(actions[action]);
    return api.handleAction(action, id, data);
  }
  function switchYear(year) { if (year === S().period) return; api.setState(store.switchYear(S(), year)); cut = year; closeModal(); refresh(); api.toast("Ejercicio " + year + " activo"); }
  function bindPageEvents(page) {
    if (page !== "dashboard") { dashboardCharts.forEach(chart => chart.destroy()); dashboardCharts = []; }
    api.bindPageEvents(page);
    const root = $("#pageContent"), originalInput = root.oninput, originalChange = root.onchange;
    const repaint = id => {
      if (/^filter/.test(id)) $("#filteredKpis").innerHTML = kpiTable(filteredKpis());
      if (/^matrix/.test(id)) $("#matrixResults").innerHTML = matrixTable(filteredKpis("matrix"));
      if (["mSearch", "mFilterKpi", "mFilterPeriod"].includes(id)) $("#measurementResults").innerHTML = measurementTable(filteredMeasurements());
      if (["actionSearch", "actionStatus", "actionOwner"].includes(id)) $("#actionResults").innerHTML = actionTable(filteredActions());
      if (/^r(?:Search|Perspective|Status|CompareYear|ActionStatus)$/.test(id)) paintReport();
    };
    root.oninput = event => { repaint(event.target.id); if (originalInput) originalInput(event); };
    root.onchange = event => {
      if (event.target.id === "rType") {
        selectedReport = event.target.value; $("#rStatus").disabled = selectedReport === "acciones"; if (selectedReport === "acciones") $("#rStatus").value = "";
        $("#rActionStatus").classList.toggle("hidden", selectedReport !== "acciones"); $("#rCompareYear").classList.toggle("hidden", selectedReport !== "comparativo"); paintReport();
      } else repaint(event.target.id);
      if (originalChange) originalChange(event);
    };
    if (page === "reportes") paintReport();
    if (page === "mapa") requestAnimationFrame(drawMap);
    const areaForm = $("#areaForm"); if (areaForm) areaForm.onsubmit = event => { event.preventDefault(); run(() => {
      if (!api.canEdit() || S().exerciseStatus === "Cerrado") throw new Error("Reabre el ejercicio y usa una cuenta con permisos de edición.");
      const areas = [...new Set($("#areasCatalog").value.split("\n").map(a => a.trim()).filter(Boolean))];
      if (!areas.length || areas.some(a => a.length > 100)) throw new Error("Registra áreas válidas de hasta 100 caracteres.");
      const used = S().kpis.map(k => k.area).filter(a => a && !areas.includes(a));
      if (used.length) throw new Error("Reasigna primero los indicadores de las áreas que deseas retirar: " + [...new Set(used)].join(", "));
      S().areas = areas; audit("Configuración", "Áreas", areas.join(", ")); saveState(); refresh("administracion"); api.toast("Catálogo de áreas guardado");
    }); };
    const statusForm = $("#yearStatusForm"); if (statusForm) statusForm.onsubmit = event => { event.preventDefault(); run(() => { if (!api.canEdit()) return; const value = $("#exerciseStatus").value; S().exerciseStatus = value; audit("Estado del ejercicio", "Ejercicio " + S().period, value); saveState(); refresh("administracion"); api.toast("Estado del ejercicio actualizado"); }); };
    if (S().exerciseStatus === "Cerrado") {
      root.insertAdjacentHTML("afterbegin", `<div class="exercise-notice">Ejercicio ${h(S().period)} cerrado: consulta y exportación disponibles. <button class="inline-link" data-action="go-administration">Administrar estado</button></div>`);
      $$("[data-action]", root).filter(button => mutationActions.has(button.dataset.action)).forEach(button => { button.disabled = true; button.title = "Reabre el ejercicio para editar"; });
    }
    const c = counts(); $("#notificationDot").classList.toggle("hidden", c.warn + c.bad + c.neutral + S().initiatives.filter(isOverdue).length === 0);
  }
  function init() {
    $("#globalPeriod").onchange = event => run(() => switchYear(event.target.value));
    $("#globalCut").onchange = event => { cut = event.target.value; refresh(); };
    $("#backupFile").onchange = restoreBackup;
    $("#helpBtn").onclick = help;
    $("#modalBody").onclick = event => { const button = event.target.closest("[data-action]"); if (button) handleAction(button.dataset.action, button.dataset.id, button.dataset); };
    $("#notificationsBtn").onclick = () => {
      const attention = viewKpis().filter(k => statusOf(k).key !== "good"), overdue = S().initiatives.filter(isOverdue);
      showModal("Atención y pendientes", `<h3>Indicadores a revisar (${attention.length})</h3>${kpiTable(attention)}<h3>Planes vencidos (${overdue.length})</h3>${actionTable(overdue)}`, "Cerrar", closeModal, periodLabel(cut));
    };
    window.addEventListener("resize", () => { if (api.getPage() === "mapa") requestAnimationFrame(drawMap); });
    window.addEventListener("afterprint", () => document.body.classList.remove("printing-report"));
    document.addEventListener("keydown", event => { if (event.key === "Escape") { closeModal(); $("#sidebar").classList.remove("open"); } });
    syncSourceUI();
  }
  return {
    loadState, saveState, syncSourceUI, globalCompliance, perspectiveBreakdown, statusOf, showModal, closeModal,
    openKpiForm, showKpiDetail, showObjectiveDetail, openMeasurementForm, measurementTable,
    openInitiativeForm, showInitiativeDetail, confirmDelete, importExcel, confirmReset,
    generateReport, exportCurrentReport, handleAction, bindPageEvents, drawDashboardCharts, init,
    renderers: { dashboard: renderDashboard, perspectivas: renderPerspectives, matriz: renderMatrix, kpis: renderKpis, objetivos: renderObjectives, mediciones: renderMeasurements, iniciativas: renderInitiatives, mapa: renderMap, reportes: renderReports, administracion: renderAdministration }
  };
};
