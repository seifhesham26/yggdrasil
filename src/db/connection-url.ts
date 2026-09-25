/** Keep pg v8's current certificate checks explicit across driver upgrades. */
export function normalizeDatabaseUrl(connectionString: string): string {
  if (!connectionString) return connectionString;
  const url = new URL(connectionString);
  if (url.searchParams.get("uselibpqcompat") === "true") return connectionString;
  if (["prefer", "require", "verify-ca"].includes(url.searchParams.get("sslmode") ?? "")) {
    url.searchParams.set("sslmode", "verify-full");
    return url.toString();
  }
  return connectionString;
}
