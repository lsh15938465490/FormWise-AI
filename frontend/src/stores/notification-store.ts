import { create } from "zustand";

export type Notice = { id: string; title: string; content: string; isRead: boolean; category: string; createdAt?: string };

type NotificationState = {
  items: Notice[];
  setItems: (items: Notice[]) => void;
  prepend: (item: Notice) => void;
  markRead: (id: string) => void;
};

export const useNotificationStore = create<NotificationState>((set) => ({
  items: [],
  setItems: (items) => set({ items }),
  prepend: (item) => set((s) => ({ items: [item, ...s.items.filter((i) => i.id !== item.id)] })),
  markRead: (id) => set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, isRead: true } : i)) })),
}));
