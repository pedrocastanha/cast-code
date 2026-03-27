import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface InboxMessage {
  id: string;
  fromAgentId: string;
  fromAgentName: string;
  content: string;
  type: 'task' | 'question' | 'broadcast' | 'result';
  timestamp: number;
  read: boolean;
}

@Injectable()
export class RoomInboxService implements OnModuleInit {
  private readonly logger = new Logger(RoomInboxService.name);
  private readonly INBOX_DIR = path.join(process.cwd(), '.cast', 'rooms');

  onModuleInit() {
    this.ensureInboxDirectory();
  }

  private ensureInboxDirectory(): void {
    try {
      fs.mkdirSync(this.INBOX_DIR, { recursive: true });
    } catch (error) {
      this.logger.warn(`Failed to create inbox directory: ${(error as Error).message}`);
    }
  }

  private ensureRoomDirectory(roomId: string): void {
    const safeRoomId = roomId.replace(/[^a-zA-Z0-9-_]/g, '_');
    const roomPath = path.join(this.INBOX_DIR, safeRoomId);
    try {
      fs.mkdirSync(roomPath, { recursive: true });
    } catch (error) {
      this.logger.warn(`Failed to create room directory: ${(error as Error).message}`);
    }
  }

  private getAgentInboxPath(roomId: string, agentId: string): string {
    const safeRoomId = roomId.replace(/[^a-zA-Z0-9-_]/g, '_');
    const safeAgentId = agentId.replace(/[^a-zA-Z0-9-_]/g, '_');
    return path.join(this.INBOX_DIR, safeRoomId, `${safeAgentId}.json`);
  }

  async deliverMessage(
    roomId: string,
    agentId: string,
    message: Omit<InboxMessage, 'id' | 'read' | 'timestamp'>,
  ): Promise<void> {
    const inboxPath = this.getAgentInboxPath(roomId, agentId);

    try {
      this.ensureRoomDirectory(roomId);

      let messages: InboxMessage[] = [];
      if (fs.existsSync(inboxPath)) {
        const content = fs.readFileSync(inboxPath, 'utf-8');
        messages = JSON.parse(content);
      }

      const newMessage: InboxMessage = {
        ...message,
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        read: false,
      };

      messages.push(newMessage);

      if (messages.length > 50) {
        messages = messages.slice(-50);
      }

      fs.writeFileSync(inboxPath, JSON.stringify(messages, null, 2), 'utf-8');

      this.logger.debug(`Message delivered to ${agentId} in room ${roomId}`);
    } catch (error) {
      this.logger.error(`Failed to deliver message: ${(error as Error).message}`);
    }
  }

  async getUnreadMessages(roomId: string, agentId: string): Promise<InboxMessage[]> {
    const inboxPath = this.getAgentInboxPath(roomId, agentId);

    try {
      if (!fs.existsSync(inboxPath)) {
        return [];
      }

      const content = fs.readFileSync(inboxPath, 'utf-8');
      const messages: InboxMessage[] = JSON.parse(content);

      return messages.filter((m) => !m.read);
    } catch (error) {
      this.logger.warn(`Failed to read inbox: ${(error as Error).message}`);
      return [];
    }
  }

  async markAsRead(roomId: string, agentId: string, messageIds: string[]): Promise<void> {
    const inboxPath = this.getAgentInboxPath(roomId, agentId);

    try {
      if (!fs.existsSync(inboxPath)) {
        return;
      }

      const content = fs.readFileSync(inboxPath, 'utf-8');
      const messages: InboxMessage[] = JSON.parse(content);

      for (const msg of messages) {
        if (messageIds.includes(msg.id)) {
          msg.read = true;
        }
      }

      fs.writeFileSync(inboxPath, JSON.stringify(messages, null, 2), 'utf-8');
    } catch (error) {
      this.logger.warn(`Failed to mark messages as read: ${(error as Error).message}`);
    }
  }

  async clearOldMessages(roomId: string, agentId: string, olderThan: number = 24 * 60 * 60 * 1000): Promise<number> {
    const inboxPath = this.getAgentInboxPath(roomId, agentId);
    const now = Date.now();

    try {
      if (!fs.existsSync(inboxPath)) {
        return 0;
      }

      const content = fs.readFileSync(inboxPath, 'utf-8');
      const messages: InboxMessage[] = JSON.parse(content);

      const filtered = messages.filter((msg) => now - msg.timestamp < olderThan);
      const removed = messages.length - filtered.length;

      if (filtered.length === 0) {
        fs.unlinkSync(inboxPath);
      } else {
        fs.writeFileSync(inboxPath, JSON.stringify(filtered, null, 2), 'utf-8');
      }

      return removed;
    } catch (error) {
      this.logger.warn(`Failed to clear old messages: ${(error as Error).message}`);
      return 0;
    }
  }

  getInboxFilePath(roomId: string, agentId: string): string {
    return this.getAgentInboxPath(roomId, agentId);
  }
}
