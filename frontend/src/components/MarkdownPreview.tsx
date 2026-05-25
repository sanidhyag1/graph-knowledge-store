import { useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { useThemeMode } from "./MaterialThemeProvider";
import { IconButton, Tooltip } from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";
import "katex/dist/katex.min.css";

function CodeBlock({
  className,
  children,
  ...props
}: {
  className?: string;
  children?: ReactNode;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const text = String(children).replace(/\n$/, "");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="code-block-wrapper">
      <div className="code-block-header">
        {className?.replace("language-", "") && (
          <span className="code-block-lang">
            {className.replace("language-", "")}
          </span>
        )}
        <Tooltip title={copied ? "Copied!" : "Copy code"} arrow placement="top">
          <IconButton
            size="small"
            onClick={handleCopy}
            className="code-copy-btn"
            sx={{
              position: "absolute",
              top: 4,
              right: 4,
              opacity: 0,
              transition: "opacity 0.2s",
              color: copied ? "#4caf50" : "rgba(255,255,255,0.7)",
              "&:hover": {
                color: copied ? "#4caf50" : "#fff",
                backgroundColor: "rgba(255,255,255,0.1)",
              },
            }}
          >
            {copied ? (
              <CheckIcon sx={{ fontSize: 16 }} />
            ) : (
              <ContentCopyIcon sx={{ fontSize: 16 }} />
            )}
          </IconButton>
        </Tooltip>
      </div>
      <code className={className} {...props}>
        {children}
      </code>
    </div>
  );
}

export default function MarkdownPreview({ content }: { content: string }) {
  const { dark } = useThemeMode();
  return (
    <div className={`prose prose-sm max-w-none markdown-preview${dark ? " prose-invert" : ""}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          code({ className, children, ...props }) {
            const isInline = !className;
            if (isInline) {
              return (
                <code className="inline-code" {...props}>
                  {children}
                </code>
              );
            }
            return (
              <CodeBlock className={className} {...props}>
                {children}
              </CodeBlock>
            );
          },
          pre({ children }) {
            return <pre>{children}</pre>;
          },
          img({ src, alt, ...props }) {
            return (
              <img
                src={src}
                alt={alt || ""}
                {...props}
                style={{
                  maxWidth: "100%",
                  height: "auto",
                  borderRadius: 8,
                  margin: "8px 0",
                }}
                loading="lazy"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
