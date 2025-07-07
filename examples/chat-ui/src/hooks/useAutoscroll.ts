import { useEffect, useRef } from 'react'

export const useAutoscroll = () => {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const shouldAutoScrollRef = useRef(true)

  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return

    const handleScroll = () => {
      const isAtBottom = container.scrollHeight - container.clientHeight - container.scrollTop <= 200
      shouldAutoScrollRef.current = isAtBottom
    }

    container.addEventListener('scroll', handleScroll)
    return () => {
      container.removeEventListener('scroll', handleScroll)
    }
  }, [])

  const scrollToBottom = (force?: boolean) => {
    if (shouldAutoScrollRef.current || force) {
      messagesEndRef.current?.scrollIntoView({ behavior: force ? 'instant' : 'smooth' })
    }
  }

  return {
    messagesEndRef,
    messagesContainerRef,
    scrollToBottom,
  }
}
