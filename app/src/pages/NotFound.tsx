import { Link } from 'react-router-dom'
import { Notice } from '../components/ui'

export default function NotFound() {
  return (
    <div className="px-4 py-20">
      <Notice title="Page not found">
        <Link to="/" className="text-brand hover:underline">
          Return to search
        </Link>
      </Notice>
    </div>
  )
}
