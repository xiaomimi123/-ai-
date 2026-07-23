import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { runtimeConfig } from './runtimeConfig'

document.title = runtimeConfig.siteName + ' - 管理控制台'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>
)
