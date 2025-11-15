declare module 'node-machine-id' {
  /**
   * Get the machine ID synchronously
   * @param original - If true, returns the original machine ID without hashing
   * @returns The machine ID as a string
   */
  export function machineIdSync(original?: boolean): string;

  /**
   * Get the machine ID asynchronously
   * @param original - If true, returns the original machine ID without hashing
   * @returns A promise that resolves to the machine ID as a string
   */
  export function machineId(original?: boolean): Promise<string>;
}
