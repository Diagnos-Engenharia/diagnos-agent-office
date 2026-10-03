/**
 * Frame mapping adapted from Pixel Agents office/sprites/spriteData.ts.
 * Copyright (c) 2026 Pablo De Lucca. MIT License.
 * https://github.com/pixel-agents-hq/pixel-agents
 * Bundled character sheets are artwork by JIK-A-4 / MetroCity, CC0 1.0,
 * separately attributed in THIRD_PARTY_NOTICES.md.
 */
export const CHARACTER_FRAME = { width: 16, height: 32 };
const walkFrames = [0, 1, 2, 1];

export function drawCharacter(
  ctx: CanvasRenderingContext2D,
  sprite: HTMLImageElement,
  x: number,
  y: number,
  elapsed: number,
  action: 'walk' | 'typing' | 'reading' | 'idle',
  direction: 'down' | 'up' | 'right' | 'left' = 'down',
  scale = 1.5,
) {
  const row = direction === 'up' ? 1 : direction === 'left' || direction === 'right' ? 2 : 0;
  const frame = action === 'walk' ? walkFrames[Math.floor(elapsed / 0.15) % 4]
    : action === 'typing' ? 3 + Math.floor(elapsed / 0.3) % 2
      : action === 'reading' ? 5 + Math.floor(elapsed / 0.3) % 2 : 1;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (direction === 'left') ctx.scale(-1, 1);
  ctx.drawImage(sprite, frame * 16, row * 32, 16, 32, -8 * scale, -32 * scale, 16 * scale, 32 * scale);
  ctx.restore();
}
