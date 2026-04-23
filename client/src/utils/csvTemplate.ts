export function downloadAssetCsvTemplate() {
  const headers = [
    'name', 'type', 'status', 'manufacturer', 'serialNumber',
    'price', 'purchaseDate', 'assignedTo', 'propertyNumber',
    'location', 'remarks', 'warrantyExpiry', 'warrantyNotes',
  ].join(',');

  const row1 = [
    'Lenovo ThinkPad E14', 'LAPTOP', 'AVAILABLE', 'Lenovo', 'SN-001234',
    '95000', '2024-01-15', '', 'PROP-001', 'Room 101', '',
    '2027-01-15', '3-year warranty',
  ].join(',');

  const row2 = [
    'Acer All-in-One', 'DESKTOP', 'ASSIGNED', 'Acer', 'SN-005678',
    '49999', '2023-06-01', 'Juan dela Cruz', 'PROP-002', 'Room 202',
    'For accounting dept', '2025-06-01', '1-year carry-in',
  ].join(',');

  const csvContent = [headers, row1, row2].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'asset-import-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export function parseCsvFile(file: File): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.trim().split('\n');
      if (lines.length < 2) {
        resolve([]);
        return;
      }
      const headers = lines[0].split(',').map(h => h.trim());
      const rows = lines.slice(1).map(line => {
        const values = line.split(',');
        const row: Record<string, string> = {};
        headers.forEach((h, i) => {
          row[h] = (values[i] || '').trim();
        });
        return row;
      });
      resolve(rows);
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

export type RowValidationResult =
  | { valid: true }
  | { valid: false; reason: string };

const VALID_TYPES = ['LAPTOP', 'DESKTOP', 'MONITOR', 'PRINTER', 'TABLET', 'PHONE', 'SERVER', 'OTHER'];
const VALID_STATUSES = ['AVAILABLE', 'ASSIGNED', 'MAINTENANCE', 'RETIRED'];

export function validateAssetRow(
  row: Record<string, string>,
  _rowNumber: number,
): RowValidationResult {
  if (!row.name || row.name.trim() === '') {
    return { valid: false, reason: 'Name is required' };
  }
  if (!VALID_TYPES.includes(row.type?.toUpperCase())) {
    return { valid: false, reason: `Invalid type: ${row.type}` };
  }
  if (row.status && !VALID_STATUSES.includes(row.status?.toUpperCase())) {
    return { valid: false, reason: `Invalid status: ${row.status}` };
  }
  if (row.price && isNaN(parseFloat(row.price))) {
    return { valid: false, reason: 'Price must be a number' };
  }
  if (row.purchaseDate && isNaN(Date.parse(row.purchaseDate))) {
    return { valid: false, reason: 'Invalid date format for Purchase Date' };
  }
  if (row.warrantyExpiry && isNaN(Date.parse(row.warrantyExpiry))) {
    return { valid: false, reason: 'Invalid date format for Warranty Expiry' };
  }
  return { valid: true };
}
