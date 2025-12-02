import { motion } from "motion/react";
import { DynamicCodeBlock } from "fumadocs-ui/components/dynamic-codeblock";
import { useState, useLayoutEffect, useRef, useEffect } from "react";

interface CodeSnippet {
  name: string;
  language: string;
  code: string;
}

interface TabbedCodeHighlightProps {
  snippets: CodeSnippet[];
}

export function TabbedCodeHighlight({ snippets }: TabbedCodeHighlightProps) {
  const [activeTab, setActiveTab] = useState(0);
  const [heights, setHeights] = useState<Record<number, number>>({});
  const contentRefs = useRef<(HTMLDivElement | null)[]>([]);

  useLayoutEffect(() => {
    const newHeights: Record<number, number> = {};
    contentRefs.current.forEach((ref, index) => {
      if (ref) {
        newHeights[index] = ref.offsetHeight;
      }
    });
    setHeights(newHeights);
  }, [snippets]);

  useEffect(() => {
    const activeRef = contentRefs.current[activeTab];
    if (activeRef) {
      setHeights((prev) => ({
        ...prev,
        [activeTab]: activeRef.offsetHeight,
      }));
    }
  }, [activeTab]);

  if (snippets.length === 0) return null;

  return (
    <div className={`rounded-lg overflow-hidden`}>
      <div className="relative flex gap-2 py-2">
        {snippets.map((snippet, index) => (
          <motion.button
            key={index}
            onClick={() => setActiveTab(index)}
            className={`relative z-10 px-3 py-1 text-sm ${
              activeTab === index
                ? "text-white"
                : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
            }`}
          >
            {snippet.name}
            {activeTab === index && (
              <motion.div
                layoutId="indicator"
                className="absolute inset-0 bg-zinc-800 rounded-full -z-10"
                transition={{ duration: 0.4, ease: "easeInOut" }}
              />
            )}
          </motion.button>
        ))}
      </div>
      <motion.div
        animate={{ height: heights[activeTab] || "auto" }}
        transition={{ duration: 0.4, ease: "easeInOut" }}
        className="overflow-hidden"
      >
        {snippets.map((snippet, index) => (
          <div
            key={index}
            ref={(el) => {
              contentRefs.current[index] = el;
            }}
            style={{ display: activeTab === index ? "block" : "none" }}
          >
            <DynamicCodeBlock lang={snippet.language} code={snippet.code} />
          </div>
        ))}
      </motion.div>
          </div>
          );
          }
