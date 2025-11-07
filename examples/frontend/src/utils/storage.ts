import { ChatHistory, Message } from '../types/chat';

const CHAT_HISTORY_KEY = 'x402_chat_history';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export const loadChatHistory = (): ChatHistory => {
  try {
    const stored = localStorage.getItem(CHAT_HISTORY_KEY);
    if (!stored) {
      return { messages: [], lastCleared: Date.now() };
    }
    
    const history: ChatHistory = JSON.parse(stored);
    
    const sevenDaysAgo = Date.now() - SEVEN_DAYS_MS;
    if (history.lastCleared < sevenDaysAgo) {
      history.messages = history.messages.filter(m => m.timestamp > sevenDaysAgo);
      history.lastCleared = Date.now();
      saveChatHistory(history);
    }
    
    return history;
  } catch (error) {
    console.error('Failed to load chat history:', error);
    return { messages: [], lastCleared: Date.now() };
  }
};

export const saveChatHistory = (history: ChatHistory): void => {
  try {
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(history));
  } catch (error) {
    console.error('Failed to save chat history:', error);
  }
};

export const addMessage = (message: Message): void => {
  const history = loadChatHistory();
  history.messages.push(message);
  saveChatHistory(history);
};

export const updateMessage = (id: string, updates: Partial<Message>): void => {
  const history = loadChatHistory();
  const index = history.messages.findIndex(m => m.id === id);
  if (index !== -1) {
    history.messages[index] = { ...history.messages[index], ...updates };
    saveChatHistory(history);
  }
};

export const clearChatHistory = (): void => {
  localStorage.removeItem(CHAT_HISTORY_KEY);
};
