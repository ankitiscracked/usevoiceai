"use client";

import { useEffect, useRef } from "react";
import mermaid from "mermaid";
import Panzoom from "panzoom";

interface MermaidProps {
  children: string;
}

export function Mermaid({ children }: MermaidProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const setupDiagram = async () => {
      if (!containerRef.current) return;

      try {
        mermaid.initialize({
          startOnLoad: true,
          theme: "default",
          themeVariables: {
            fontSize: "18px",
          },
          sequence: {
            actorFontSize: 18,
            noteFontSize: 18,
            messageFontSize: 18,
          },
          securityLevel: "loose",
        });

        // Create mermaid div with content
        const mermaidDiv = document.createElement("div");
        mermaidDiv.className = "mermaid";
        mermaidDiv.textContent = children;

        containerRef.current.innerHTML = "";
        containerRef.current.appendChild(mermaidDiv);

        // Render the diagram
        await mermaid.contentLoaded();

        // Setup panzoom after a small delay to ensure SVG is rendered
        setTimeout(() => {
          const svg = containerRef.current?.querySelector("svg");
          if (svg && !svg.hasAttribute("data-panzoom")) {
            const panzoomInstance = Panzoom(svg, {
              maxScale: 5,
              minScale: 0.5,
              step: 0.1,
              cursor: "grab",
            });

            if (containerRef.current) {
              containerRef.current.addEventListener(
                "wheel",
                (event: WheelEvent) => {
                  event.preventDefault();
                  panzoomInstance.zoomWithWheel(event);
                }
              );
            }

            svg.setAttribute("data-panzoom", "true");
          }
        }, 300);
      } catch (error) {
        console.error("Mermaid error:", error);
      }
    };

    setupDiagram();
  }, [children]);

  return (
    <div
      ref={containerRef}
      style={{
        overflow: "hidden",
        border: "1px solid #e5e7eb",
        borderRadius: "0.5rem",
        marginBottom: "1rem",
        backgroundColor: "#fff",
        minHeight: "400px",
      }}
    />
  );
}
