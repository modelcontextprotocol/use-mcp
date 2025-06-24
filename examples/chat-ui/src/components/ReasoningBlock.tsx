import React, { useState, useEffect } from "react";

interface ReasoningBlockProps {
    reasoning: string;
    isStreaming?: boolean;
    startTime?: number;
    endTime?: number;
}

const ReasoningBlock: React.FC<ReasoningBlockProps> = ({ 
    reasoning, 
    isStreaming = false, 
    startTime, 
    endTime 
}) => {
    const [isExpanded, setIsExpanded] = useState(isStreaming); // Start expanded when streaming
    
    // Auto-collapse instantly when streaming finishes
    useEffect(() => {
        if (!isStreaming && startTime && endTime) {
            setIsExpanded(false);
        }
    }, [isStreaming, startTime, endTime]);

    if (!reasoning || reasoning.trim().length === 0) {
        return null;
    }

    const toggleExpanded = () => {
        setIsExpanded(!isExpanded);
    };

    // Calculate thinking duration
    const duration = startTime && endTime ? (endTime - startTime) / 1000 : null;
    
    // Format duration nicely
    const formatDuration = (seconds: number) => {
        if (seconds < 1) {
            return `${Math.round(seconds * 1000)}ms`;
        }
        return `${seconds.toFixed(1)}s`;
    };

    return (
        <div className="mb-3">
            <div
                className={`text-sm text-zinc-600 border border-zinc-200 rounded-lg p-3 bg-zinc-50 cursor-pointer hover:bg-zinc-100 transition-all duration-300 ${
                    isExpanded ? "border-zinc-300" : ""
                }`}
                onClick={toggleExpanded}
            >
                <div className="flex items-start gap-2">
                    <span className="text-zinc-400 text-xs mt-0.5 flex-shrink-0">💭</span>
                    
                    {isExpanded ? (
                        // Expanded view: show reasoning content
                        <div className={`flex-1 ${isStreaming ? "overflow-hidden whitespace-nowrap flex justify-end" : "whitespace-pre-wrap"}`}>
                            <span className={isStreaming ? "inline-block" : ""}>
                                {reasoning}
                                {isStreaming && (
                                    <span className="inline-block w-2 h-4 bg-zinc-400 ml-1 animate-pulse"></span>
                                )}
                            </span>
                        </div>
                    ) : (
                        // Collapsed view: show timing summary
                        <div className="flex-1">
                            <span className="text-zinc-500">
                                {isStreaming ? "Thinking..." : 
                                 duration ? `Thought for ${formatDuration(duration)}` : 
                                 "Thought process"}
                            </span>
                        </div>
                    )}
                    
                    <button
                        className="text-zinc-400 hover:text-zinc-600 text-xs ml-auto flex-shrink-0"
                        onClick={(e) => {
                            e.stopPropagation();
                            toggleExpanded();
                        }}
                    >
                        {isExpanded ? "↑" : "↓"}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ReasoningBlock;
