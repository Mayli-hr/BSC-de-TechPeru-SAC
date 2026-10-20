/* Exportaciones locales: archivos XLSX válidos y respaldos portátiles con evidencias. */
window.BSCExport = (() => {
  "use strict";
  const xml = value => String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
  function download(filename, blob) {
    const url = URL.createObjectURL(blob), link = document.createElement("a");
    link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  function column(index) { let s = ""; for (index++; index; index = Math.floor((index - 1) / 26)) s = String.fromCharCode(65 + (index - 1) % 26) + s; return s; }
  async function xlsx(report, filename) {
    const zip = new JSZip();
    const rows = [[report.title], [report.subtitle], [], report.headers, ...report.rows];
    const content = rows.map((row, r) => `<row r="${r + 1}" ht="${r === 0 ? 28 : r === 1 ? 32 : r === 3 ? 34 : r > 3 ? Math.min(180, Math.max(32, Math.max(...row.map(v => Math.ceil(String(v ?? "").length / 24))) * 15)) : 15}" customHeight="1">${row.map((value, c) => {
      const ref = `${column(c)}${r + 1}`, style = r === 0 ? 1 : r === 3 ? 2 : 0;
      return typeof value === "number" && Number.isFinite(value) ? `<c r="${ref}" s="${style}"><v>${value}</v></c>` : `<c r="${ref}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
    }).join("")}</row>`).join("");
    zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`);
    zip.file("_rels/.rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
    zip.file("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Reporte BSC" sheetId="1" r:id="rId1"/></sheets></workbook>`);
    zip.file("xl/_rels/workbook.xml.rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
    zip.file("xl/styles.xml", `<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="16"/><name val="Calibri"/><color rgb="FF173A63"/></font><font><b/><sz val="11"/><name val="Calibri"/><color rgb="FFFFFFFF"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF173A63"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="3"><xf fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf fontId="1" fillId="0" borderId="0" xfId="0"/><xf fontId="2" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs></styleSheet>`);
    const last = column(Math.max(0, report.headers.length - 1));
    zip.file("xl/worksheets/sheet1.xml", `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="${Math.max(1, report.headers.length)}" width="24" customWidth="1"/></cols><sheetData>${content}</sheetData><autoFilter ref="A4:${last}${Math.max(4, rows.length)}"/><mergeCells count="2"><mergeCell ref="A1:${last}1"/><mergeCell ref="A2:${last}2"/></mergeCells><pageSetup orientation="landscape" paperSize="9"/></worksheet>`);
    download(filename, await zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", compression: "DEFLATE" }));
  }
  function attachments(workspace) {
    const refs = new Map();
    Object.values(workspace.years).forEach(year => year.kpis.forEach(k => k.measurements.forEach(m => (m.evidence || []).forEach(e => refs.set(e.id, e)))));
    return [...refs.values()];
  }
  async function backup(workspace) {
    const zip = new JSZip(), missing = [];
    for (const meta of attachments(workspace)) {
      const record = await BSCStorage.evidence.get(meta.id);
      if (record?.blob) zip.file("evidencias/" + meta.id, await record.blob.arrayBuffer()); else missing.push(meta.name);
    }
    if (missing.length) throw new Error("Faltan evidencias en este navegador: " + missing.join(", ") + ". Revisa sus registros antes de respaldar.");
    zip.file("data.json", JSON.stringify(workspace, null, 2));
    zip.file("LEEME.txt", "Respaldo BSC: datos de todos los ejercicios y evidencias. Restáuralo desde Administración > Restaurar respaldo.\n");
    download("respaldo_techperu_" + new Date().toISOString().slice(0, 10) + ".zip", await zip.generateAsync({ type: "blob", compression: "DEFLATE" }));
  }
  async function readBackup(file) {
    if (file.size > 100 * 1024 * 1024) throw new Error("El respaldo supera los 100 MB.");
    if (/\.json$/i.test(file.name)) {
      const candidate = JSON.parse(await file.text());
      return { workspace: BSCStorage.validateWorkspace(candidate), records: [], jsonOnly: true };
    }
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const payload = zip.file("data.json"); if (!payload) throw new Error("El ZIP no contiene un respaldo BSC.");
    const text = await payload.async("string"); if (text.length > 10 * 1024 * 1024) throw new Error("El respaldo tiene demasiados datos.");
    const workspace = BSCStorage.validateWorkspace(JSON.parse(text)), records = [];
    let total = 0;
    for (const meta of attachments(workspace)) {
      if (!/^[A-Za-z0-9_-]{1,100}$/.test(meta.id) || !["image/png", "image/jpeg", "image/webp", "application/pdf"].includes(meta.type)) throw new Error("Hay una evidencia con formato no permitido.");
      const entry = zip.file("evidencias/" + meta.id); if (!entry) throw new Error("Falta una evidencia dentro del respaldo: " + meta.name);
      const bytes = await entry.async("uint8array"); total += bytes.length;
      if (bytes.length > 5 * 1024 * 1024 || total > 100 * 1024 * 1024) throw new Error("Las evidencias superan el tamaño permitido.");
      records.push({ ...meta, blob: new Blob([bytes], { type: meta.type }) });
    }
    return { workspace, records, jsonOnly: false };
  }
  return { download, xlsx, backup, readBackup };
})();
