import React from 'react'
import { Sun, MoonIcon } from 'lucide-react'
import { useTheme } from './theme-provider'
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip'

function ThemeToggle(
  props: React.ButtonHTMLAttributes<HTMLButtonElement>
) {
    const { setTheme, isDark } = useTheme()
    const toggleTheme = () => {
        setTheme(isDark ? 'light' : 'dark')
    }
    
  return (
     <Tooltip>
        <TooltipTrigger
          onClick={toggleTheme} {...props}
          {...props}
        >
          {isDark ? <Sun className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}
        </TooltipTrigger>
        <TooltipContent>
          {isDark ? 'Light Mode' : 'Dark Mode'}
        </TooltipContent>
    </Tooltip>
  )
}

export default ThemeToggle