import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const randomText = (length = 5): string => {
  return Array.from({ length }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
};

const createSvg = (text: string): string => {
  const chars = text.split('');
  const lines = Array.from({ length: 4 }, (_, index) => {
    const y = 20 + index * 16;
    return `<line x1="0" y1="${y}" x2="180" y2="${y + 6}" stroke="rgba(15,23,42,0.15)" stroke-width="2" />`;
  }).join('');
  const glyphs = chars
    .map((char, index) => {
      const x = 18 + index * 28;
      const rotation = (index % 2 === 0 ? -8 : 7) + index;
      return `<text x="${x}" y="40" transform="rotate(${rotation} ${x} 40)" fill="#0f172a" font-size="24" font-family="monospace">${char}</text>`;
    })
    .join('');

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="180" height="56" viewBox="0 0 180 56" role="img" aria-label="captcha">
      <rect width="180" height="56" rx="10" fill="#e2e8f0" />
      ${lines}
      ${glyphs}
    </svg>
  `.trim();
};

export class CaptchaService {
  constructor(private readonly fastify: FastifyInstance) {}

  async create(username: string): Promise<{ id: string; svg: string; expiresAt: string }> {
    const answer = randomText();
    const svg = createSvg(answer);
    const expiresAt = new Date(Date.now() + config.captchaTtlMinutes * 60_000).toISOString();
    const id = randomUUID();

    await this.fastify.db.query(
      `
        INSERT INTO captcha_challenges (id, username, answer, svg_markup, expires_at)
        VALUES ($1, $2, $3, $4, $5)
      `,
      [id, username.toLowerCase(), answer, svg, expiresAt]
    );

    return { id, svg, expiresAt };
  }

  async verify(id: string, username: string, answer: string): Promise<boolean> {
    const result = await this.fastify.db.query<{
      answer: string;
      expires_at: string;
      consumed_at: string | null;
    }>(
      `
        SELECT answer, expires_at, consumed_at
        FROM captcha_challenges
        WHERE id = $1 AND username = $2
      `,
      [id, username.toLowerCase()]
    );

    if (!result.rowCount) {
      return false;
    }

    const challenge = result.rows[0];
    if (challenge.consumed_at || new Date(challenge.expires_at).getTime() < Date.now()) {
      return false;
    }

    const matches = challenge.answer.toUpperCase() === answer.trim().toUpperCase();
    if (matches) {
      await this.fastify.db.query(`UPDATE captcha_challenges SET consumed_at = NOW() WHERE id = $1`, [id]);
    }

    return matches;
  }
}
