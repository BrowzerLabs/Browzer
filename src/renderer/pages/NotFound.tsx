import { Link } from 'react-router-dom'
import { Button } from '@/renderer/ui/button'

function NotFound() {
  return (
    <section className='flex flex-col items-center justify-center h-screen'>
        <h1>404 - Page Not Found</h1>
        <p>Sorry, the page you are looking for does not exist.</p>

        <Button asChild>
            <Link to="/" className='mt-4'>Go back to home</Link>
        </Button>
        <Button variant='outline' asChild onClick={() => history.back()}>
            Go Back to previous page
        </Button>

        
    </section>
  )
}

export default NotFound