import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import AdminApp from './admin/AdminApp.jsx'

const isAdminPath = window.location.pathname.startsWith('/admin')
const RootComponent = isAdminPath ? AdminApp : App

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RootComponent />
  </StrictMode>,
)
