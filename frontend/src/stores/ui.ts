import { create } from 'zustand'

// Layout and overlay state shared across the shell (FE-3.6, FE-3.7).
interface PaletteState {
  open: boolean
  setOpen(open: boolean): void
}

export const useCommandPalette = create<PaletteState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}))

// Below 1024 px the sidebar is a drawer, opened from the top bar (FE-9.3).
export const useSidebarDrawer = create<PaletteState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}))

// The upload dialog can be opened from the sidebar, the composer, the library, or by dropping files.
interface UploadState {
  open: boolean
  files: File[]
  show(files?: File[]): void
  close(): void
}

export const useUploadDialog = create<UploadState>((set) => ({
  open: false,
  files: [],
  show: (files = []) => set({ open: true, files }),
  close: () => set({ open: false, files: [] }),
}))

// The keyboard-shortcuts sheet, opened with "?" or from the account menu (FE-3.7).
interface SheetState {
  open: boolean
  setOpen(open: boolean): void
}

export const useShortcutsSheet = create<SheetState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}))
