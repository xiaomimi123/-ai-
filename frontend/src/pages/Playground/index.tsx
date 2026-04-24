import { useEffect, useMemo, useState } from 'react'
import { MessageSquare, Image as ImageIcon } from 'lucide-react'
import { authApi, playgroundApi, type PlaygroundModel } from '../../api'
import BalanceBar from './BalanceBar'
import ModelSelector from './ModelSelector'
import ChatTab from './ChatTab'
import ImageTab from './ImageTab'

type Tab = 'chat' | 'image'

export default function Playground() {
  const [tab, setTab] = useState<Tab>('chat')
  const [chatModels, setChatModels] = useState<PlaygroundModel[]>([])
  const [imageModels, setImageModels] = useState<PlaygroundModel[]>([])
  const [selectedChatModel, setSelectedChatModel] = useState<string>('')
  const [selectedImageModel, setSelectedImageModel] = useState<string>('')
  const [quota, setQuota] = useState<number>(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    playgroundApi.listModels()
      .then(r => {
        if (r.data.success) {
          const { chat, image } = r.data.data
          setChatModels(chat || [])
          setImageModels(image || [])
          if (chat?.length) setSelectedChatModel(chat[0].id)
          if (image?.length) setSelectedImageModel(image[0].id)
        }
      })
      .finally(() => setLoading(false))

    authApi.getSelf().then(r => {
      if (r.data.success) setQuota(r.data.data.quota || 0)
    }).catch(() => {})
  }, [])

  const refreshQuota = () => {
    authApi.getSelf().then(r => {
      if (r.data.success) setQuota(r.data.data.quota || 0)
    }).catch(() => {})
  }

  const activeModels = useMemo(
    () => tab === 'chat' ? chatModels : imageModels,
    [tab, chatModels, imageModels]
  )
  const activeSelected = tab === 'chat' ? selectedChatModel : selectedImageModel
  const setActiveSelected = tab === 'chat' ? setSelectedChatModel : setSelectedImageModel

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto' }}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <div>
          <h1 className="page-title">体验广场</h1>
          <p className="page-desc">登录后即可调用聊天与画图模型，按 API 调用计费</p>
        </div>
        <BalanceBar quota={quota} />
      </div>

      {/* Tab 切换 */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        <TabButton active={tab === 'chat'} onClick={() => setTab('chat')} icon={<MessageSquare size={16} />} label="聊天" />
        <TabButton active={tab === 'image'} onClick={() => setTab('image')} icon={<ImageIcon size={16} />} label="文生图" />
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--muted)' }}>加载中...</div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: '220px 1fr',
          gap: 20,
          minHeight: 'calc(100vh - 280px)',
        }}>
          <ModelSelector
            models={activeModels}
            selected={activeSelected}
            onSelect={setActiveSelected}
          />
          <div style={{ minWidth: 0 }}>
            {tab === 'chat' ? (
              <ChatTab
                model={selectedChatModel}
                quota={quota}
                onQuotaMaybeChanged={refreshQuota}
              />
            ) : (
              <ImageTab
                model={selectedImageModel}
                quota={quota}
                onQuotaMaybeChanged={refreshQuota}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'transparent',
        border: 'none',
        borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
        color: active ? 'var(--accent)' : 'var(--text-secondary)',
        padding: '12px 20px',
        fontSize: 14,
        fontWeight: active ? 600 : 500,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        marginBottom: -1,
      }}
    >
      {icon}
      {label}
    </button>
  )
}
