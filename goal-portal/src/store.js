import { create } from 'zustand'

export const useStore = create((set) => ({
  currentUser: null,
  setUser: (user) => set({ currentUser: user }),
}))