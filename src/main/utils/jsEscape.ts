/**
 * Utility functions for safely escaping strings for JavaScript execution
 */

/**
 * Safely escapes a string for use in JavaScript template literals or single-quoted strings
 * This prevents code injection by properly escaping all dangerous characters:
 * - Backslashes (\)
 * - Single quotes (')
 * - Double quotes (")
 * - Backticks (`)
 * - Template expression delimiters (${)
 * - Newlines and other control characters
 *
 * @param str The string to escape
 * @returns The safely escaped string for JavaScript
 */
export function escapeJavaScriptString(str: string): string {
  if (typeof str !== 'string') {
    return '';
  }

  return str
    .replace(/\\/g, '\\\\') // Escape backslashes first (must be first!)
    .replace(/'/g, "\\'") // Escape single quotes
    .replace(/"/g, '\\"') // Escape double quotes
    .replace(/`/g, '\\`') // Escape backticks (template literals)
    .replace(/\$\{/g, '\\${') // Escape template expression start
    .replace(/\n/g, '\\n') // Escape newlines
    .replace(/\r/g, '\\r') // Escape carriage returns
    .replace(/\t/g, '\\t') // Escape tabs
    .replace(/\u2028/g, '\\u2028') // Escape line separator
    .replace(/\u2029/g, '\\u2029'); // Escape paragraph separator
}

/**
 * Safer alternative: Use JSON.stringify for string literals in JavaScript
 * This is often the safest approach as JSON.stringify handles all escaping correctly
 *
 * @param str The string to make safe for JavaScript
 * @returns A JSON-stringified version of the string (includes quotes)
 */
export function jsonStringifyForJS(str: string): string {
  return JSON.stringify(str);
}

/**
 * Create a safe JavaScript expression that assigns a value to a variable
 * Uses JSON.stringify to ensure complete safety
 *
 * @param value The value to assign
 * @returns A safe JavaScript expression
 */
export function createSafeAssignment(value: string): string {
  return jsonStringifyForJS(value);
}
