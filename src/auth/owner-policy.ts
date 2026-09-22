export function canCreateOwner(
  existingUserCount: number,
  candidateEmail: string,
  configuredOwnerEmail: string,
): boolean {
  return existingUserCount === 0 &&
    candidateEmail.toLowerCase() === configuredOwnerEmail.toLowerCase();
}
