// lib/persistence/chat-db.ts
import type { UIMessage } from 'ai'
import type { DBSchema, IDBPDatabase } from 'idb'
import { openDB } from 'idb'
import type { AnalysisNote } from '@/lib/bazi/types'

export interface Session {
  id: string
  title: string
  createdAt: number
  updatedAt: number
}

interface SessionMessages {
  sessionId: string
  messages: UIMessage[]
}

interface ChatDB extends DBSchema {
  sessions: {
    key: string
    value: Session
    indexes: { 'by-updated': number }
  }
  messages: {
    key: string
    value: SessionMessages
  }
  analysisNotes: {
    key: string
    value: AnalysisNote
  }
}

const DB_NAME = 'tripo-bagua'
const DB_VERSION = 2

let dbPromise: Promise<IDBPDatabase<ChatDB>> | null = null

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<ChatDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const sessionStore = db.createObjectStore('sessions', { keyPath: 'id' })
          sessionStore.createIndex('by-updated', 'updatedAt')
          db.createObjectStore('messages', { keyPath: 'sessionId' })
        }
        if (oldVersion < 2) {
          db.createObjectStore('analysisNotes', { keyPath: 'sessionId' })
        }
      },
    })
  }
  return dbPromise
}

export async function listSessions(): Promise<Session[]> {
  const db = await getDB()
  const all = await db.getAllFromIndex('sessions', 'by-updated')
  return all.reverse() // newest first
}

export async function getSessionMessages(sessionId: string): Promise<UIMessage[]> {
  const db = await getDB()
  const record = await db.get('messages', sessionId)
  return record?.messages ?? []
}

export async function saveSession(session: Session, messages: UIMessage[]): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(['sessions', 'messages'], 'readwrite')
  await tx.objectStore('sessions').put(session)
  await tx.objectStore('messages').put({ sessionId: session.id, messages })
  await tx.done
}

export async function deleteSession(sessionId: string): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(['sessions', 'messages', 'analysisNotes'], 'readwrite')
  await tx.objectStore('sessions').delete(sessionId)
  await tx.objectStore('messages').delete(sessionId)
  await tx.objectStore('analysisNotes').delete(sessionId)
  await tx.done
}

export async function getLatestSession(): Promise<Session | undefined> {
  const sessions = await listSessions()
  return sessions[0]
}

export async function getAnalysisNote(sessionId: string): Promise<AnalysisNote | undefined> {
  const db = await getDB()
  return db.get('analysisNotes', sessionId)
}

export async function saveAnalysisNote(note: AnalysisNote): Promise<void> {
  const db = await getDB()
  await db.put('analysisNotes', note)
}

export async function deleteAnalysisNote(sessionId: string): Promise<void> {
  const db = await getDB()
  await db.delete('analysisNotes', sessionId)
}
