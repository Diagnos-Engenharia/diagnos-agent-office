import { useEffect, useRef, useState } from 'react';
import type { AgentId } from '../events/types';
import { startGameLoop } from '../vendor/pixel-agents/gameLoop';
import { drawCharacter } from '../vendor/pixel-agents/characters';
import { AGENTS, STATE_COLORS, type AgentActivity } from './officeModel';

const WIDTH = 780;
const HEIGHT = 426;
const STATIONS = [{ x: 193, y: 166 }, { x: 389, y: 166 }, { x: 586, y: 166 }, { x: 285, y: 303 }, { x: 498, y: 303 }];
type OfficeCanvasProps = {
  activities: Record<AgentId, AgentActivity>;
  selectedAgent: AgentId;
  onSelectAgent: (id: AgentId) => void;
  animate: boolean;
  referenceProject: boolean;
};

function pixelRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

function plant(ctx: CanvasRenderingContext2D, x: number, y: number, tall = false) {
  pixelRect(ctx, x - 9, y - 7, 18, 13, '#795957');
  pixelRect(ctx, x - 6, y + 6, 12, 4, '#483e42');
  pixelRect(ctx, x - 2, y - 32, 4, 26, '#4d7e5e');
  const leaves = tall ? [[-13, -42, 13, 15], [1, -37, 15, 12], [-17, -28, 15, 10], [2, -23, 18, 9]] : [[-13, -26, 13, 12], [0, -31, 13, 12], [2, -17, 15, 9]];
  for (const [dx, dy, w, h] of leaves) pixelRect(ctx, x + dx, y + dy, w, h, '#527f65');
  pixelRect(ctx, x + 2, y - 30, 5, 9, '#7ca078');
}

function drawRoom(ctx: CanvasRenderingContext2D, time: number, animated: boolean) {
  pixelRect(ctx, 0, 0, WIDTH, HEIGHT, '#15262b');
  // The furniture is drawn for Diagnos; only the characters and animation loop are upstream assets.
  pixelRect(ctx, 25, 17, 730, 375, '#263b3e');
  pixelRect(ctx, 25, 17, 730, 82, '#34494a');
  pixelRect(ctx, 25, 99, 730, 8, '#12272d');
  pixelRect(ctx, 25, 107, 730, 285, '#2a3d3f');
  for (let y = 111; y < 392; y += 35) {
    for (let x = 25; x < 755; x += 49) {
      pixelRect(ctx, x, y, 48, 34, ((x / 49 + y / 35) % 3 < 1) ? '#2c4041' : '#293c3e');
      pixelRect(ctx, x, y + 34, 49, 1, '#233639');
    }
  }
  pixelRect(ctx, 143, 124, 496, 231, '#233639');
  ctx.strokeStyle = '#354e4d';
  ctx.lineWidth = 2;
  ctx.strokeRect(147, 128, 488, 223);
  pixelRect(ctx, 25, 17, 730, 5, '#4b6160');
  pixelRect(ctx, 25, 22, 5, 370, '#3a5150');
  pixelRect(ctx, 750, 22, 5, 370, '#344b4b');
  pixelRect(ctx, 25, 392, 730, 8, '#0f2126');
  pixelRect(ctx, 35, 400, 710, 4, '#0f2126');
  // Windows, wall display, and open shelves.
  for (const x of [144, 247]) {
    pixelRect(ctx, x, 37, 77, 49, '#1d3037');
    pixelRect(ctx, x + 5, 42, 67, 38, '#42636a');
    pixelRect(ctx, x + 36, 42, 3, 38, '#243e44');
    pixelRect(ctx, x + 5, 62, 67, 3, '#243e44');
    pixelRect(ctx, x + 9, 46, 20, 4, '#54767a');
    pixelRect(ctx, x - 3, 84, 83, 5, '#758d89');
  }
  pixelRect(ctx, 363, 32, 173, 53, '#1d3134');
  ctx.strokeStyle = '#5d8075'; ctx.strokeRect(363, 32, 173, 53);
  ctx.fillStyle = '#a8d6c8'; ctx.textAlign = 'center'; ctx.font = 'bold 12px monospace';
  ctx.fillText('DIAGNOS / OFFICE', 450, 53);
  ctx.fillStyle = '#73988e'; ctx.font = '8px monospace';
  ctx.fillText('BUILD. REVIEW. SHIP.', 450, 70);
  pixelRect(ctx, 570, 37, 76, 46, '#567170');
  pixelRect(ctx, 574, 41, 68, 36, '#91a5a0');
  for (let index = 0; index < 3; index++) {
    pixelRect(ctx, 582 + index * 18, 47, 12, 10, ['#87b6a2', '#ceb989', '#97adc3'][index]);
    pixelRect(ctx, 582 + index * 18, 61, 12, 3, '#6a8480');
  }
  pixelRect(ctx, 51, 37, 54, 48, '#806d59');
  pixelRect(ctx, 55, 41, 46, 17, '#263735');
  pixelRect(ctx, 55, 63, 46, 16, '#263735');
  for (let index = 0; index < 6; index++) pixelRect(ctx, 59 + index * 6, 44, 4, 14 - index % 3, ['#899d80', '#a39c74', '#6e8d9d'][index % 3]);
  for (let index = 0; index < 5; index++) pixelRect(ctx, 63 + index * 6, 65, 4, 13, ['#829c8a', '#a99384'][index % 2]);
  // Server corner, coffee nook, lounge, and plants.
  pixelRect(ctx, 683, 51, 37, 71, '#1a2a2f');
  for (let index = 0; index < 4; index++) {
    pixelRect(ctx, 687, 58 + index * 14, 29, 10, '#33474a');
    pixelRect(ctx, 690, 62 + index * 14, 12, 2, '#596d6d');
    pixelRect(ctx, 710, 61 + index * 14, 3, 3, animated && Math.floor(time * 2 + index) % 3 ? '#83cbb1' : '#447764');
  }
  pixelRect(ctx, 48, 301, 70, 36, '#746957');
  pixelRect(ctx, 48, 298, 70, 9, '#9a8770');
  pixelRect(ctx, 54, 273, 24, 27, '#283f42');
  pixelRect(ctx, 59, 279, 15, 8, '#53676a');
  pixelRect(ctx, 62, 292, 8, 5, '#d1c1a4');
  pixelRect(ctx, 91, 291, 9, 8, '#b4c5bc');
  pixelRect(ctx, 100, 292, 4, 4, '#a8b4ac');
  pixelRect(ctx, 658, 280, 63, 54, '#3a625a');
  pixelRect(ctx, 654, 291, 9, 45, '#507971');
  pixelRect(ctx, 716, 291, 9, 45, '#507971');
  pixelRect(ctx, 663, 307, 53, 17, '#60857a');
  pixelRect(ctx, 661, 335, 5, 6, '#14282b');
  pixelRect(ctx, 714, 335, 5, 6, '#14282b');
  pixelRect(ctx, 679, 351, 31, 10, '#8a7a63');
  pixelRect(ctx, 683, 361, 4, 15, '#504b41');
  pixelRect(ctx, 703, 361, 4, 15, '#504b41');
  plant(ctx, 87, 164, true); plant(ctx, 696, 231, true); plant(ctx, 166, 353); plant(ctx, 614, 361);
  ctx.fillStyle = '#628580'; ctx.font = '7px monospace'; ctx.textAlign = 'left';
  ctx.fillText('01 / ENGINEERING FLOOR', 40, 384);
  ctx.textAlign = 'right'; ctx.fillText('PIXEL AGENTS × DIAGNOS', 742, 384);
}

function drawStation(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, activity: AgentActivity, selected: boolean, time: number) {
  pixelRect(ctx, x - 46, y + 14, 95, 20, '#1a2d30');
  pixelRect(ctx, x - 50, y - 21, 100, 30, '#857660');
  pixelRect(ctx, x - 50, y - 21, 100, 5, '#a39175');
  pixelRect(ctx, x - 50, y + 9, 100, 7, '#635b4d');
  pixelRect(ctx, x - 44, y + 16, 5, 21, '#4b4c41');
  pixelRect(ctx, x + 38, y + 16, 5, 21, '#4b4c41');
  pixelRect(ctx, x - 22, y - 54, 44, 31, '#172a31');
  pixelRect(ctx, x - 18, y - 50, 36, 23, activity.state === 'idle' ? '#24474e' : '#294e56');
  pixelRect(ctx, x - 3, y - 23, 6, 6, '#22363b');
  pixelRect(ctx, x - 12, y - 17, 24, 3, '#263a3c');
  const working = activity.state === 'working';
  for (let index = 0; index < 4; index++) {
    const length = 12 + ((index + Math.floor(working ? time * 3 : 0)) % 3) * 5;
    pixelRect(ctx, x - 13, y - 44 + index * 4, length, 2, working && index % 2 ? color : '#548884');
  }
  pixelRect(ctx, x - 16, y - 6, 30, 7, '#435354');
  pixelRect(ctx, x + 24, y - 7, 8, 8, '#b3c3b8');
  pixelRect(ctx, x + 32, y - 5, 3, 4, '#9baea3');
  pixelRect(ctx, x - 13, y + 22, 27, 20, '#344a4d');
  pixelRect(ctx, x - 16, y + 25, 5, 18, '#496264');
  pixelRect(ctx, x + 12, y + 25, 5, 18, '#496264');
  pixelRect(ctx, x - 3, y + 42, 6, 10, '#1c3033');
  pixelRect(ctx, x - 13, y + 50, 27, 3, '#1c3033');
  if (selected) {
    ctx.strokeStyle = color; ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]); ctx.strokeRect(x - 59, y - 61, 118, 121); ctx.setLineDash([]);
    pixelRect(ctx, x - 59, y - 61, 5, 5, color);
  }
}

export function OfficeCanvas({ activities, selectedAgent, onSelectAgent, animate, referenceProject }: OfficeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef({ activities, selectedAgent, animate, referenceProject });
  propsRef.current = { activities, selectedAgent, animate, referenceProject };
  const [loaded, setLoaded] = useState(false);
  const [spriteError, setSpriteError] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const listener = () => setReducedMotion(preference.matches);
    preference.addEventListener('change', listener);
    return () => preference.removeEventListener('change', listener);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let stop: (() => void) | undefined;
    let elapsed = 0;
    const positions = STATIONS.map(station => ({ x: station.x, y: station.y + 26 }));
    const sprites = AGENTS.map(agent => {
      const sprite = new Image();
      sprite.src = `/assets/characters/char_${agent.sprite}.png`;
      return sprite;
    });
    const loads = sprites.map(sprite => new Promise<void>((resolve, reject) => {
      if (sprite.complete && sprite.naturalWidth) return resolve();
      sprite.onload = () => resolve();
      sprite.onerror = () => reject(new Error('Character sprite could not be loaded.'));
    }));
    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * ratio));
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    void Promise.all(loads).then(() => {
      if (cancelled) return;
      setLoaded(true);
      stop = startGameLoop(canvas, {
        update(dt) { if (!reducedMotion && propsRef.current.animate && !propsRef.current.referenceProject) elapsed += dt; },
        render(ctx) {
          ctx.setTransform(canvas.width / WIDTH, 0, 0, canvas.height / HEIGHT, 0, 0);
          const props = propsRef.current;
          const animated = !reducedMotion && props.animate && !props.referenceProject;
          drawRoom(ctx, elapsed, animated);
          AGENTS.forEach((agent, index) => {
            const station = STATIONS[index];
            const activity = props.referenceProject ? { state: 'idle' as const } : props.activities[agent.id];
            drawStation(ctx, station.x, station.y, agent.color, activity, agent.id === props.selectedAgent, elapsed);
          });
          AGENTS.forEach((agent, index) => {
            const station = STATIONS[index];
            const activity = props.referenceProject ? { state: 'idle' as const } : props.activities[agent.id];
            const idle = activity.state === 'idle';
            const walking = idle && animated;
            const targetX = walking ? station.x + Math.sin(elapsed * 0.45 + index * 1.5) * 35 : station.x;
            const targetY = walking ? station.y + 66 + Math.cos(elapsed * 0.45 + index * 1.5) * 7 : station.y + 26;
            const position = positions[index];
            const dx = targetX - position.x;
            if (animated) {
              position.x += (targetX - position.x) * 0.09;
              position.y += (targetY - position.y) * 0.09;
            } else { position.x = targetX; position.y = targetY; }
            const direction = walking ? (dx < 0 ? 'left' : 'right') : 'down';
            const action = walking ? 'walk' : activity.state === 'working' ? 'typing' : activity.state === 'waiting' ? 'reading' : 'idle';
            ctx.fillStyle = '#172c2d'; ctx.beginPath(); ctx.ellipse(position.x, position.y - 1, 17, 5, 0, 0, Math.PI * 2); ctx.fill();
            drawCharacter(ctx, sprites[index], position.x, position.y, animated ? elapsed : 0, action, direction, 1.55);
            // Every character has an explicit state bubble and a persistent desk name.
            if (activity.state !== 'idle') {
              const bubbleX = Math.round(position.x + 19), bubbleY = Math.round(position.y - 62);
              pixelRect(ctx, bubbleX - 10, bubbleY - 9, 22, 19, '#d5dfd4');
              pixelRect(ctx, bubbleX - 7, bubbleY + 10, 5, 4, '#d5dfd4');
              ctx.fillStyle = STATE_COLORS[activity.state];
              pixelRect(ctx, bubbleX - 7, bubbleY - 6, 16, 13, '#264441');
              ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center';
              ctx.fillStyle = STATE_COLORS[activity.state];
              ctx.fillText(activity.state === 'working' ? '</>' : activity.state === 'waiting' ? '…' : activity.state === 'success' ? '✓' : '!', bubbleX + 1, bubbleY + 5);
            }
            ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center';
            ctx.fillStyle = agent.id === props.selectedAgent ? agent.color : '#96afaa';
            ctx.fillText(agent.shortName, station.x, station.y + 81);
            pixelRect(ctx, station.x - 27, station.y + 86, 54, 2, STATE_COLORS[activity.state]);
          });
        },
      });
    }).catch(() => { if (!cancelled) setSpriteError(true); });
    return () => { cancelled = true; stop?.(); observer.disconnect(); };
  }, [reducedMotion]);

  return (
    <div className={`office-canvas-wrap ${referenceProject ? 'reference-office' : ''}`}>
      <canvas ref={canvasRef} className="office-canvas" aria-label="Escritório em pixel art. Selecione os agentes pelos cartões abaixo." role="img"
        onClick={event => {
          const bounds = event.currentTarget.getBoundingClientRect();
          const x = (event.clientX - bounds.left) * WIDTH / bounds.width;
          const y = (event.clientY - bounds.top) * HEIGHT / bounds.height;
          const index = STATIONS.findIndex(station => Math.abs(x - station.x) < 62 && y > station.y - 65 && y < station.y + 90);
          if (index >= 0) onSelectAgent(AGENTS[index].id);
        }} />
      {!loaded && !spriteError && <div className="canvas-placeholder">Preparando o escritório…</div>}
      {spriteError && <div className="canvas-placeholder">Os personagens não carregaram. Atualize a página para tentar novamente.</div>}
      {referenceProject && <div className="reference-overlay"><span>PROJETO DE REFERÊNCIA</span><strong>Sem fonte conectada</strong><p>Atividades aparecerão quando um adaptador for configurado.</p></div>}
    </div>
  );
}
