// lib/persistence/__tests__/chat-db.test.ts
import { describe, expect, it } from 'vitest'
import type { Session } from '../chat-db'

describe('chat-db types', () => {
  it('Session shape is correct', () => {
    const session: Session = {
      id: 'test-id',
      title: '新对话',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    expect(session.id).toBe('test-id')
    expect(session.title).toBe('新对话')
  })
})
