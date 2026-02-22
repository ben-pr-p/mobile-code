import { atom } from 'jotai'

// Sidebar overlays
export const leftSidebarOpenAtom = atom(false)
export const rightSidebarOpenAtom = atom(false)

// Search
export const projectSearchQueryAtom = atom('')
export const sessionSearchQueryAtom = atom('')

// Active tab
export const activeTabAtom = atom<'session' | 'changes'>('session')

// iPad split layout — left panel content
export type LeftPanelContent =
  | { type: 'changes' }
  | { type: 'tool-detail'; messageId: string }

export const leftPanelContentAtom = atom<LeftPanelContent>({ type: 'changes' })
