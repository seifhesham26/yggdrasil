declare const storageKeyBrand: unique symbol;

export type StorageKey = string & { readonly [storageKeyBrand]: true };

export function parseStorageKey(value: string): StorageKey {
  const segments = value.split("/");
  if (
    value.length === 0 ||
    value.startsWith("/") ||
    value.includes("\\") ||
    value.includes(":") ||
    value.includes("\0") ||
    value.includes("%") ||
    segments.some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new Error("Invalid storage key.");
  }
  return value as StorageKey;
}
