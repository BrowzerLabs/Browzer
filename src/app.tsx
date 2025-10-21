import { Toaster } from "./renderer/ui/sonner"
import { ThemeProvider } from "./renderer/ui/theme-provider"
import { BrowserChrome } from "./renderer/components/BrowserChrome"
import { InternalRouter, useIsInternalPage } from "./renderer/router/InternalRouter"

function App() {
  const isInternalPage = useIsInternalPage()

  return (
    <ThemeProvider defaultTheme={isInternalPage ? "light" : "dark"} storageKey="vite-ui-theme">
        {isInternalPage ? (
          <InternalRouter />
        ) : (
          <BrowserChrome />
        )}
      <Toaster position="top-center" richColors />
    </ThemeProvider>
  )
}

export default App
