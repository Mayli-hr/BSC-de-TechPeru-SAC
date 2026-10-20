/* Lector local del formato BSC TechPeru. No envía archivos a un servidor. */
(() => {
  "use strict";
  const normalize = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const text = (row, col) => row[col]?.value ?? "";
  const round = n => Math.round((n + Number.EPSILON) * 10) / 10;
  const direct = (root, name) => [...root.children].filter(n => n.localName === name);
  function xml(source) {
    const doc = new DOMParser().parseFromString(source, "application/xml");
    if (doc.getElementsByTagName("parsererror").length) throw new Error("El Excel contiene XML dañado.");
    return doc;
  }
  const elements = (root, name) => [...root.getElementsByTagNameNS("*", name)];
  const richText = root => elements(root, "t").map(n => n.textContent).join("");

  async function unzip(buffer) {
    const bytes = new Uint8Array(buffer), view = new DataView(buffer);
    let end = bytes.length - 22;
    for (; end >= Math.max(0, bytes.length - 65557); end--) {
      if (view.getUint32(end, true) === 0x06054b50 && end + 22 + view.getUint16(end + 20, true) === bytes.length) break;
    }
    if (end < 0 || view.getUint32(end, true) !== 0x06054b50) throw new Error("No es un archivo Excel .xlsx válido.");
    const count = view.getUint16(end + 10, true), start = view.getUint32(end + 16, true);
    if (count > 2000 || start >= bytes.length) throw new Error("La estructura del Excel no es compatible.");
    const entries = new Map();
    let offset = start, total = 0;
    for (let i = 0; i < count; i++) {
      if (view.getUint32(offset, true) !== 0x02014b50) throw new Error("El archivo Excel está dañado.");
      const flags = view.getUint16(offset + 8, true), method = view.getUint16(offset + 10, true);
      const size = view.getUint32(offset + 20, true), expanded = view.getUint32(offset + 24, true);
      const nameLength = view.getUint16(offset + 28, true), extra = view.getUint16(offset + 30, true), comment = view.getUint16(offset + 32, true);
      const local = view.getUint32(offset + 42, true);
      const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
      total += expanded;
      if (flags & 1 || total > 50 * 1024 * 1024) throw new Error("El Excel está protegido o excede el tamaño permitido.");
      entries.set(name, { method, size, expanded, local });
      offset += 46 + nameLength + extra + comment;
    }
    return async path => {
      const entry = entries.get(path);
      if (!entry) return null;
      const { local, method, size, expanded } = entry;
      if (view.getUint32(local, true) !== 0x04034b50) throw new Error("El archivo Excel está dañado.");
      const begin = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      let data = bytes.subarray(begin, begin + size);
      if (method === 8) {
        if (typeof DecompressionStream === "undefined") throw new Error("Para cargar Excel usa una versión actual de Chrome o Edge.");
        const reader = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader();
        const chunks = []; let length = 0;
        while (true) {
          const { value, done } = await reader.read(); if (done) break;
          length += value.length;
          if (length > expanded || length > 50 * 1024 * 1024) { await reader.cancel(); throw new Error("El Excel excede el tamaño permitido."); }
          chunks.push(value);
        }
        data = new Uint8Array(length); let position = 0;
        for (const chunk of chunks) { data.set(chunk, position); position += chunk.length; }
      } else if (method !== 0) throw new Error("La compresión de este Excel no es compatible.");
      if (data.length !== expanded) throw new Error("El Excel está incompleto.");
      return new TextDecoder().decode(data);
    };
  }
  async function readWorkbook(buffer) {
    try {
      const read = await unzip(buffer);
      const bookSource = await read("xl/workbook.xml"), relSource = await read("xl/_rels/workbook.xml.rels");
      if (!bookSource || !relSource) throw new Error("Selecciona un archivo .xlsx de Excel sin contraseña.");
      const book = xml(bookSource), rels = xml(relSource);
      const relationships = new Map(elements(rels, "Relationship").map(r => [r.getAttribute("Id"), r.getAttribute("Target")]));
      const sharedSource = await read("xl/sharedStrings.xml");
      const shared = sharedSource ? elements(xml(sharedSource), "si").map(richText) : [];
      const sheets = [];
      for (const sheet of elements(book, "sheet")) {
        const rid = sheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
        const target = relationships.get(rid);
        if (!target) throw new Error("Falta una hoja del Excel.");
        const pathParts = (target.startsWith("/") ? target.slice(1) : "xl/" + target).split("/");
        const parts = []; for (const part of pathParts) { if (part === "..") parts.pop(); else if (part !== ".") parts.push(part); }
        const source = await read(parts.join("/")); if (!source) throw new Error("No se pudo leer una hoja del Excel.");
        const rows = elements(xml(source), "row").map(row => {
          const result = {};
          for (const cell of direct(row, "c")) {
            const ref = cell.getAttribute("r"), type = cell.getAttribute("t");
            let value = elements(cell, "v")[0]?.textContent ?? "";
            if (type === "s") value = shared[Number(value)] ?? "";
            if (type === "inlineStr") value = richText(cell);
            result[ref.replace(/\d/g, "")] = { ref, value, type, formula: elements(cell, "f")[0]?.textContent || "" };
          }
          return result;
        });
        sheets.push({ name: sheet.getAttribute("name"), rows });
      }
      return sheets;
    } catch (error) {
      if (error instanceof RangeError || error instanceof TypeError) throw new Error("No se pudo leer el Excel. Usa un .xlsx válido en Chrome o Edge actualizado.");
      throw error;
    }
  }
  function number(row, col) {
    const cell = row[col], value = cell?.value;
    if (value === "" || value === null || value === undefined) {
      if (cell?.formula) throw new Error(`Guarda el Excel con los cálculos actualizados: ${cell.ref}.`);
      return null;
    }
    if (cell.type === "e" || !Number.isFinite(Number(value))) throw new Error(`Valor numérico inválido en ${cell.ref}: ${value}.`);
    return Number(value);
  }
  function buildState(sheets, filename) {
    const summary = sheets.find(s => normalize(s.name) === "bsccompleto");
    if (!summary) throw new Error("Falta la hoja «BSC Completo». Usa la misma estructura del Excel TechPeru.");
    const cover = sheets.find(s => normalize(s.name) === "portada");
    const title = cover?.rows.map(r => text(r, "B")).find(t => /BALANCED SCORECARD/i.test(t)) || summary.rows.map(r => text(r, "B")).find(t => /BALANCED SCORECARD/i.test(t)) || "";
    const year = title.match(/\b(20\d{2})\b/)?.[1];
    if (!year) throw new Error("No se pudo identificar el año en el título de la portada o de BSC Completo.");
    const definitions = {
      financiera: { code: "F", sheet: "financiera", area: "Finanzas" },
      clientes: { code: "C", sheet: "clientes", area: "Clientes" },
      procesos: { code: "P", sheet: "procesos", area: "Procesos internos" },
      aprendizaje: { code: "A", sheet: "aprendizaje", area: "Aprendizaje y crecimiento" }
    };
    const details = new Map(), warnings = [];
    for (const def of Object.values(definitions)) {
      const detail = sheets.find(s => normalize(s.name) === def.sheet);
      for (const row of detail?.rows || []) {
        if (text(row, "C") && row.E && row.F && text(row, "C") !== "Indicador (KPI)") details.set(normalize(text(row, "C")), { row, sheet: detail.name });
      }
    }
    const objectives = [], kpis = [], usedNames = new Set();
    let perspective = "", objective = null;
    for (const row of summary.rows) {
      if (/PERSPECTIVA/i.test(text(row, "B"))) {
        const label = normalize(text(row, "B"));
        perspective = Object.keys(definitions).find(key => label.includes(key)) || ""; objective = null;
      }
      if (/^OBJ-/i.test(text(row, "C"))) {
        const match = text(row, "C").match(/^(OBJ-[A-Z]\d+)\s*:\s*(.+)$/i);
        if (!match || !definitions[perspective] || !match[1].startsWith("OBJ-" + definitions[perspective].code)) throw new Error(`Objetivo o perspectiva inválida en ${row.C.ref}.`);
        if (objectives.some(o => o.id === match[1])) throw new Error(`Objetivo duplicado: ${match[1]}.`);
        objective = { id: match[1], name: match[2].trim(), perspective, description: "Objetivo del BSC " + year + " de TechPeru SAC.", owner: "Responsable por asignar", priority: "Por definir", weight: 1, status: "Activo", created: "" };
        objectives.push(objective);
      }
      if (!text(row, "D") || text(row, "D") === "Indicador (KPI)") continue;
      if (!objective) throw new Error(`El indicador ${row.D.ref} no tiene un objetivo válido.`);
      const name = text(row, "D"), key = normalize(name);
      if (usedNames.has(key)) throw new Error(`Indicador duplicado: ${name}.`);
      usedNames.add(key);
      const target = number(row, "F"), current = number(row, "G"), detail = details.get(key);
      if (target === null || target <= 0 || (current !== null && current < 0)) throw new Error(`Revisa la meta y el real del indicador «${name}». La meta debe ser positiva y el real no negativo.`);
      const formula = row.H?.formula || detail?.row.G?.formula || "";
      const inverse = /F\d+\s*\/\s*G\d+/i.test(row.H?.formula || "") || /E\d+\s*\/\s*F\d+/i.test(detail?.row.G?.formula || "");
      if (!formula) throw new Error(`Falta la fórmula de cumplimiento de «${name}» en H o en su hoja de detalle.`);
      if (!inverse && !/G\d+\s*\/\s*F\d+|F\d+\s*\/\s*E\d+/i.test(formula)) throw new Error(`La fórmula de «${name}» no es compatible. Conserva Real/Meta o Meta/Real.`);
      if (detail && (number(detail.row, "E") !== target || number(detail.row, "F") !== current)) warnings.push(`«${name}»: se usan Meta y Real de BSC Completo; la hoja de detalle tiene otros valores.`);
      const id = "KPI-" + definitions[perspective].code + "-" + String(kpis.filter(k => k.perspective === perspective).length + 1).padStart(2, "0");
      const description = detail ? text(detail.row, "I") : "Sin análisis en la hoja de detalle.";
      kpis.push({ id, name, perspective, objectiveId: objective.id, unit: text(row, "E"), formula: inverse ? "Meta / Real × 100" : "Real / Meta × 100", baseline: null, target, current, direction: inverse ? "menor" : "mayor", frequency: "Anual", owner: "Responsable por asignar", area: definitions[perspective].area, weight: 1, description, lower: null, upper: null, alertAt: 90, criticalAt: 75, calculation: "excel", source: { sheet: summary.name, target: row.F.ref, actual: row.G?.ref || "", analysisSheet: detail?.sheet || "" }, measurements: current === null ? [] : [{ id: "M-" + id + "-" + year, period: year, date: "", value: current, notes: "Resultado anual acumulado del Excel. No se especifica fecha de medición.", responsible: "Responsable por asignar" }] });
    }
    if (!kpis.length || !objectives.length) throw new Error("BSC Completo no contiene indicadores para importar.");
    return { objectives, kpis, initiatives: [], period: year, measurementsVersion: 2, source: { filename, organization: "TechPeru SAC", period: year, sheet: summary.name, importedAt: new Date().toISOString(), warnings }, audit: [] };
  }
  function achievement(k, value = k.current) {
    if (value === null || value === undefined || value === "" || k.target === null || k.target === undefined) return null;
    const actual = Number(value), target = Number(k.target);
    if (!Number.isFinite(actual) || !Number.isFinite(target) || actual === 0 || target === 0) return null;
    return round((k.direction === "menor" ? target / actual : actual / target) * 100);
  }
  window.BSCExcel = { readWorkbook, buildState, achievement, async parse(buffer, filename) { return buildState(await readWorkbook(buffer), filename); } };
})();
