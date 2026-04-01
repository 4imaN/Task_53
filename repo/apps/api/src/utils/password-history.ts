import argon2 from 'argon2';

export const PASSWORD_REUSE_MESSAGE = 'New password must not match the last 5 passwords';

export const assertPasswordNotReused = async (
  candidatePassword: string,
  currentPasswordHash: string,
  passwordHistory: string[] | null | undefined,
  historyDepth: number
): Promise<void> => {
  const recentHashes = [currentPasswordHash, ...(passwordHistory ?? [])].slice(0, historyDepth);

  for (const hash of recentHashes) {
    if (await argon2.verify(hash, candidatePassword)) {
      throw new Error(PASSWORD_REUSE_MESSAGE);
    }
  }
};
