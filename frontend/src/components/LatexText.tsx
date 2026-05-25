import { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

export default function LatexText({ text }: { text?: string | null }) {
  const safeText = typeof text === "string" ? text : String(text || "");
  
  const parts = useMemo(() => {
    if (!safeText) return [];
    const result: { type: "text" | "math"; content: string }[] = [];
    const regex = /\$([^$]+)\$/g;
    let last = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(safeText)) !== null) {
      if (match.index > last) {
        result.push({ type: "text", content: safeText.slice(last, match.index) });
      }
      result.push({ type: "math", content: match[1] });
      last = regex.lastIndex;
    }
    if (last < safeText.length) {
      result.push({ type: "text", content: safeText.slice(last) });
    }
    return result;
  }, [safeText]);

  return (
    <>
      {parts.map((part, i) => {
        if (part.type === "text") return part.content;
        try {
          const html = katex.renderToString(part.content, {
            throwOnError: false,
            displayMode: false,
          });
          return <span key={i} dangerouslySetInnerHTML={{ __html: html }} />;
        } catch {
          return <code key={i}>{part.content}</code>;
        }
      })}
    </>
  );
}
