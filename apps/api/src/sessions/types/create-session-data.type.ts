export type CreateSessionData = {
  id: string;
  userId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  userAgent?: string;
  ipAddress?: string;
};

export type SessionMetadata = {
  userAgent?: string;
  ipAddress?: string;
};
