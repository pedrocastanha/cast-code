import React, { useEffect, useRef } from 'react';
import { useRoomStore } from '../../store/roomStore';
import type { RoomConfig, RoomAgent, ConnectionLine } from '../../types/room.types';

// ============================================
// CONSTANTS
// ============================================

const TILE_W = 72;
const TILE_H = 36;
const GRID_W = 10;
const GRID_H = 8;
const ORIGIN_Y = 100;

// ============================================
// AGENT WANDERING SYSTEM
// ============================================

interface WanderState {
  currentX: number;
  currentY: number;
  targetX: number;
  targetY: number;
  speed: number;
  waitTicks: number;
  walkingToAgent: string | null;
  facingRight: boolean;
  enteredRoom: boolean;
  walkPhase: number; // for leg animation
}

const agentWander: Map<string, WanderState> = new Map();

function getWanderState(agent: RoomAgent): WanderState {
  const key = `${agent.instanceId}-${agent.id}`;
  if (!agentWander.has(key)) {
    agentWander.set(key, {
      currentX: -2,
      currentY: agent.isoY,
      targetX: agent.isoX,
      targetY: agent.isoY,
      speed: 0.03 + Math.random() * 0.02,
      waitTicks: 0,
      walkingToAgent: null,
      facingRight: true,
      enteredRoom: false,
      walkPhase: 0,
    });
  }
  return agentWander.get(key)!;
}

function pickRandomTarget(ws: WanderState): void {
  ws.targetX = 1 + Math.random() * (GRID_W - 2);
  ws.targetY = 1 + Math.random() * (GRID_H - 2);
  ws.walkingToAgent = null;
}

function updateWander(ws: WanderState, agent: RoomAgent, allAgents: RoomAgent[]): void {
  if (!ws.enteredRoom) {
    ws.targetX = agent.isoX;
    ws.targetY = agent.isoY;
    const dx = ws.targetX - ws.currentX;
    const dy = ws.targetY - ws.currentY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.1) {
      ws.enteredRoom = true;
      ws.waitTicks = 60 + Math.floor(Math.random() * 120);
    } else {
      ws.currentX += dx * 0.04;
      ws.currentY += dy * 0.04;
      ws.facingRight = dx > 0;
      ws.walkPhase += 0.15;
    }
    return;
  }

  if (agent.visualState === 'TALKING' && agent.bubble.visible) {
    const targetAgent = allAgents.find(a => a.id !== agent.id && a.instanceId !== agent.instanceId);
    if (targetAgent) {
      const tws = getWanderState(targetAgent);
      ws.targetX = tws.currentX + (ws.currentX > tws.currentX ? 1.5 : -1.5);
      ws.targetY = tws.currentY + (ws.currentY > tws.currentY ? 0.5 : -0.5);
      ws.walkingToAgent = targetAgent.id;
    }
  }

  if (agent.visualState === 'WORKING' || agent.visualState === 'TOOL_USE') {
    ws.waitTicks = 30;
  }

  const dx = ws.targetX - ws.currentX;
  const dy = ws.targetY - ws.currentY;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < 0.15) {
    ws.waitTicks--;
    ws.walkPhase = 0; // stop walking animation
    if (ws.waitTicks <= 0 && agent.visualState === 'IDLE') {
      pickRandomTarget(ws);
      ws.waitTicks = 120 + Math.floor(Math.random() * 240);
    }
  } else {
    const moveSpeed = ws.walkingToAgent ? ws.speed * 1.5 : ws.speed;
    ws.currentX += dx * moveSpeed;
    ws.currentY += dy * moveSpeed;
    ws.facingRight = dx > 0;
    ws.walkPhase += 0.15;
  }

  ws.currentX = Math.max(-0.5, Math.min(GRID_W - 0.5, ws.currentX));
  ws.currentY = Math.max(-0.5, Math.min(GRID_H - 0.5, ws.currentY));
}

function isAgentWalking(ws: WanderState): boolean {
  const dx = ws.targetX - ws.currentX;
  const dy = ws.targetY - ws.currentY;
  return Math.sqrt(dx * dx + dy * dy) > 0.15;
}

// ============================================
// HELPERS
// ============================================

function isoToScreen(gx: number, gy: number, canvas: HTMLCanvasElement): { x: number; y: number } {
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

function hexToRgba(hex: string, alpha: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = (num >> 16) & 0xff;
  const g = (num >> 8) & 0xff;
  const b = num & 0xff;
  return `rgba(${r},${g},${b},${alpha})`;
}

function drawRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
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
// AMBIENT PARTICLES
// ============================================

interface AmbientParticle {
  x: number; y: number; vx: number; vy: number;
  size: number; alpha: number; color: string;
  life: number; maxLife: number;
}

const MAX_PARTICLES = 35;
let particles: AmbientParticle[] = [];
let particlesInitialized = false;

function initParticles(canvas: HTMLCanvasElement, config: RoomConfig) {
  particles = [];
  for (let i = 0; i < MAX_PARTICLES; i++) {
    particles.push(createParticle(canvas, config));
  }
  particlesInitialized = true;
}

function createParticle(canvas: HTMLCanvasElement, config: RoomConfig): AmbientParticle {
  const maxLife = 200 + Math.random() * 300;
  return {
    x: Math.random() * canvas.width, y: Math.random() * canvas.height,
    vx: (Math.random() - 0.5) * 0.3, vy: -0.1 - Math.random() * 0.4,
    size: 1 + Math.random() * 2.5, alpha: 0,
    color: config.visual.accent,
    life: Math.random() * maxLife, maxLife,
  };
}

function updateAndDrawParticles(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, config: RoomConfig) {
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy; p.life++;
    const ratio = p.life / p.maxLife;
    p.alpha = ratio < 0.1 ? ratio / 0.1 : ratio > 0.7 ? 1 - (ratio - 0.7) / 0.3 : 1;
    if (p.life >= p.maxLife || p.x < -10 || p.x > canvas.width + 10 || p.y < -10 || p.y > canvas.height + 10) {
      particles[i] = createParticle(canvas, config);
      particles[i].life = 0;
      continue;
    }
    ctx.save();
    ctx.globalAlpha = p.alpha * 0.25;
    ctx.fillStyle = p.color;
    ctx.shadowBlur = 6; ctx.shadowColor = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

// ============================================
// BACKGROUND
// ============================================

function drawRoomBackground(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, config: RoomConfig) {
  const gradient = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, 0, canvas.width / 2, canvas.height / 2, Math.max(canvas.width, canvas.height));
  gradient.addColorStop(0, config.visual.bg);
  gradient.addColorStop(1, adjustBrightness(config.visual.bg, -0.1));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Vignette
  const vignette = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, canvas.width * 0.25, canvas.width / 2, canvas.height / 2, canvas.width * 0.7);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.4)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// ============================================
// FLOOR TILES
// ============================================

function drawFloorTile(ctx: CanvasRenderingContext2D, gx: number, gy: number, config: RoomConfig, canvas: HTMLCanvasElement) {
  const { x, y } = isoToScreen(gx, gy, canvas);
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(TILE_W / 2, TILE_H / 2); ctx.lineTo(0, TILE_H); ctx.lineTo(-TILE_W / 2, TILE_H / 2);
  ctx.closePath();
  const fillColor = (gx + gy) % 2 === 0 ? config.visual.floor : adjustBrightness(config.visual.floor, 0.12);
  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.strokeStyle = hexToRgba(config.visual.accent, 0.06);
  ctx.lineWidth = 0.5;
  ctx.stroke();
  ctx.restore();
}

// ============================================
// AMBIENT OBJECTS
// ============================================

function drawAmbientObject(ctx: CanvasRenderingContext2D, obj: { type: string; isoX: number; isoY: number; width: number }, config: RoomConfig, canvas: HTMLCanvasElement) {
  const { x, y } = isoToScreen(obj.isoX, obj.isoY, canvas);
  ctx.save();
  ctx.translate(x, y);
  switch (obj.type) {
    case 'bar_counter': case 'desk':
      ctx.fillStyle = adjustBrightness(config.visual.wall, 0.1);
      ctx.fillRect(-obj.width * TILE_W / 4, -14, obj.width * TILE_W / 2, 24);
      ctx.fillStyle = adjustBrightness(config.visual.wall, 0.2);
      ctx.fillRect(-obj.width * TILE_W / 4, -14, obj.width * TILE_W / 2, 4);
      ctx.fillStyle = hexToRgba(config.visual.accent, 0.3);
      ctx.fillRect(-obj.width * TILE_W / 4, -10, obj.width * TILE_W / 2, 1);
      break;
    case 'tree':
      ctx.fillStyle = '#4a3728'; ctx.fillRect(-5, -24, 10, 24);
      ctx.fillStyle = config.visual.light; ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.arc(0, -34, 20, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1; break;
    case 'bench_press':
      ctx.fillStyle = '#2a2a2a'; ctx.fillRect(-24, -6, 48, 12);
      ctx.fillStyle = '#1a1a1a'; ctx.fillRect(-30, -10, 12, 20); ctx.fillRect(18, -10, 12, 20);
      break;
    case 'control_panel':
      ctx.fillStyle = config.visual.wall; ctx.fillRect(-34, -18, 68, 36);
      for (let i = 0; i < 6; i++) {
        ctx.globalAlpha = Math.sin(Date.now() * 0.003 + i * 1.2) > 0 ? 0.7 : 0.2;
        ctx.fillStyle = config.visual.light;
        ctx.fillRect(-28 + i * 10, -12, 6, 6);
      }
      ctx.globalAlpha = 1; break;
    case 'fountain':
      ctx.fillStyle = config.visual.accent; ctx.globalAlpha = 0.35;
      ctx.beginPath(); ctx.ellipse(0, 0, 24, 12, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1; break;
    default:
      ctx.fillStyle = config.visual.wall; ctx.globalAlpha = 0.4;
      ctx.fillRect(-12, -12, 24, 24); ctx.globalAlpha = 1;
  }
  ctx.restore();
}

// ============================================
// PROGRAMMATIC CHARACTER DRAWING
// ============================================

function drawPixelCharacter(
  ctx: CanvasRenderingContext2D,
  color: string,
  role: string,
  facingRight: boolean,
  walkPhase: number,
  walking: boolean,
  visualState: string,
  tick: number
) {
  const dir = facingRight ? 1 : -1;
  const legSwing = walking ? Math.sin(walkPhase) * 6 : 0;
  const armSwing = walking ? Math.sin(walkPhase + 0.5) * 5 : 0;
  const bodyBob = walking ? Math.abs(Math.sin(walkPhase)) * 1.5 : 0;

  // Derived colors
  const skinColor = '#f4c087';
  const skinShadow = '#d4a06a';
  const shirtColor = color;
  const shirtShadow = adjustBrightness(color, -0.15);
  const pantsColor = '#2c3e50';
  const pantsShadow = '#1a252f';
  const shoeColor = '#1a1a1a';
  const hairColor = getHairColor(role);

  ctx.save();
  if (!facingRight) ctx.scale(-1, 1);

  // ── SHADOW on ground ──
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(0, 2, 14, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const baseY = -bodyBob;

  // ── SHOES ──
  // Left foot
  ctx.fillStyle = shoeColor;
  ctx.fillRect(-7 + legSwing * 0.5, baseY - 4, 7, 4);
  // Right foot
  ctx.fillRect(0 - legSwing * 0.5, baseY - 4, 7, 4);

  // ── LEGS / PANTS ──
  // Left leg
  ctx.fillStyle = pantsColor;
  ctx.fillRect(-6 + legSwing * 0.3, baseY - 18, 6, 14);
  ctx.fillStyle = pantsShadow;
  ctx.fillRect(-6 + legSwing * 0.3, baseY - 18, 2, 14);
  // Right leg
  ctx.fillStyle = pantsColor;
  ctx.fillRect(0 - legSwing * 0.3, baseY - 18, 6, 14);

  // ── BODY / SHIRT (Gordinho) ──
  // Belly
  ctx.fillStyle = shirtColor;
  ctx.beginPath();
  ctx.ellipse(2, baseY - 24, 13, 13, 0, 0, Math.PI * 2);
  ctx.fill();
  // Upper chest
  ctx.fillRect(-9, baseY - 38, 16, 15);
  // Shirt shadow side (back)
  ctx.fillStyle = shirtShadow;
  ctx.fillRect(-11, baseY - 38, 3, 22);

  // ── ARMS ──
  ctx.fillStyle = shirtColor;
  // Back arm (left arm)
  ctx.save();
  ctx.translate(-9, baseY - 34);
  ctx.rotate((armSwing * dir * Math.PI) / 180);
  ctx.fillRect(-2, 0, 5, 14);
  // Hand
  ctx.fillStyle = skinColor;
  ctx.fillRect(-1, 14, 4, 4);
  ctx.restore();

  // Front arm (right arm) holding mug
  ctx.fillStyle = shirtColor;
  ctx.save();
  ctx.translate(6, baseY - 33);
  ctx.rotate(-Math.PI / 6); // Arm bent forward to hold mug
  ctx.fillRect(-1, 0, 5, 12);
  ctx.fillStyle = skinColor;
  ctx.fillRect(0, 12, 4, 4);
  
  // Caneca de chope (Mug)
  // Glass
  ctx.fillStyle = 'rgba(240, 240, 255, 0.7)';
  ctx.fillRect(2, 3, 9, 11);
  // Beer liquid
  ctx.fillStyle = '#f39c12';
  ctx.fillRect(3, 6, 7, 7);
  // Froth (colarinho)
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.ellipse(6.5, 3.5, 6, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  // Mug handle
  ctx.strokeStyle = 'rgba(240, 240, 255, 0.7)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(11, 8, 3, -Math.PI/2, Math.PI/2);
  ctx.stroke();

  ctx.restore();
  // ── NECK ──
  ctx.fillStyle = skinColor;
  ctx.fillRect(-3, baseY - 42, 6, 5);

  // ── HEAD ──
  ctx.fillStyle = skinColor;
  ctx.beginPath();
  ctx.ellipse(0, baseY - 52, 10, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  // Face shadow
  ctx.fillStyle = skinShadow;
  ctx.beginPath();
  ctx.ellipse(-4, baseY - 49, 4, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  // ── EAR ──
  ctx.fillStyle = skinShadow;
  ctx.beginPath();
  ctx.arc(-2, baseY - 50, 2, 0, Math.PI * 2);
  ctx.fill();

  // ── HAIR (Careca com pouco cabelo do lado) ──
  ctx.fillStyle = hairColor;
  ctx.fillRect(-9, baseY - 53, 3, 5); // back side hair
  ctx.fillRect(-2, baseY - 53, 3, 2); // sideburns

  // ── EYES ──
  ctx.fillStyle = '#222';
  // Blink every ~120 ticks for 4 ticks
  const blinking = tick % 120 < 4;
  if (!blinking) {
    ctx.fillRect(3 * dir, baseY - 54, 2, 2);
    ctx.fillRect(7 * dir, baseY - 54, 2, 2);
    // Eye shine
    ctx.fillStyle = '#fff';
    ctx.fillRect(4 * dir, baseY - 55, 1, 1);
  } else {
    ctx.fillRect(3 * dir, baseY - 53, 3, 1);
    ctx.fillRect(7 * dir, baseY - 53, 3, 1);
  }

  // ── MOUTH ──
  ctx.fillStyle = '#222';
  if (visualState === 'TALKING') {
    // Animated mouth
    const mouthOpen = Math.sin(tick * 0.3) > 0;
    if (mouthOpen) {
      ctx.fillStyle = '#c0392b';
      ctx.fillRect(4 * dir, baseY - 48, 4, 3);
      ctx.fillStyle = '#fff';
      ctx.fillRect(4 * dir, baseY - 48, 4, 1);
    } else {
      ctx.fillRect(4 * dir, baseY - 48, 4, 1);
    }
  } else if (visualState === 'CELEBRATING') {
    ctx.fillStyle = '#e74c3c';
    ctx.beginPath();
    ctx.arc(5 * dir, baseY - 47, 2.5, 0, Math.PI);
    ctx.fill();
  } else {
    // Neutral smile
    ctx.fillRect(4 * dir, baseY - 48, 4, 1);
  }

  // ── ROLE ACCESSORIES ──
  drawRoleAccessory(ctx, role, color, baseY, dir, tick);

  // ── STATE VFX ──
  drawStateVFX(ctx, visualState, tick, baseY, color);

  ctx.restore();
}

function getHairColor(role: string): string {
  switch (role) {
    case 'orchestrator': return '#2c1810';
    case 'researcher': return '#5c3317';
    case 'coder': return '#1a1a2e';
    case 'reviewer': return '#4a3728';
    default: return '#3d2b1f';
  }
}

function drawRoleAccessory(ctx: CanvasRenderingContext2D, role: string, color: string, baseY: number, dir: number, _tick: number) {
  switch (role) {
    case 'orchestrator':
      // Tie
      ctx.fillStyle = adjustBrightness(color, -0.3);
      ctx.beginPath();
      ctx.moveTo(-1, baseY - 38);
      ctx.lineTo(1, baseY - 38);
      ctx.lineTo(2, baseY - 28);
      ctx.lineTo(-2, baseY - 28);
      ctx.closePath();
      ctx.fill();
      // Tie knot
      ctx.fillRect(-2, baseY - 38, 4, 2);
      break;

    case 'researcher':
      // Glasses
      ctx.strokeStyle = '#888';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(4 * dir, baseY - 53, 3.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(9 * dir, baseY - 53, 3.5, 0, Math.PI * 2);
      ctx.stroke();
      // Bridge
      ctx.beginPath();
      ctx.moveTo(7 * dir, baseY - 53);
      ctx.lineTo(5 * dir, baseY - 53);
      ctx.stroke();
      break;

    case 'coder':
      // Headphones
      ctx.strokeStyle = '#555';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, baseY - 56, 12, Math.PI, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#333';
      ctx.fillRect(-13, baseY - 55, 4, 8);
      ctx.fillRect(9, baseY - 55, 4, 8);
      break;

    case 'reviewer':
      // Monocle + mustache
      ctx.strokeStyle = '#c8a860';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(7 * dir, baseY - 53, 4, 0, Math.PI * 2);
      ctx.stroke();
      // Chain
      ctx.beginPath();
      ctx.moveTo(7 * dir, baseY - 49);
      ctx.lineTo(5 * dir, baseY - 40);
      ctx.stroke();
      break;
  }
}

function drawStateVFX(ctx: CanvasRenderingContext2D, state: string, tick: number, baseY: number, color: string) {
  switch (state) {
    case 'THINKING': {
      // Gear icons rotating above head
      const phase = (tick % 90) / 90;
      ctx.save();
      ctx.globalAlpha = 0.7;
      ctx.font = '12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('⚙️', Math.cos(phase * Math.PI * 2) * 6, baseY - 72 - phase * 8);
      ctx.globalAlpha = 0.4;
      ctx.fillText('⚙️', Math.cos(phase * Math.PI * 2 + 2) * 8, baseY - 68 - phase * 12);
      ctx.restore();
      break;
    }
    case 'WORKING': {
      // Sparks
      for (let i = 0; i < 4; i++) {
        const sp = ((tick + i * 12) % 30) / 30;
        const angle = (i * Math.PI * 2 / 4) + tick * 0.08;
        const rad = sp * 18;
        ctx.save();
        ctx.globalAlpha = (1 - sp) * 0.8;
        ctx.fillStyle = i % 2 === 0 ? '#ffcc00' : color;
        ctx.shadowBlur = 4; ctx.shadowColor = '#ffcc00';
        ctx.fillRect(Math.cos(angle) * rad - 1, baseY - 45 + Math.sin(angle) * rad - 1, 3, 3);
        ctx.restore();
      }
      break;
    }
    case 'TOOL_USE': {
      // Pulsing tool indicator
      const pulse = Math.sin(tick * 0.15) * 0.3 + 0.7;
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.font = '14px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('🔧', 14, baseY - 50);
      ctx.restore();
      break;
    }
    case 'CELEBRATING': {
      // Confetti!
      const colors = ['#ff0055', '#00ffaa', '#ffaa00', '#00aaff', '#aa00ff', '#ffff00'];
      for (let i = 0; i < 12; i++) {
        const fall = ((tick * 0.02 + i / 12) % 1);
        ctx.save();
        ctx.globalAlpha = (1 - fall) * 0.9;
        ctx.fillStyle = colors[i % colors.length];
        const cx = Math.sin(fall * Math.PI * 4 + i * 0.8) * 25;
        const cy = baseY - 75 + fall * 80;
        ctx.fillRect(cx - 1.5, cy - 1.5, 3, 3);
        ctx.restore();
      }
      break;
    }
  }
}

// ============================================
// FULL CHARACTER RENDER
// ============================================

function drawCharacter(
  ctx: CanvasRenderingContext2D,
  agent: RoomAgent,
  tick: number,
  config: RoomConfig,
  canvas: HTMLCanvasElement,
  allAgents: RoomAgent[]
) {
  const ws = getWanderState(agent);
  updateWander(ws, agent, allAgents);

  const screen = isoToScreen(ws.currentX, ws.currentY, canvas);
  const walking = isAgentWalking(ws);

  let yOffset = 0;
  if (walking) yOffset = Math.sin(tick * 0.15) * 1.5;
  else if (agent.visualState === 'IDLE') yOffset = Math.sin(tick * 0.04) * 1.5;
  if (agent.visualState === 'CELEBRATING') yOffset = -Math.sin(((tick % 60) / 60) * Math.PI) * 14;

  ctx.save();
  ctx.translate(screen.x, screen.y + yOffset);

  // Colored glow under character
  ctx.save();
  ctx.globalAlpha = 0.15;
  ctx.fillStyle = agent.instanceColor;
  ctx.shadowBlur = 16;
  ctx.shadowColor = agent.instanceColor;
  ctx.beginPath();
  ctx.ellipse(0, 4, 16, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Draw the programmatic character
  drawPixelCharacter(
    ctx,
    agent.instanceColor,
    agent.role || 'coder',
    ws.facingRight,
    ws.walkPhase,
    walking,
    agent.visualState,
    tick
  );

  // Agent name tag
  drawAgentLabel(ctx, agent, config);

  ctx.restore();
}

function drawAgentLabel(ctx: CanvasRenderingContext2D, agent: RoomAgent, _config: RoomConfig) {
  const name = agent.name;
  ctx.font = '600 10px "Inter", sans-serif';
  const textW = ctx.measureText(name).width;
  const pillW = textW + 10;
  const pillH = 16;
  const pillX = -pillW / 2;
  const pillY = 8;

  ctx.save();
  ctx.globalAlpha = 0.75;
  drawRoundRect(ctx, pillX, pillY, pillW, pillH, 8);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fill();
  ctx.strokeStyle = hexToRgba(agent.instanceColor, 0.6);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = 0.95;
  ctx.font = '600 10px "Inter", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 0, pillY + pillH / 2);
  ctx.textBaseline = 'alphabetic';
  ctx.globalAlpha = 1;
}

// ============================================
// SPEECH BUBBLES
// ============================================

function drawSpeechBubble(ctx: CanvasRenderingContext2D, agent: RoomAgent, config: RoomConfig, canvas: HTMLCanvasElement) {
  const ws = getWanderState(agent);
  const screen = isoToScreen(ws.currentX, ws.currentY, canvas);
  const { bubble } = agent;

  const age = Date.now() - bubble.createdAt;
  const BUBBLE_DURATION = 5000;
  if (age > BUBBLE_DURATION) return;

  // Animate in (scale up) and out (fade)
  let alpha = 1;
  let scale = 1;
  if (age < 300) {
    const t = age / 300;
    scale = 0.3 + t * 0.7;
    alpha = t;
  } else if (age > BUBBLE_DURATION * 0.75) {
    alpha = 1 - (age - BUBBLE_DURATION * 0.75) / (BUBBLE_DURATION * 0.25);
  }

  ctx.save();
  ctx.globalAlpha = alpha;

  const bx = screen.x;
  const by = screen.y - 72;

  const PAD_X = 10;
  const PAD_Y = 6;
  ctx.font = `${bubble.type === 'tool' ? 'bold ' : ''}11px "JetBrains Mono", monospace`;

  // Word wrap for longer messages
  const maxTextW = 180;
  const words = bubble.text.split(' ');
  const lines: string[] = [];
  let currentLine = '';
  for (const word of words) {
    const testLine = currentLine ? currentLine + ' ' + word : word;
    if (ctx.measureText(testLine).width > maxTextW) {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  if (lines.length > 3) {
    lines.length = 3;
    lines[2] = lines[2].slice(0, -3) + '...';
  }

  const lineH = 14;
  const longestLine = Math.max(...lines.map(l => ctx.measureText(l).width));
  const boxW = longestLine + PAD_X * 2 + (bubble.type === 'tool' ? 18 : 0);
  const boxH = lines.length * lineH + PAD_Y * 2;

  const finalX = bx + boxW / 2 > canvas.width - 10 ? bx - boxW - 10 : bx - boxW / 2;

  ctx.save();
  ctx.translate(bx, by);
  ctx.scale(scale, scale);
  ctx.translate(-bx, -by);

  if (bubble.type === 'thought') {
    // Thought bubble with dots
    ctx.beginPath();
    ctx.ellipse(finalX + boxW / 2, by - boxH / 2, boxW / 2 + 8, boxH / 2 + 8, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fill();
    ctx.strokeStyle = hexToRgba(config.visual.accent, 0.4);
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);

    // Thought dots
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(bx + i * 4, by + 8 + i * 5, 2 + i, 0, Math.PI * 2);
      ctx.fillStyle = hexToRgba(config.visual.accent, 0.4);
      ctx.fill();
    }
  } else {
    // Speech balloon
    drawRoundRect(ctx, finalX, by - boxH, boxW, boxH, 10);
    ctx.fillStyle = bubble.type === 'tool' ? 'rgba(10,10,30,0.85)' : 'rgba(0,0,0,0.65)';
    ctx.fill();
    ctx.strokeStyle = hexToRgba(agent.instanceColor, 0.7);
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Tail triangle
    ctx.beginPath();
    ctx.moveTo(bx - 5, by);
    ctx.lineTo(bx + 5, by);
    ctx.lineTo(bx, by + 10);
    ctx.closePath();
    ctx.fillStyle = bubble.type === 'tool' ? 'rgba(10,10,30,0.85)' : 'rgba(0,0,0,0.65)';
    ctx.fill();

    if (bubble.type === 'tool') {
      ctx.font = '10px sans-serif';
      ctx.fillStyle = config.visual.accent;
      ctx.fillText('🔧', finalX + 6, by - boxH / 2 + 4);
    }
  }

  // Text lines
  ctx.fillStyle = '#ffffff';
  ctx.font = `${bubble.type === 'tool' ? 'bold ' : ''}11px "JetBrains Mono", monospace`;
  ctx.textAlign = 'left';
  const textStartX = bubble.type === 'tool' ? finalX + PAD_X + 16 : finalX + PAD_X;
  for (let i = 0; i < lines.length; i++) {
    const lineY = bubble.type === 'thought'
      ? by - boxH / 2 + (i - lines.length / 2 + 0.5) * lineH + 4
      : by - boxH + PAD_Y + i * lineH + 10;
    ctx.fillText(lines[i], textStartX, lineY);
  }

  ctx.restore(); // scale
  ctx.restore(); // alpha
}

// ============================================
// CONNECTION LINES
// ============================================

function drawConnectionLine(ctx: CanvasRenderingContext2D, line: ConnectionLine, agents: RoomAgent[], canvas: HTMLCanvasElement, now: number) {
  const from = agents.find(a => a.id === line.fromAgentId);
  const to = agents.find(a => a.id === line.toAgentId);
  if (!from || !to) return;

  const fromWs = getWanderState(from);
  const toWs = getWanderState(to);
  const fromScr = isoToScreen(fromWs.currentX, fromWs.currentY, canvas);
  const toScr = isoToScreen(toWs.currentX, toWs.currentY, canvas);

  const age = now - line.createdAt;
  const alpha = age < 2000 ? 1 : 1 - (age - 2000) / 500;
  const dashOff = (now / 30) % 12;

  ctx.save();
  ctx.globalAlpha = alpha * 0.5;
  ctx.setLineDash([6, 6]);
  ctx.lineDashOffset = -dashOff;
  ctx.strokeStyle = hexToRgba(from.instanceColor, 0.6);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(fromScr.x, fromScr.y - 40);
  ctx.lineTo(toScr.x, toScr.y - 40);
  ctx.stroke();

  // Data packet glow ball
  const progress = ((now - line.createdAt) % 800) / 800;
  const pktX = fromScr.x + (toScr.x - fromScr.x) * progress;
  const pktY = (fromScr.y - 40) + ((toScr.y - 40) - (fromScr.y - 40)) * progress;
  ctx.beginPath(); ctx.arc(pktX, pktY, 3.5, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.shadowBlur = 10; ctx.shadowColor = from.instanceColor;
  ctx.fill(); ctx.shadowBlur = 0;
  ctx.restore();
}

// ============================================
// GRID BORDER GLOW
// ============================================

function drawGridBorderGlow(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, config: RoomConfig, tick: number) {
  const corners = [
    isoToScreen(0, 0, canvas),
    isoToScreen(GRID_W, 0, canvas),
    isoToScreen(GRID_W, GRID_H, canvas),
    isoToScreen(0, GRID_H, canvas),
  ];
  ctx.save();
  ctx.globalAlpha = Math.sin(tick * 0.02) * 0.1 + 0.15;
  ctx.strokeStyle = config.visual.accent;
  ctx.lineWidth = 1;
  ctx.shadowBlur = 8; ctx.shadowColor = config.visual.accent;
  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  ctx.lineTo(corners[1].x, corners[1].y + TILE_H);
  ctx.lineTo(corners[2].x, corners[2].y + TILE_H);
  ctx.lineTo(corners[3].x, corners[3].y + TILE_H);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

// ============================================
// MAIN CANVAS COMPONENT
// ============================================

export const RoomCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const agents = useRoomStore(s => s.agents);
  const connectionLines = useRoomStore(s => s.connectionLines);
  const roomConfig = useRoomStore(s => s.activeRoomConfig);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !roomConfig) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animFrameId: number;
    let globalTick = 0;

    const resize = () => {
      const parent = canvas.parentElement;
      if (parent) { canvas.width = parent.clientWidth; canvas.height = parent.clientHeight; }
      particlesInitialized = false;
    };
    window.addEventListener('resize', resize);
    resize();

    const loop = () => {
      globalTick++;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!particlesInitialized) initParticles(canvas, roomConfig);

      // 1. Background
      drawRoomBackground(ctx, canvas, roomConfig);

      // 2. Particles
      updateAndDrawParticles(ctx, canvas, roomConfig);

      // 3. Floor
      for (let gy = 0; gy < GRID_H; gy++)
        for (let gx = 0; gx < GRID_W; gx++)
          drawFloorTile(ctx, gx, gy, roomConfig, canvas);

      // 4. Grid glow
      drawGridBorderGlow(ctx, canvas, roomConfig, globalTick);

      // 5. Ambient objects
      for (const obj of roomConfig.visual.ambientObjects)
        drawAmbientObject(ctx, obj, roomConfig, canvas);

      // 6. Characters (depth sorted)
      const sorted = [...agents].sort((a, b) => {
        const wa = getWanderState(a);
        const wb = getWanderState(b);
        return (wa.currentX + wa.currentY) - (wb.currentX + wb.currentY);
      });
      for (const agent of sorted)
        drawCharacter(ctx, agent, globalTick, roomConfig, canvas, agents);

      // 7. Connection lines
      const now = Date.now();
      for (const line of connectionLines)
        if (now - line.createdAt < 2500)
          drawConnectionLine(ctx, line, agents, canvas, now);

      // 8. Speech bubbles (on top)
      for (const agent of sorted)
        if (agent.bubble.visible)
          drawSpeechBubble(ctx, agent, roomConfig, canvas);

      animFrameId = requestAnimationFrame(loop);
    };

    animFrameId = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(animFrameId); window.removeEventListener('resize', resize); };
  }, [agents, connectionLines, roomConfig]);

  return (
    <canvas
      ref={canvasRef}
      className="room-canvas"
      style={{ width: '100%', height: '100%', display: 'block' }}
    />
  );
};
