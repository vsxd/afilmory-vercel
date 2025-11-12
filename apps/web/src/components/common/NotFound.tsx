import { Button } from '@afilmory/ui'
import { useLocation, useNavigate } from 'react-router'

export const NotFound = () => {
  const location = useLocation()
  const navigate = useNavigate()

  const handleBackToHome = () => {
    try {
      // 尝试使用 React Router 导航
      navigate('/', { replace: true })
      // 如果导航失败，使用 window.location 作为后备方案
      setTimeout(() => {
        if (window.location.pathname !== '/') {
          window.location.href = '/'
        }
      }, 100)
    } catch (error) {
      console.error('[NotFound] Navigation failed, using window.location:', error)
      window.location.href = '/'
    }
  }

  return (
    <div className="prose center dark:prose-invert m-auto size-full flex-col">
      <main className="flex grow flex-col items-center justify-center">
        <p className="font-semibold">You have come to a desert of knowledge where there is nothing.</p>
        <p>
          Current path: <code>{location.pathname}</code>
        </p>

        <p>
          <Button onClick={handleBackToHome}>Back to Home</Button>
        </p>
      </main>
    </div>
  )
}
