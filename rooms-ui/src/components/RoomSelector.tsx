import React from 'react';
import { useRoomStore } from '../store/roomStore';
import { ROOM_CONFIGS } from '../configs';

export const RoomSelector: React.FC = () => {
  const activeRoomId = useRoomStore((s) => s.activeRoomId);
  const setRoom = useRoomStore((s) => s.setRoom);
  const instances = useRoomStore((s) => s.instances);

  const rooms = Object.values(ROOM_CONFIGS);

  return (
    <div className="room-selector">
      <div className="room-selector-header">
        <span>Salas</span>
      </div>
      <div className="room-selector-list">
        {rooms.map((room) => {
          const isActive = room.id === activeRoomId;
          const instanceCount = Array.from(instances.values()).filter(
            (i) => i.roomId === room.id
          ).length;

          return (
            <button
              key={room.id}
              className={`room-card ${isActive ? 'active' : ''}`}
              onClick={() => setRoom(room.id)}
            >
              <div className="room-card-emoji">{room.visual.emoji}</div>
              <div className="room-card-content">
                <div className="room-card-name">{room.name}</div>
                <div className="room-card-description">{room.description}</div>
                {instanceCount > 0 && (
                  <div className="room-card-instances">
                    {instanceCount} {instanceCount === 1 ? 'instância' : 'instâncias'}
                  </div>
                )}
              </div>
              {isActive && <div className="room-card-indicator" />}
            </button>
          );
        })}
      </div>
    </div>
  );
};
