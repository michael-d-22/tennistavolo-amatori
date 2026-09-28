import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { StoreProvider } from './store'
import { installFonts } from './fonts'
import { initTheme, initUiSize } from './theme'
import './styles.css'

installFonts()
initTheme()
initUiSize()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>
)
