import { useCallback, useEffect, useRef, useState } from 'react'
import { Send, Plus, Trash2, StopCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  playgroundApi,
  playgroundChatStream,
  type PlaygroundChatSummary,
  type PlaygroundMessage,
} from '../../api'

interface Props {
  model: string
  quota: number
  onQuotaMaybeChanged: () => void
}

export default function ChatTab({ model, quota, onQuotaMaybeChanged }: Props) {
  const [messages, setMessages] = useState<PlaygroundMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [chatId, setChatId] = useState<number | null>(null)
  const [history, setHistory] = useState<PlaygroundChatSummary[]>([])
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const refreshHistory = useCallback(() => {
    playgroundApi.listChats({ page_size: 50 })
      .then(r => {
        if (r.data.success) setHistory(r.data.data.list || [])
      })
      .catch(() => {})
  }, [])

  useEffect(() => { refreshHistory() }, [refreshHistory])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const newChat = () => {
    if (sending) return
    setChatId(null)
    setMessages([])
  }

  const loadChat = async (id: number) => {
    if (sending) return
    try {
      const r = await playgroundApi.getChat(id)
      if (r.data.success) {
        setChatId(id)
        setMessages(r.data.data.messages || [])
      }
    } catch {
      toast.error('加载失败')
    }
  }

  const deleteChat = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('删除这条对话记录？')) return
    try {
      await playgroundApi.deleteChat(id)
      if (chatId === id) newChat()
      refreshHistory()
    } catch {
      toast.error('删除失败')
    }
  }

  const send = async () => {
    const text = input.trim()
    if (!text || sending) return
    if (quota <= 0) {
      toast.error('余额不足，请先充值')
      return
    }
    if (!model) {
      toast.error('请先选择模型')
      return
    }
    const nextMessages: PlaygroundMessage[] = [...messages, { role: 'user', content: text }]
    setMessages([...nextMessages, { role: 'assistant', content: '' }])
    setInput('')
    setSending(true)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      let assistant = ''
      for await (const chunk of playgroundChatStream(
        { chat_id: chatId || undefined, model, messages: nextMessages },
        id => setChatId(id),
        controller.signal
      )) {
        assistant += chunk
        setMessages(prev => {
          const copy = [...prev]
          copy[copy.length - 1] = { role: 'assistant', content: assistant }
          return copy
        })
      }
      refreshHistory()
      onQuotaMaybeChanged()
    } catch (err: any) {
      const msg = err?.message || '请求失败'
      if (!/aborted/i.test(msg)) toast.error(msg)
      // 失败时从消息区移除尾部占位 assistant
      setMessages(prev => {
        if (prev.length && prev[prev.length - 1].role === 'assistant' && !prev[prev.length - 1].content) {
          return prev.slice(0, -1)
        }
        return prev
      })
    } finally {
      setSending(false)
      abortRef.current = null
    }
  }

  const stop = () => {
    abortRef.current?.abort()
    abortRef.current = null
    setSending(false)
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 240px',
      gap: 20,
      height: 'calc(100vh - 260px)',
    }}>
      {/* 对话区 */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
      }}>
        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {messages.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--muted)', marginTop: 80, fontSize: 14 }}>
              选择左侧模型，发送消息开始对话
            </div>
          ) : (
            messages.map((m, i) => <MessageBubble key={i} message={m} />)
          )}
        </div>

        <div style={{
          borderTop: '1px solid var(--border)',
          padding: 12,
          display: 'flex',
          gap: 10,
          alignItems: 'flex-end',
        }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            placeholder={quota <= 0 ? '余额不足，请先充值' : 'Enter 发送，Shift+Enter 换行'}
            disabled={quota <= 0 || sending}
            rows={2}
            style={{
              flex: 1,
              resize: 'none',
              padding: 10,
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              fontSize: 14,
              fontFamily: 'inherit',
              lineHeight: 1.5,
            }}
          />
          {sending ? (
            <button
              onClick={stop}
              className="btn btn-outline"
              style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <StopCircle size={16} />
              停止
            </button>
          ) : (
            <button
              onClick={send}
              disabled={!input.trim() || quota <= 0}
              className="btn btn-accent"
              style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Send size={16} />
              发送
            </button>
          )}
        </div>
      </div>

      {/* 右侧历史 */}
      <div style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '10px 14px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            对话历史
          </span>
          <button
            onClick={newChat}
            title="新对话"
            style={{
              background: 'transparent',
              border: 'none',
              padding: 4,
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              display: 'flex',
            }}
          >
            <Plus size={16} />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {history.length === 0 ? (
            <div style={{ padding: 16, fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
              暂无历史
            </div>
          ) : (
            history.map(h => (
              <div
                key={h.id}
                onClick={() => loadChat(h.id)}
                style={{
                  padding: '10px 14px',
                  borderBottom: '1px solid var(--border)',
                  cursor: 'pointer',
                  background: chatId === h.id ? 'var(--primary-light)' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: 'var(--text)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {h.title || '无标题'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                    {h.model}
                  </div>
                </div>
                <button
                  onClick={e => deleteChat(h.id, e)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    padding: 4,
                    cursor: 'pointer',
                    color: 'var(--muted)',
                    display: 'flex',
                  }}
                  title="删除"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function MessageBubble({ message }: { message: PlaygroundMessage }) {
  const isUser = message.role === 'user'
  return (
    <div style={{
      display: 'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      marginBottom: 16,
    }}>
      <div style={{
        maxWidth: '80%',
        padding: '10px 14px',
        borderRadius: isUser ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
        background: isUser ? 'var(--accent)' : 'var(--primary-light)',
        color: isUser ? '#fff' : 'var(--text)',
        fontSize: 14,
        lineHeight: 1.6,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}>
        {message.content || (
          <span style={{ color: isUser ? 'rgba(255,255,255,0.6)' : 'var(--muted)' }}>生成中...</span>
        )}
      </div>
    </div>
  )
}
