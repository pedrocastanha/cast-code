import React from 'react';
import { useRoomStore } from '../store/roomStore';
import '../styles/notifications.css';

export const NotificationsOverlay: React.FC = () => {
  const notifications = useRoomStore((s) => s.notifications);

  if (notifications.length === 0) {
    return null;
  }

  return (
    <div className="notifications-overlay">
      {notifications
        .filter((n) => n.visible)
        .map((notification) => (
          <div
            key={notification.id}
            className="notification-toast"
            style={{ animation: 'slideIn 0.3s ease-out' }}
          >
            <div className="notification-icon">📢</div>
            <div className="notification-content">
              <span className="notification-from">User</span>
              <span className="notification-text">{notification.content}</span>
            </div>
          </div>
        ))}
    </div>
  );
};
