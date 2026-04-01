import crypto from 'node:crypto';

export const signPayload = (payload: string, secret: Buffer): string => {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
};

export const timingSafeCompare = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};
