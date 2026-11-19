/**
 * Reads a persisted choice, falling back to the first one if it is missing
 * or no longer offered.
 *
 * @param {Pick<Storage, "getItem">} storage
 * @param {string} key
 * @param {readonly string[]} choices
 */
export function readChoice(storage, key, choices) {
  const value = storage.getItem(key);
  return value !== null && choices.includes(value) ? value : choices[0];
}
