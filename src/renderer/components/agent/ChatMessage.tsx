import React from 'react';
import { Item } from '@/renderer/ui/item';

export interface ChatMessageData {
  id: string;
  type: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
}

interface ChatMessageProps {
  message: ChatMessageData;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.type === 'user';
  const isSystem = message.type === 'system';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <Item
        className={`max-w-[85%] ${
          isUser
            ? 'bg-blue-600 text-white'
            : isSystem
            ? 'bg-green-600 text-white'
            : 'bg-gray-800 text-gray-100'
        }`}
      >
        <p className="text-xs whitespace-pre-wrap leading-relaxed">{message.content}</p>
      </Item>
    </div>
  );
}
