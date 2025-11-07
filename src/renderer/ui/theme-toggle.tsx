import React from 'react'
import { Button } from './button'
import { Sun, MoonIcon } from 'lucide-react'
import { useTheme } from './theme-provider'

function ThemeToggle(
  props: React.ButtonHTMLAttributes<HTMLButtonElement>
) {
    const { setTheme, theme } = useTheme()
    const toggleTheme = () => {
        setTheme(theme === 'dark' ? 'light' : 'dark')
    }
  return (
    <Button variant="outline" size="icon" onClick={toggleTheme} {...props}>
        {theme === 'dark' ? <Sun className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}
    </Button>
      
  )
}

export default ThemeToggle
