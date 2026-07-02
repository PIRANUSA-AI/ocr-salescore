'use client'

import * as React from 'react'

/**
 * React Hook that tracks state of a CSS media query.
 *
 * @param query the media query to match.
 */
export function useMediaQuery(query: string): boolean {
  const [value, setValue] = React.useState(false)

  React.useEffect(() => {
    function onChange(event: MediaQueryListEvent) {
      setValue(event.matches)
    }

    const result = window.matchMedia(query)
    result.addEventListener('change', onChange)
    setValue(result.matches)

    return () => result.removeEventListener('change', onChange)
  }, [query])

  return value
}
