// Builds and downloads a CSV file from a 2D array of cell values. Numbers are
// emitted raw (no thousands separators) so spreadsheets parse them as numbers;
// strings are quoted only when they contain a comma, quote, or newline.
function escapeCell(value: string | number | null | undefined): string {
  if (value == null) return '';
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadCsv(
  filename: string,
  rows: (string | number | null | undefined)[][],
): void {
  const csv = rows.map(row => row.map(escapeCell).join(',')).join('\r\n');
  // Prepend a UTF-8 BOM so Excel reads accented names correctly.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
