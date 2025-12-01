import { createContext, useContext, useEffect, useState } from "react"

type Theme = "dark" | "light" | "system"

type ThemeProviderProps = {
  children: React.ReactNode
  defaultTheme?: Theme
}

type ThemeProviderState = {
  theme: Theme
  setTheme: (theme: Theme) => void
  isDark: boolean
}

const initialState: ThemeProviderState = {
  theme: "system",
  setTheme: () => null,
  isDark: false,
}

const ThemeProviderContext = createContext<ThemeProviderState>(initialState)

export function ThemeProvider({
  children,
  defaultTheme = "system",
  ...props
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(defaultTheme)
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    const initTheme = async () => {
      try {
        const storedTheme = await window.browserAPI.getTheme()
        setThemeState(storedTheme)
        
        const darkMode = await window.browserAPI.isDarkMode()
        setIsDark(darkMode)
      } catch (error) {
        console.error('Failed to initialize theme:', error)
      }
    }
    
    initTheme()
  }, [])

  useEffect(() => {
    const root = window.document.documentElement
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
    
    const applyTheme = () => {
      root.classList.remove("light", "dark")
      const isDarkMode = mediaQuery.matches
      root.classList.add(isDarkMode ? "dark" : "light")
      setIsDark(isDarkMode)
    }
    
    applyTheme()
    
    mediaQuery.addEventListener("change", applyTheme)
    
    return () => mediaQuery.removeEventListener("change", applyTheme)
  }, [])

  const setTheme = async (newTheme: Theme) => {
    try {
      await window.browserAPI.setTheme(newTheme)
      setThemeState(newTheme)
      
      const darkMode = await window.browserAPI.isDarkMode()
      setIsDark(darkMode)
    } catch (error) {
      console.error('Failed to set theme:', error)
    }
  }

  const value = {
    theme,
    setTheme,
    isDark,
  }

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext)

  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider")

  return context
}