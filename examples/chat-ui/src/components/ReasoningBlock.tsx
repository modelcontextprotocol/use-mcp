import React, { useState } from "react";

interface ReasoningBlockProps {
    reasoning: string;
}

const ReasoningBlock: React.FC<ReasoningBlockProps> = ({ reasoning }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    if (!reasoning || reasoning.trim().length === 0) {
        return null;
    }

    const toggleExpanded = () => {
        setIsExpanded(!isExpanded);
    };

    // Truncate the reasoning text for the collapsed state
    const maxLength = 120;
    const shouldTruncate = reasoning.length > maxLength;
    const displayText = isExpanded || !shouldTruncate
        ? reasoning
        : reasoning.substring(0, maxLength) + "...";

    return (
        <div className="mb-3">
            <div
                className={`text-xs text-zinc-600 border border-zinc-200 rounded-lg p-3 *bg-zinc-50 cursor-pointer hover:bg-zinc-50 transition-colors ${shouldTruncate && !isExpanded ? "line-clamp-1" : ""
                    }`}
                onClick={toggleExpanded}
            >
                <div className="flex items-start gap-2">
                    <span className="text-zinc-400 text-xs mt-0.5 flex-shrink-0">💭</span>
                    <div className={`${shouldTruncate && !isExpanded ? "truncate" : "whitespace-pre-wrap"}`}>
                        {displayText}
                    </div>
                    {/*{shouldTruncate && (*/}
                    {/*    <button*/}
                    {/*        className="text-zinc-400 hover:text-zinc-600 text-xs ml-auto flex-shrink-0"*/}
                    {/*        onClick={(e) => {*/}
                    {/*            e.stopPropagation();*/}
                    {/*            toggleExpanded();*/}
                    {/*        }}*/}
                    {/*    >*/}
                    {/*        {isExpanded ? "↑" : "↓"}*/}
                    {/*    </button>*/}
                    {/*)}*/}
                </div>
            </div>
        </div>
    );
};

export default ReasoningBlock;
