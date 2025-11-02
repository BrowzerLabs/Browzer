import { Toaster } from "@/renderer/ui/sonner"
import { ThemeProvider } from "@/renderer/ui/theme-provider"
import { AppRouter } from "@/renderer/router/AppRouter"

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="browzer-ui-theme">
      <AppRouter />
      <Toaster position="top-center" richColors />
    </ThemeProvider>
  )
}

export default App
