import React, { useEffect, useRef } from 'react';
import { useRoomStore } from '../../store/roomStore';
import type { RoomConfig, RoomAgent, ConnectionLine } from '../../types/room.types';





const TILE_W = 64;
const TILE_H = 32;
const GRID_W = 10;
const GRID_H = 8;
const ORIGIN_Y = 80;

const AGENT_IMAGES: Record<string, HTMLImageElement> = {};

function getAgentImage(roomId: string): HTMLImageElement {
  if (!AGENT_IMAGES[roomId]) {
    const img = new Image();
    img.src = `/agent_${roomId}.png`;
    AGENT_IMAGES[roomId] = img;
  }
  return AGENT_IMAGES[roomId];
}

function isoToScreen(
  gx: number,
  gy: number,
  canvas: HTMLCanvasElement
): { x: number; y: number } {
  const originX = canvas.width / 2;
  return {
    x: originX + (gx - gy) * (TILE_W / 2),
    y: ORIGIN_Y + (gx + gy) * (TILE_H / 2),
  };
}





function adjustBrightness(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + Math.floor(amount * 255)));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00ff) + Math.floor(amount * 255)));
  const b = Math.min(255, Math.max(0, (num & 0x0000ff) + Math.floor(amount * 255)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ============================================
// BACKGROUND RENDERING
// ============================================

function drawRoomBackground(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  config: RoomConfig
) {
  const gradient = ctx.createRadialGradient(
    canvas.width / 2,
    canvas.height / 2,
    0,
    canvas.width / 2,
    canvas.height / 2,
    Math.max(canvas.width, canvas.height)
  );
  gradient.addColorStop(0, config.visual.bg);
  gradient.addColorStop(1, adjustBrightness(config.visual.bg, -0.1));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// ============================================
// FLOOR TILE RENDERING
// ============================================

function drawFloorTile(
  ctx: CanvasRenderingContext2D,
  gx: number,
  gy: number,
  config: RoomConfig,
  canvas: HTMLCanvasElement
) {
  const { x, y } = isoToScreen(gx, gy, canvas);
  const { floor } = config.visual;

  ctx.save();
  ctx.translate(x, y);

  // Losango isométrico (tile)
  ctx.beginPath();
  ctx.moveTo(0, 0); // topo
  ctx.lineTo(TILE_W / 2, TILE_H / 2); // direita
  ctx.lineTo(0, TILE_H); // base
  ctx.lineTo(-TILE_W / 2, TILE_H / 2); // esquerda
  ctx.closePath();

  // Fill baseado no padrão da sala
  let fillColor = floor;
  switch (config.visual.tilePattern) {
    case 'wood':
    case 'grass':
    case 'tiles':
    case 'checkerboard':
      fillColor = (gx + gy) % 2 === 0 ? floor : adjustBrightness(floor, 0.15);
      break;
    case 'metal':
      fillColor = floor;
      break;
  }

  ctx.fillStyle = fillColor;
  ctx.fill();

  // Borda do tile (muito sutil)
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 0.5;
  ctx.stroke();

  ctx.restore();
}

// ============================================
// AMBIENT OBJECT RENDERING
// ============================================

function drawAmbientObject(
  ctx: CanvasRenderingContext2D,
  obj: { type: string; isoX: number; isoY: number; width: number },
  config: RoomConfig,
  canvas: HTMLCanvasElement
) {
  const { x, y } = isoToScreen(obj.isoX, obj.isoY, canvas);

  ctx.save();
  ctx.translate(x, y);

  // Desenha objetos simplificados baseados no tipo
  switch (obj.type) {
    case 'bar_counter':
    case 'desk':
      ctx.fillStyle = config.visual.wall;
      ctx.fillRect(-obj.width * TILE_W / 4, -10, obj.width * TILE_W / 2, 20);
      break;

    case 'tree':
      // Tronco
      ctx.fillStyle = '#4a3728';
      ctx.fillRect(-4, -20, 8, 20);
      // Copa
      ctx.fillStyle = config.visual.light;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.arc(0, -28, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      break;

    case 'bench_press':
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(-20, -5, 40, 10);
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(-25, -8, 10, 16);
      ctx.fillRect(15, -8, 10, 16);
      break;

    case 'control_panel':
      ctx.fillStyle = config.visual.wall;
      ctx.fillRect(-30, -15, 60, 30);
      ctx.fillStyle = config.visual.light;
      ctx.globalAlpha = 0.5;
      for (let i = 0; i < 5; i++) {
        ctx.fillRect(-25 + i * 12, -10, 6, 6);
      }
      ctx.globalAlpha = 1;
      break;

    case 'porthole':
      ctx.fillStyle = config.visual.accent;
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.arc(0, 0, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = config.visual.accent;
      ctx.lineWidth = 2;
      ctx.stroke();
      break;

    case 'fountain':
      ctx.fillStyle = config.visual.accent;
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.ellipse(0, 0, 20, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      break;

    default:
      // Objeto genérico
      ctx.fillStyle = config.visual.wall;
      ctx.globalAlpha = 0.5;
      ctx.fillRect(-10, -10, 20, 20);
      ctx.globalAlpha = 1;
  }

  ctx.restore();
}

// ============================================
// CHARACTER RENDERING
// ============================================

function drawCharacterShadow(
  ctx: CanvasRenderingContext2D,
  yOffset: number
) {
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(0, yOffset, 12 - yOffset / 4, 6 - yOffset / 8, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawBaseCharacter(
  _ctx: CanvasRenderingContext2D,
  _agent: RoomAgent,
  _options: {
    armLOffset?: { x: number; y: number };
    armROffset?: { x: number; y: number };
  } = {}
) {
  // Replaced by 3D sprite rendering in drawCharacter
}

function drawCharacter(
  ctx: CanvasRenderingContext2D,
  agent: RoomAgent,
  tick: number,
  config: RoomConfig,
  canvas: HTMLCanvasElement
) {
  const screen = isoToScreen(agent.isoX, agent.isoY, canvas);

  // Aplica bob vertical no estado IDLE
  let yOffset = 0;
  if (agent.visualState === 'IDLE') {
    yOffset = Math.sin(tick * 0.04) * 2;
  }
  if (agent.visualState === 'CELEBRATING') {
    // Salto — ciclo de 30 frames
    const phase = (tick % 60) / 60;
    yOffset = -Math.sin(phase * Math.PI) * 16;
  }

  const x = screen.x;
  const y = screen.y + yOffset;

  ctx.save();
  ctx.translate(x, y);

  // Sombra elíptica no chão
  drawCharacterShadow(ctx, yOffset);

  const img = getAgentImage(config.id);

  // Draw the actual character sprite
  const spriteW = 54;
  const spriteH = 54;
  ctx.drawImage(img, -spriteW / 2, -spriteH + 10, spriteW, spriteH);

  // Body of the character visual state specific VFX over the sprite
  switch (agent.visualState) {
    case 'IDLE':
      break;

    case 'THINKING':
      // VFX Engrenagem
      const thinkPhase = (tick % 60) / 60;
      ctx.fillStyle = config.visual.accent;
      ctx.globalAlpha = 1 - thinkPhase;
      ctx.font = '10px Arial';
      ctx.fillText('⚙️', 0, -38 - (thinkPhase * 15));
      ctx.globalAlpha = 1;
      break;

    case 'WORKING':
      // VFX Fagulhas
      const sparkPhase = (tick % 15) / 15;
      ctx.fillStyle = '#ffcc00';
      for (let i = 0; i < 3; i++) {
        const angle = (i * Math.PI * 2 / 3) + tick * 0.1;
        const rad = sparkPhase * 18;
        ctx.globalAlpha = 1 - sparkPhase;
        ctx.fillRect(Math.cos(angle) * rad, Math.sin(angle) * rad - 12, 2, 2);
      }
      ctx.globalAlpha = 1;
      break;

    case 'TOOL_USE':
      if (tick % 6 < 3) {
        drawBaseCharacter(ctx, agent, { armROffset: { x: 14, y: -18 } });
      } else {
        drawBaseCharacter(ctx, agent);
      }
      break;

    case 'TALKING':
      drawBaseCharacter(ctx, agent);
      break;

    case 'CELEBRATING':
      drawCharacterCelebrating(ctx, agent, tick, config);
      break;
  }

  // Nome do agente abaixo do personagem
  drawAgentLabel(ctx, agent);

  ctx.restore();
}

function _drawCharacterWorking(
  _ctx: CanvasRenderingContext2D,
  _agent: RoomAgent,
  _tick: number,
  _config: RoomConfig
) {
  switch (config.id) {
    case 'bar': {
      const armRaise = Math.sin((tick % 40) / 40 * Math.PI * 2) * 8;
      drawBaseCharacter(ctx, agent, { armROffset: { x: 7, y: -14 + armRaise } });
      // Copo na mão
      ctx.fillStyle = config.visual.accent;
      ctx.fillRect(8, -14 + armRaise, 5, 8);
      break;
    }
    case 'office': {
      const frame = Math.floor(tick / 5) % 4;
      const armPositions = [
        [-8, -4, 0, -6],
        [-6, -2, 2, -8],
        [-4, 0, 4, -4],
        [-6, -2, 2, -6],
      ];
      const [lx, ly, rx, ry] = armPositions[frame];
      drawBaseCharacter(ctx, agent, {
        armLOffset: { x: lx, y: ly },
        armROffset: { x: rx, y: ry },
      });
      break;
    }
    case 'gym': {
      const liftPhase = Math.abs(Math.sin((tick % 60) / 60 * Math.PI));
      ctx.rotate(Math.PI / 2);
      drawBaseCharacter(ctx, agent, {
        armLOffset: { x: -10, y: -14 + liftPhase * 12 },
        armROffset: { x: 7, y: -14 + liftPhase * 12 },
      });
      ctx.rotate(-Math.PI / 2);
      break;
    }
    case 'park': {
      const runFrame = Math.floor(tick / 2) % 8;
      drawRunningCharacter(ctx, agent, runFrame);
      break;
    }
    case 'space': {
      const float = Math.sin(tick * 0.025) * 8;
      const tilt = Math.sin(tick * 0.015) * 0.08;
      ctx.translate(0, float);
      ctx.rotate(tilt);
      drawBaseCharacter(ctx, agent);
      ctx.rotate(-tilt);
      ctx.translate(0, -float);
      break;
    }
    default:
      drawBaseCharacter(ctx, agent);
  }
}

function drawRunningCharacter(
  ctx: CanvasRenderingContext2D,
  agent: RoomAgent,
  frame: number
) {
  const legPositions = [
    { l: 0, r: 8 },
    { l: 3, r: 5 },
    { l: 6, r: 2 },
    { l: 8, r: 0 },
    { l: 6, r: 2 },
    { l: 3, r: 5 },
    { l: 0, r: 8 },
    { l: -2, r: 6 },
  ];
  const { l, r } = legPositions[frame];
  ctx.save();
  ctx.translate(0, Math.sin(frame * Math.PI / 4) * 2);
  ctx.rotate(0.1);
  drawBaseCharacter(ctx, agent, {
    armLOffset: { y: -14 + l / 2, x: -8 },
    armROffset: { y: -14 + r / 2, x: 8 },
  });
  ctx.restore();
}

function drawCharacterCelebrating(
  ctx: CanvasRenderingContext2D,
  agent: RoomAgent,
  tick: number,
  _config: RoomConfig
) {
  drawBaseCharacter(ctx, agent, {
    armLOffset: { x: -12, y: -22 },
    armROffset: { x: 12, y: -22 },
  });

  // Gravity Confetti!
  const phase = (tick % 90) / 90;
  const colors = ['#ff0055', '#00ffaa', '#ffaa00', '#00aaff', '#aa00ff'];
  for (let i = 0; i < 12; i++) {
    const fall = ((phase + (i / 12)) % 1);
    const cy = -60 + fall * 80;
    const cx = Math.sin(fall * Math.PI * 4 + i) * 25;
    ctx.fillStyle = colors[i % colors.length];
    ctx.globalAlpha = 1 - fall;
    ctx.fillRect(cx, cy, 3, 3);
  }
  ctx.globalAlpha = 1;
}

function drawAgentLabel(
  ctx: CanvasRenderingContext2D,
  agent: RoomAgent
) {
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = '10px "Inter", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(agent.name, 0, 28);
}

// ============================================
// SPEECH BUBBLE RENDERING
// ============================================

function drawSpeechBubble(
  ctx: CanvasRenderingContext2D,
  agent: RoomAgent,
  config: RoomConfig,
  canvas: HTMLCanvasElement
) {
  const screen = isoToScreen(agent.isoX, agent.isoY, canvas);
  const { bubble } = agent;

  // Fade out automático após 3s
  const age = Date.now() - bubble.createdAt;
  const BUBBLE_DURATION = 3000;
  if (age > BUBBLE_DURATION) return;
  const alpha = age > BUBBLE_DURATION * 0.7
    ? 1 - (age - BUBBLE_DURATION * 0.7) / (BUBBLE_DURATION * 0.3)
    : 1;

  ctx.save();
  ctx.globalAlpha = alpha;

  const bx = screen.x;
  const by = screen.y - 60;

  // Padding e dimensões
  const PAD_X = 10;
  ctx.font = `${bubble.type === 'tool' ? 'bold ' : ''}12px "JetBrains Mono", monospace`;
  const textW = Math.min(ctx.measureText(bubble.text).width, 160);
  const boxW = textW + PAD_X * 2;
  const boxH = 26;

  // Posição: se muito à direita, espelha para esquerda
  const finalX = bx + boxW / 2 > canvas.width - 10
    ? bx - boxW - 10
    : bx - boxW / 2;

  switch (bubble.type) {
    case 'speech':
      drawRoundRect(ctx, finalX, by - boxH, boxW, boxH, 8);
      ctx.fillStyle = config.visual.accent;
      ctx.globalAlpha = alpha * 0.15;
      ctx.fill();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = config.visual.accent;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      
      ctx.beginPath();
      ctx.moveTo(bx - 4, by);
      ctx.lineTo(bx + 4, by);
      ctx.lineTo(bx, by + 8);
      ctx.closePath();
      ctx.fillStyle = config.visual.accent;
      ctx.globalAlpha = alpha * 0.15;
      ctx.fill();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = config.visual.accent;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      break;

    case 'thought':
      
      ctx.beginPath();
      ctx.ellipse(finalX + boxW / 2, by - boxH / 2, boxW / 2 + 4, boxH / 2 + 4, 0, 0, Math.PI * 2);
      ctx.fillStyle = config.visual.accent;
      ctx.globalAlpha = alpha * 0.1;
      ctx.fill();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = config.visual.accent;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      
      const dotPositions = [
        { x: bx, y: by + 6, r: 2 },
        { x: bx + 2, y: by + 2, r: 3 },
        { x: bx, y: by - 1, r: 4 },
      ];
      for (const d of dotPositions) {
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fillStyle = config.visual.accent;
        ctx.fill();
      }

      
      const dots = ['', '.', '..', '...'];
      const dotFrame = Math.floor(Date.now() / 500) % 4;
      ctx.fillStyle = config.visual.accent;
      ctx.fillText(dots[dotFrame], finalX + PAD_X, by - boxH / 2 + 4);
      ctx.restore();
      return; // retorna aqui — não desenha texto abaixo

    case 'tool':
      
      ctx.setLineDash([3, 3]);
      drawRoundRect(ctx, finalX, by - boxH, boxW + 20, boxH, 6);
      ctx.fillStyle = '#1a1a2e';
      ctx.globalAlpha = alpha * 0.8;
      ctx.fill();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = config.visual.accent;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);

      
      ctx.font = '10px sans-serif';
      ctx.fillStyle = config.visual.accent;
      ctx.fillText('⚙', finalX + 5, by - boxH / 2 + 4);
      break;
  }

  
  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = alpha;
  ctx.font = `${bubble.type === 'tool' ? 'bold ' : ''}12px "JetBrains Mono", monospace`;
  ctx.fillText(
    bubble.text,
    bubble.type === 'tool' ? finalX + PAD_X + 16 : finalX + PAD_X,
    by - boxH / 2 + 4
  );

  ctx.restore();
}





function drawConnectionLine(
  ctx: CanvasRenderingContext2D,
  line: ConnectionLine,
  agents: RoomAgent[],
  canvas: HTMLCanvasElement,
  now: number
) {
  const from = agents.find((a) => a.id === line.fromAgentId);
  const to = agents.find((a) => a.id === line.toAgentId);
  if (!from || !to) return;

  const fromScreen = isoToScreen(from.isoX, from.isoY, canvas);
  const toScreen = isoToScreen(to.isoX, to.isoY, canvas);

  const age = now - line.createdAt;
  const alpha = age < 2000 ? 1 : 1 - (age - 2000) / 500;
  const dashOff = (now / 30) % 12;

  ctx.save();
  ctx.globalAlpha = alpha * 0.7;
  ctx.setLineDash([6, 6]);
  ctx.lineDashOffset = -dashOff;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;

  ctx.beginPath();
  ctx.moveTo(fromScreen.x, fromScreen.y - 20);
  ctx.lineTo(toScreen.x, toScreen.y - 20);
  ctx.stroke();

  
  drawArrowHead(ctx, fromScreen, toScreen);

  // Bola de luz do pacote de dados (Data Packet Flow)
  const progress = ((now - line.createdAt) % 800) / 800; // completa a viagem em 0.8s
  const pktX = fromScreen.x + (toScreen.x - fromScreen.x) * progress;
  const pktY = (fromScreen.y - 20) + ((toScreen.y - 20) - (fromScreen.y - 20)) * progress;
  
  ctx.beginPath();
  ctx.arc(pktX, pktY, 3, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.shadowBlur = 8;
  ctx.shadowColor = '#ffffff';
  ctx.fill();
  ctx.shadowBlur = 0; // reset

  ctx.restore();
}

function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number }
) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const arrowLength = 10;
  const arrowX = to.x;
  const arrowY = to.y - 20;

  ctx.save();
  ctx.translate(arrowX, arrowY);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-arrowLength, -5);
  ctx.lineTo(-arrowLength, 5);
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();
}





export const RoomCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const agents = useRoomStore((s) => s.agents);
  const connectionLines = useRoomStore((s) => s.connectionLines);
  const roomConfig = useRoomStore((s) => s.activeRoomConfig);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !roomConfig) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animFrameId: number;
    let globalTick = 0;

    
    const resize = () => {
      const parent = canvas.parentElement;
      if (parent) {
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
      }
    };
    window.addEventListener('resize', resize);
    resize();

    const loop = () => {
      globalTick++;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      
      drawRoomBackground(ctx, canvas, roomConfig);

      
      for (let gy = 0; gy < GRID_H; gy++) {
        for (let gx = 0; gx < GRID_W; gx++) {
          drawFloorTile(ctx, gx, gy, roomConfig, canvas);
        }
      }

      
      for (const obj of roomConfig.visual.ambientObjects) {
        drawAmbientObject(ctx, obj, roomConfig, canvas);
      }

      
      const sortedAgents = [...agents].sort(
        (a, b) => (a.isoX + a.isoY) - (b.isoX + b.isoY)
      );
      for (const agent of sortedAgents) {
        drawCharacter(ctx, agent, globalTick, roomConfig, canvas);
      }

      
      const now = Date.now();
      for (const line of connectionLines) {
        if (now - line.createdAt < 2500) {
          drawConnectionLine(ctx, line, agents, canvas, now);
        }
      }

      
      for (const agent of sortedAgents) {
        if (agent.bubble.visible) {
          drawSpeechBubble(ctx, agent, roomConfig, canvas);
        }
      }

      animFrameId = requestAnimationFrame(loop);
    };

    animFrameId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animFrameId);
      window.removeEventListener('resize', resize);
    };
  }, [agents, connectionLines, roomConfig]);

  return (
    <canvas
      ref={canvasRef}
      className="room-canvas"
      style={{
        width: '100%',
        height: '100%',
        display: 'block',
      }}
    />
  );
};
