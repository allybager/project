import { nanoid } from 'nanoid';
import {
  dataStore,
  type ChatRecord,
  type ListingRecord,
  type MessageRecord,
  type UserRecord
} from '../../data/data-store.js';
import { HttpError } from '../../middleware/error-handler.js';

export interface ChatSummary extends ChatRecord {
  lastMessage?: MessageRecord;
  unreadCount: number;
}

export interface ChatDetail extends ChatRecord {
  messages: MessageRecord[];
}

class ChatService {
  private ensureParticipant(chat: ChatRecord, user: UserRecord): void {
    if (chat.buyerId !== user.id && chat.sellerId !== user.id && user.role === 'user') {
      throw new HttpError(403, 'You are not a participant in this chat');
    }
  }

  private ensureActiveListing(listing: ListingRecord): void {
    if (listing.status !== 'active') {
      throw new HttpError(409, 'Listing is not active');
    }
  }

  async listForUser(user: UserRecord): Promise<ChatSummary[]> {
    const data = await dataStore.getData();
    const relevantChats = data.chats.filter((chat) => chat.buyerId === user.id || chat.sellerId === user.id);

    return relevantChats
      .map((chat) => {
        const messages = data.messages
          .filter((message) => message.chatId === chat.id)
          .sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());
        const lastMessage = messages.at(-1);
        const unreadCount = messages.filter((message) => !message.readBy.includes(user.id)).length;
        return {
          ...chat,
          lastMessage,
          unreadCount
        } satisfies ChatSummary;
      })
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  async getChat(chatId: string, user: UserRecord): Promise<ChatDetail> {
    const data = await dataStore.getData();
    const chat = data.chats.find((item) => item.id === chatId);
    if (!chat) {
      throw new HttpError(404, 'Chat not found');
    }

    this.ensureParticipant(chat, user);

    const messages = data.messages
      .filter((message) => message.chatId === chat.id)
      .sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());

    return {
      ...chat,
      messages
    } satisfies ChatDetail;
  }

  async startChat(listingId: string, user: UserRecord, initialMessage?: string): Promise<ChatDetail> {
    let chatRecord: ChatRecord | undefined;

    await dataStore.update((state) => {
      const listing = state.listings.find((item) => item.id === listingId);
      if (!listing) {
        throw new HttpError(404, 'Listing not found');
      }

      this.ensureActiveListing(listing);

      if (listing.userId === user.id) {
        throw new HttpError(409, 'You cannot start a chat with your own listing');
      }

      const existingChat = state.chats.find((item) => item.listingId === listingId && item.buyerId === user.id);
      if (existingChat) {
        chatRecord = existingChat;
        return;
      }

      const now = new Date();
      const newChat: ChatRecord = {
        id: nanoid(),
        listingId,
        sellerId: listing.userId,
        buyerId: user.id,
        status: 'open',
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      };

      state.chats.push(newChat);
      chatRecord = newChat;
    });

    if (!chatRecord) {
      throw new HttpError(500, 'Failed to create chat');
    }

    if (initialMessage) {
      await this.addMessageInternal(chatRecord, user, initialMessage);
    }

    return this.getChat(chatRecord.id, user);
  }

  private async addMessageInternal(chat: ChatRecord, sender: UserRecord, content: string): Promise<MessageRecord> {
    if (content.trim().length === 0) {
      throw new HttpError(400, 'Message content cannot be empty');
    }

    let messageRecord: MessageRecord | undefined;
    await dataStore.update((state) => {
      const index = state.chats.findIndex((item) => item.id === chat.id);
      if (index === -1) {
        throw new HttpError(404, 'Chat not found');
      }

      this.ensureParticipant(state.chats[index], sender);
      if (state.chats[index].status === 'closed') {
        throw new HttpError(409, 'Chat is closed');
      }

      const now = new Date();
      const message: MessageRecord = {
        id: nanoid(),
        chatId: chat.id,
        senderId: sender.id,
        content: content.trim(),
        sentAt: now.toISOString(),
        readBy: [sender.id]
      };

      state.messages.push(message);
      state.chats[index] = {
        ...state.chats[index],
        updatedAt: now.toISOString()
      };

      messageRecord = message;
    });

    if (!messageRecord) {
      throw new HttpError(500, 'Failed to send message');
    }

    return messageRecord;
  }

  async sendMessage(chatId: string, user: UserRecord, content: string): Promise<MessageRecord> {
    const data = await dataStore.getData();
    const chat = data.chats.find((item) => item.id === chatId);
    if (!chat) {
      throw new HttpError(404, 'Chat not found');
    }

    return this.addMessageInternal(chat, user, content);
  }

  async markRead(chatId: string, user: UserRecord): Promise<void> {
    await dataStore.update((state) => {
      const chat = state.chats.find((item) => item.id === chatId);
      if (!chat) {
        throw new HttpError(404, 'Chat not found');
      }

      this.ensureParticipant(chat, user);

      state.messages = state.messages.map((message) => {
        if (message.chatId !== chatId) {
          return message;
        }
        if (message.readBy.includes(user.id)) {
          return message;
        }
        return {
          ...message,
          readBy: [...message.readBy, user.id]
        } satisfies MessageRecord;
      });
    });
  }

  async archiveChat(chatId: string, user: UserRecord): Promise<ChatRecord> {
    let updated: ChatRecord | undefined;
    await dataStore.update((state) => {
      const index = state.chats.findIndex((item) => item.id === chatId);
      if (index === -1) {
        throw new HttpError(404, 'Chat not found');
      }

      const chat = state.chats[index];
      this.ensureParticipant(chat, user);

      if (chat.status === 'closed') {
        throw new HttpError(409, 'Chat already closed');
      }

      const updatedChat: ChatRecord = {
        ...chat,
        status: 'archived',
        updatedAt: new Date().toISOString()
      };
      state.chats[index] = updatedChat;
      updated = updatedChat;
    });

    if (!updated) {
      throw new HttpError(404, 'Chat not found');
    }

    return updated;
  }
}

export const chatService = new ChatService();
