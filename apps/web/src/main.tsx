import { createRoot } from 'react-dom/client'
import '@mantine/core/styles.css'
import '@fontsource-variable/inter'
import '@fontsource-variable/oswald'
import './index.css'
import App from './App.tsx'
import { MantineProvider } from '@mantine/core'
import { theme } from './app/theme.ts'
import { StrictMode } from 'react'
import { BrowserRouter } from 'react-router'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider theme={theme} forceColorScheme="light">
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </MantineProvider>
  </StrictMode>
)
