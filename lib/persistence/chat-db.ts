// lib/persistence/chat-db.ts
import type { Message } from '@/hooks/use-mock-chat'
import { openDB } from 'idb'
import type { DBSchema, IDBPDatabase } from 'idb'

export interface Session {
  id: string
  title: string
  createdAt: number
  updatedAt: number
}

interface SessionMessages {
  sessionId: string
  messages: Message[]
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
}

const DB_NAME = 'tripo-bagua'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<ChatDB>> | null = null

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<ChatDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const sessionStore = db.createObjectStore('sessions', { keyPath: 'id' })
        sessionStore.createIndex('by-updated', 'updatedAt')
        db.createObjectStore('messages', { keyPath: 'sessionId' })
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

export async function getSessionMessages(sessionId: string): Promise<Message[]> {
  const db = await getDB()
  const record = await db.get('messages', sessionId)
  return record?.messages ?? []
}

export async function saveSession(session: Session, messages: Message[]): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(['sessions', 'messages'], 'readwrite')
  await tx.objectStore('sessions').put(session)
  await tx.objectStore('messages').put({ sessionId: session.id, messages })
  await tx.done
}

export async function deleteSession(sessionId: string): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(['sessions', 'messages'], 'readwrite')
  await tx.objectStore('sessions').delete(sessionId)
  await tx.objectStore('messages').delete(sessionId)
  await tx.done
}

export async function getLatestSession(): Promise<Session | undefined> {
  const sessions = await listSessions()
  return sessions[0]
}
