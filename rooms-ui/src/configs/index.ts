import type { RoomConfig } from '../types/room.types';
import { BAR_CONFIG } from './bar.config';
import { OFFICE_CONFIG } from './office.config';
import { GYM_CONFIG } from './gym.config';
import { PARK_CONFIG } from './park.config';
import { SPACE_CONFIG } from './space.config';

export const ROOM_CONFIGS: Record<string, RoomConfig> = {
  bar: BAR_CONFIG,
  office: OFFICE_CONFIG,
  gym: GYM_CONFIG,
  park: PARK_CONFIG,
  space: SPACE_CONFIG,
};

export { BAR_CONFIG } from './bar.config';
export { OFFICE_CONFIG } from './office.config';
export { GYM_CONFIG } from './gym.config';
export { PARK_CONFIG } from './park.config';
export { SPACE_CONFIG } from './space.config';
