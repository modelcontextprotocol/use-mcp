import React, { useState, useEffect } from 'react'

interface ReasoningBlockProps {
  reasoning: string
  isStreaming?: boolean
  startTime?: number
  endTime?: number
}

const ReasoningBlock: React.FC<ReasoningBlockProps> = ({ reasoning, isStreaming = false, startTime, endTime }) => {}

export default ReasoningBlock
