"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { codeToHtml } from "shiki";

interface CodeHighlightProps {
  code: string;
  language: string;
  className?: string;
}

export function CodeHighlight({
  code,
  language,
  className = "",
}: CodeHighlightProps) {
  const { resolvedTheme } = useTheme();
  const [html, setHtml] = useState<string>("");

  useEffect(() => {
    const highlight = async () => {
      try {
        const theme = resolvedTheme === "dark" ? "min-dark" : "min-light";

        const highlighted = await codeToHtml(code, {
          lang: language,
          theme,
          transformers: [
            {
              pre(node) {
                this.addClassToHast(node, "font-jetbrains-mono");
              },
              span(node) {
                this.addClassToHast(node, "font-jetbrains-mono");
              },
            },
          ],
        });
        setHtml(highlighted);
      } catch (error) {
        console.error("Syntax highlighting error:", error);
        setHtml(`<pre><code>${code}</code></pre>`);
      }
    };

    if (resolvedTheme) {
      highlight();
    }
  }, [code, language, resolvedTheme]);

  return (
    <div
      className={`rounded-lg border border-gray-200 overflow-hidden text-sm [&_pre]:text-left [&_pre]:py-4 [&_pre]:px-4 [&_pre]:m-0 [&_pre]:!bg-inherit [&_code]:text-left [&_code]:text-xs overflow-x-auto ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
