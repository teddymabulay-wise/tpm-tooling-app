/**
 * Flattens nested objects into a single level with dot notation
 * Handles arrays by converting them to comma-separated strings
 */
export function flattenObject(obj: any, prefix: string = ''): Record<string, any> {
  const flattened: Record<string, any> = {};

  const flatten = (current: any, key: string) => {
    if (current === null || current === undefined) {
      flattened[key] = '';
    } else if (Array.isArray(current)) {
      // For arrays, join values with semicolon
      if (current.length === 0) {
        flattened[key] = '';
      } else if (typeof current[0] === 'object') {
        // If array contains objects, extract name field or stringify
        const values = current.map(item => item.name || JSON.stringify(item));
        flattened[key] = values.join('; ');
      } else {
        flattened[key] = current.join('; ');
      }
    } else if (typeof current === 'object') {
      // Recursively flatten nested objects
      for (const nestedKey in current) {
        if (Object.prototype.hasOwnProperty.call(current, nestedKey)) {
          const newKey = key ? `${key}.${nestedKey}` : nestedKey;
          flatten(current[nestedKey], newKey);
        }
      }
    } else {
      flattened[key] = current;
    }
  };

  flatten(obj, prefix);
  return flattened;
}

/**
 * Converts array of objects to CSV format
 */
export function convertToCSV(data: any[], columns?: string[]): string {
  if (data.length === 0) return '';

  // Flatten all objects
  const flattenedData = data.map(item => flattenObject(item));

  // Get all unique column names
  const allColumns = columns || Array.from(
    new Set(flattenedData.flatMap(row => Object.keys(row)))
  ).sort();

  // Create CSV header
  const header = allColumns.map(col => `"${col.replace(/"/g, '""')}"`).join(',');

  // Create CSV rows
  const rows = flattenedData.map(row => {
    return allColumns.map(col => {
      const value = row[col];
      if (value === null || value === undefined) {
        return '';
      }
      const stringValue = String(value);
      if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    }).join(',');
  });

  return [header, ...rows].join('\n');
}

/**
 * Extracts all possible columns from an array of objects
 */
export function extractColumns(data: any[]): string[] {
  if (data.length === 0) return [];

  const flattenedData = data.map(item => flattenObject(item));
  const columns = Array.from(
    new Set(flattenedData.flatMap(row => Object.keys(row)))
  ).sort();

  return columns;
}

/**
 * Downloads CSV as a file
 */
export function downloadCSV(csv: string, filename: string = 'export.csv') {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
