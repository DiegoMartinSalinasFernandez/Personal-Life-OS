/** Minimal RFC-4180 CSV reader/writer (quotes, escaped quotes, CRLF, embedded newlines). */
export function parseCSV(text: string, delimiter?: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const delim = delimiter ?? ([",", ";", "\t"].map((d) => [d, firstLine.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0]);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delim) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

const esc = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCSV(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
}

export type DateFormat = "ymd" | "mdy" | "dmy";
/** Converts a date string in the given format to YYYY-MM-DD, or null. */
export function normalizeDate(raw: string, format: DateFormat): string | null {
  const s = raw.trim();
  const iso = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  let y: number, m: number, d: number;
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else {
    const parts = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
    if (!parts) return null;
    const a = Number(parts[1]), b = Number(parts[2]);
    y = Number(parts[3]);
    if (y < 100) y += 2000;
    [m, d] = format === "dmy" ? [b, a] : [a, b];
  }
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function guessDateFormat(samples: string[]): DateFormat {
  let dmy = 0, mdy = 0;
  for (const s of samples) {
    if (/^\d{4}/.test(s.trim())) return "ymd";
    const p = s.trim().match(/^(\d{1,2})[-/.](\d{1,2})/);
    if (!p) continue;
    if (Number(p[1]) > 12) dmy++;
    if (Number(p[2]) > 12) mdy++;
  }
  return dmy > mdy ? "dmy" : "mdy";
}

export function downloadText(filename: string, text: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
