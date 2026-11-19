import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

export function exportToExcel(rows: Record<string, unknown>[], filename: string): void {
  const sheet = XLSX.utils.json_to_sheet(rows)
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, 'Report')
  XLSX.writeFile(book, `${filename}.xlsx`)
}

export function exportToPdf(
  title: string,
  columns: string[],
  rows: Array<Array<string | number>>,
  filename: string
): void {
  const doc = new jsPDF()
  doc.setFontSize(14)
  doc.text(title, 14, 16)
  autoTable(doc, {
    head: [columns],
    body: rows,
    startY: 22,
    styles: { fontSize: 9 },
  })
  doc.save(`${filename}.pdf`)
}
