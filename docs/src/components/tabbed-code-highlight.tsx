"use client";

import { useState, useRef, useEffect } from "react";

interface CodeSnippet {
  name: string;
  language: string;
  html: string;
}

interface TabbedCodeHighlightProps {
  snippets: CodeSnippet[];
  className?: string;
}

export function TabbedCodeHighlight({
  snippets,
  className = "",
}: TabbedCodeHighlightProps) {
  const [activeTab, setActiveTab] = useState(0);
  const [height, setHeight] = useState<number | undefined>(undefined);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const contentRefs = useRef<(HTMLDivElement | null)[]>([]);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });
  const isFirstMountIndicator = useRef(true);

  const handleTabClick = (index: number) => {
    setActiveTab(index);
    setHasUserInteracted(true);
  };

  const updateIndicator = (index: number) => {
    const tab = tabRefs.current[index];
    if (tab) {
      setIndicatorStyle({
        left: tab.offsetLeft,
        width: tab.offsetWidth,
      });
    }
  };

  useEffect(() => {
    if (isFirstMountIndicator.current) {
      isFirstMountIndicator.current = false;
      updateIndicator(activeTab);
    } else {
      updateIndicator(activeTab);
    }
  }, [activeTab]);

  useEffect(() => {
    // Only measure height after user has interacted
    if (!hasUserInteracted) return;

    const activeRef = contentRefs.current[activeTab];
    if (!activeRef) return;

    // Use ResizeObserver to track height changes
    const resizeObserver = new ResizeObserver(() => {
      setHeight(activeRef.offsetHeight);
    });

    resizeObserver.observe(activeRef);

    // Initial measurement
    setHeight(activeRef.offsetHeight);

    return () => resizeObserver.disconnect();
  }, [activeTab, hasUserInteracted]);

  if (snippets.length === 0) return null;

  return (
    <div
      className={`rounded-lg border border-gray-200 overflow-hidden ${className}`}
    >
      <div className="relative flex gap-2 border-b border-gray-200 bg-gray-50 dark:bg-gray-900 px-4 py-3">
        {/* Sliding indicator */}
        <div
          className={`absolute bottom-3 bg-fd-primary rounded-full ${
            hasUserInteracted ? "transition-all duration-500 ease-in-out" : ""
          }`}
          style={{
            left: `${indicatorStyle.left}px`,
            width: `${indicatorStyle.width}px`,
            height: "32px",
          }}
        />
        {snippets.map((snippet, index) => (
          <button
            key={snippet.name}
            ref={(el) => {
              tabRefs.current[index] = el;
            }}
            onClick={() => handleTabClick(index)}
            className={`relative z-10 px-3 py-1.5 text-sm font-medium rounded transition-colors duration-500 inline-block ${
              activeTab === index
                ? "text-white"
                : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
            }`}
          >
            {snippet.name}
          </button>
        ))}
      </div>
      <div
        className={`overflow-hidden ${hasUserInteracted ? "transition-all duration-300" : ""}`}
        style={{ height: height ? `${height}px` : "auto" }}
      >
        {snippets.map((snippet, index) => (
          <div
            key={snippet.name}
            ref={(el) => {
              contentRefs.current[index] = el;
            }}
            className={`text-sm [&_pre]:text-left [&_pre]:py-4 [&_pre]:px-4 [&_pre]:m-0 [&_pre]:!bg-inherit [&_code]:text-left [&_code]:text-xs overflow-x-auto ${
              activeTab === index ? "opacity-100" : "hidden"
            }`}
            dangerouslySetInnerHTML={{ __html: snippet.html }}
          />
        ))}
      </div>
    </div>
  );
}
