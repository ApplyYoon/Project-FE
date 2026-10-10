import App from '@/App'
import '@/index.css'
import { registerServiceWorker } from '@/lib/pwa'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// 홈 화면 설치·오프라인 화면을 위한 서비스 워커를 등록합니다. (배포용 build 에서만 동작, #105)
registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
