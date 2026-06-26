import { useEffect, useState } from 'react'

interface State<T> {
  data: T | null
  loading: boolean
  error: Error | null
}

/**
 * Run an async loader whenever `deps` change, tracking loading/error state and
 * ignoring results from superseded calls.
 */
export function useAsync<T>(
  loader: () => Promise<T>,
  deps: unknown[],
): State<T> {
  const [state, setState] = useState<State<T>>({
    data: null,
    loading: true,
    error: null,
  })

  useEffect(() => {
    let alive = true
    setState((s) => ({ ...s, loading: true, error: null }))
    loader()
      .then((data) => alive && setState({ data, loading: false, error: null }))
      .catch((error) => alive && setState({ data: null, loading: false, error }))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return state
}
