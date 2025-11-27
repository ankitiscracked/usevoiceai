import { codeToHtml } from "shiki";

export async function highlightCode(
  code: string,
  language: string
): Promise<string> {
  try {
    const html = await codeToHtml(code, {
      lang: language,
      themes: {
        light: "min-light",
        dark: "min-dark",
      },
      defaultColor: "light",
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
    return html;
  } catch (error) {
    console.error("Syntax highlighting error:", error);
    return `<pre><code>${code}</code></pre>`;
  }
}
