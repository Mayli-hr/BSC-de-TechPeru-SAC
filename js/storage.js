/* Persistencia del prototipo. Este adaptador se sustituirá por la API de Spring Boot. */
window.BSCStorage = (() => {
  "use strict";
  const KEY = "techperu_bsc_workspace_v4";
  const clone = value => JSON.parse(JSON.stringify(value));
  const uid = prefix => prefix + "-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
  const normalize = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  function splitAnalysis(value) {
    const match = String(value || "").match(/^([\s\S]*?[.!?])\s+(?=[A-ZÁÉÍÓÚÑ])([\s\S]+)$/);
    return match ? [match[1], match[2]] : [String(value || ""), ""];
  }
  function normalizeYear(data) {
    if (!data || !/^20\d{2}$/.test(String(data.period)) || !Array.isArray(data.kpis) || !Array.isArray(data.objectives) || !Array.isArray(data.initiatives)) throw new Error("El respaldo no contiene un ejercicio BSC válido.");
    if (data.kpis.length > 2000 || data.objectives.length > 1000 || data.initiatives.length > 2000) throw new Error("El respaldo excede la cantidad de registros permitida.");
    data.links ||= []; data.audit ||= []; data.areas ||= [...new Set(data.kpis.map(k => k.area).filter(Boolean))];
    data.plannedPeriods ||= [data.period];
    data.exerciseStatus ||= data.kpis.some(k => k.current !== null && k.current !== undefined) ? "En seguimiento" : "Planificado";
    data.source ||= { organization: "TechPeru SAC", period: data.period, filename: "Registro local" };
    const ids = new Set();
    data.objectives.forEach(o => { if (!o.id || ids.has(o.id)) throw new Error("Hay objetivos con códigos duplicados o vacíos."); ids.add(o.id); o.weight = 1; });
    const kids = new Set();
    data.kpis.forEach(k => {
      if (!k.id || kids.has(k.id)) throw new Error("Hay indicadores con códigos duplicados o vacíos."); kids.add(k.id);
      if (k.analysis === undefined) {
        [k.analysis, k.recommendation] = splitAnalysis(k.description);
        k.originalAnalysis = k.description || "";
      }
      k.recommendation ||= ""; k.targets ||= {}; k.weight = 1; k.measurements ||= []; k.calculation = "excel";
      k.measurements.forEach(m => {
        m.evidence ||= []; m.date ||= ""; m.recordedAt ||= data.source.importedAt || m.date || "";
        // El corte original proviene del mismo Excel; conserva su meta conocida.
        if (m.target === undefined && /Resultado anual acumulado del Excel|Cierre de período/.test(m.notes || "")) m.target = k.target;
      });
    });
    data.links = data.links.filter(l => ids.has(l.from) && ids.has(l.to) && l.from !== l.to);
    data.initiatives.forEach(i => { i.tasks ||= []; i.updates ||= []; });
    return data;
  }
  function validateWorkspace(candidate) {
    if (!candidate || !candidate.years || !Array.isArray(candidate.users)) throw new Error("El respaldo no es compatible.");
    if (!candidate.users.some(u => u.role === "Administrador") || candidate.users.some(u => !u.id || typeof u.name !== "string" || typeof u.email !== "string" || !["Administrador", "Gerente", "Responsable de indicadores"].includes(u.role))) throw new Error("El respaldo debe incluir usuarios válidos y al menos un administrador.");
    if (Object.keys(candidate.years).length > 100) throw new Error("El respaldo tiene demasiados ejercicios.");
    for (const [year, data] of Object.entries(candidate.years)) {
      normalizeYear(data);
      if (year !== data.period) throw new Error("El año del respaldo no coincide con sus datos.");
    }
    if (!candidate.years[candidate.activeYear]) throw new Error("El ejercicio activo no existe en el respaldo.");
    return candidate;
  }
  function create(initialFactory) {
    let workspace;
    const snapshot = state => { const copy = clone(state); delete copy.users; return copy; };
    function unpack() { return normalizeYear({ ...clone(workspace.years[workspace.activeYear]), users: clone(workspace.users) }); }
    function save(state) {
      normalizeYear(state);
      const next = clone(workspace);
      next.years[state.period] = snapshot(state); next.users = clone(state.users); next.activeYear = state.period;
      localStorage.setItem(KEY, JSON.stringify(next)); workspace = next;
      return true;
    }
    function load() {
      const raw = localStorage.getItem(KEY);
      if (raw) { workspace = validateWorkspace(JSON.parse(raw)); return unpack(); }
      let initial;
      try { const legacy = localStorage.getItem("bsc_techperu_excel_v1"); if (legacy) initial = JSON.parse(legacy); } catch (e) { /* No reemplaza archivos fuente. */ }
      initial = normalizeYear(initial || initialFactory());
      workspace = { format: "techperu-bsc-workspace", version: 4, activeYear: initial.period, users: clone(initial.users), years: { [initial.period]: snapshot(initial) } };
      return initial;
    }
    return {
      load, save,
      years: () => Object.keys(workspace.years).sort(),
      year: year => clone(workspace.years[year]),
      export: state => { save(state); return clone(workspace); },
      switchYear: (state, year) => { save(state); if (!workspace.years[year]) throw new Error("El ejercicio no existe."); workspace.activeYear = year; const data = unpack(); save(data); return data; },
      activate: (state, data) => { save(state); data.users = clone(workspace.users); normalizeYear(data); save(data); return data; },
      restore: candidate => { const validated = validateWorkspace(clone(candidate)); localStorage.setItem(KEY, JSON.stringify(validated)); workspace = validated; return unpack(); }
    };
  }
  let database;
  function evidenceDb() {
    return database ||= new Promise((resolve, reject) => {
      const request = indexedDB.open("techperu-bsc-evidence-v1", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("files", { keyPath: "id" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => { database = null; reject(new Error("No se pudo abrir el almacenamiento de evidencias.")); };
    });
  }
  async function evidenceTransaction(mode, operation) {
    const db = await evidenceDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("files", mode), objectStore = tx.objectStore("files"); let result;
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(new Error("No se pudo guardar o recuperar la evidencia. Revisa el espacio del navegador."));
      tx.onabort = tx.onerror;
      operation(objectStore, value => { result = value; });
    });
  }
  const evidence = {
    async add(files) {
      const allowed = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf"]);
      const records = [...files].map(file => {
        if (!allowed.has(file.type) || file.size > 5 * 1024 * 1024) throw new Error("Usa PNG, JPG, WebP o PDF de hasta 5 MB por archivo.");
        return { id: uid("EV"), name: file.name, type: file.type, size: file.size, blob: file };
      });
      await evidenceTransaction("readwrite", store => records.forEach(record => store.put(record)));
      return records.map(({ blob, ...meta }) => meta);
    },
    get: id => evidenceTransaction("readonly", (store, set) => { const r = store.get(id); r.onsuccess = () => set(r.result); }),
    remove: id => evidenceTransaction("readwrite", store => store.delete(id)),
    restore: records => evidenceTransaction("readwrite", store => records.forEach(record => store.put(record)))
  };
  return { create, clone, uid, normalize, normalizeYear, validateWorkspace, evidence };
})();
