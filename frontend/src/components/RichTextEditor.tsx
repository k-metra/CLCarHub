import { useRef } from "react";

type Format = "bold" | "italic" | "underline" | "heading" | "bullet" | "rule";

function toggleLinePrefix(value: string, start: number, end: number, prefix: string) {
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const selectedEnd = value.indexOf("\n", end);
  const lineEnd = selectedEnd === -1 ? value.length : selectedEnd;
  const line = value.slice(lineStart, lineEnd);
  const nextLine = line.startsWith(prefix) ? line.slice(prefix.length) : `${prefix}${line}`;
  return { value: `${value.slice(0, lineStart)}${nextLine}${value.slice(lineEnd)}`, start: lineStart, end: lineStart + nextLine.length };
}

export default function RichTextEditor({
  value,
  onChange,
  placeholder,
  rows = 12,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const format = (kind: Format) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.slice(start, end) || (kind === "heading" || kind === "bullet" ? "Text" : "text");
    const markers: Record<"bold" | "italic" | "underline", string> = { bold: "**", italic: "*", underline: "__" };
    let result: { value: string; start: number; end: number };
    if (kind === "heading") result = toggleLinePrefix(value, start, end, "## ");
    else if (kind === "bullet") result = toggleLinePrefix(value, start, end, "- ");
    else if (kind === "rule") {
      const lineStart = value.lastIndexOf("\n", start - 1) + 1;
      result = { value: `${value.slice(0, lineStart)}---\n${value.slice(lineStart)}`, start: lineStart + 4, end: lineStart + 4 };
    }
    else {
      const marker = markers[kind];
      result = { value: `${value.slice(0, start)}${marker}${selected}${marker}${value.slice(end)}`, start: start + marker.length, end: start + marker.length + selected.length };
    }
    onChange(result.value);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(result.start, result.end);
    });
  };

  return (
    <div className="mt-2 overflow-hidden border border-black/10">
      <div className="flex flex-wrap gap-1 border-b border-black/10 bg-[#f8f7f5] p-2" role="toolbar" aria-label="Text formatting">
        <button type="button" className="px-3 py-1 text-sm font-bold hover:bg-white" onClick={() => format("bold")} aria-label="Bold">B</button>
        <button type="button" className="px-3 py-1 text-sm italic hover:bg-white" onClick={() => format("italic")} aria-label="Italic">I</button>
        <button type="button" className="px-3 py-1 text-sm font-bold hover:bg-white" onClick={() => format("heading")} aria-label="Heading">H2</button>
        <button type="button" className="px-3 py-1 text-sm hover:bg-white" onClick={() => format("bullet")} aria-label="Bullet list">• List</button>
        <button type="button" className="px-3 py-1 text-sm underline hover:bg-white" onClick={() => format("underline")} aria-label="Underline">U</button>
        <button type="button" className="px-3 py-1 text-sm hover:bg-white" onClick={() => format("rule")} aria-label="Horizontal line">―</button>
        <span className="self-center px-2 text-xs text-[#777]">Select text, then choose a format.</span>
      </div>
      <textarea
        ref={textareaRef}
        rows={rows}
        className="block w-full resize-y px-3 py-3 text-sm font-normal leading-6 outline-none"
        value={value}
        onChange={event => onChange(event.target.value)}
        onKeyDown={event => {
          if (!(event.ctrlKey || event.metaKey)) return;
          const shortcuts: Record<string, Format> = {
            b: "bold",
            i: "italic",
            u: "underline",
            "2": "heading",
            "9": "bullet",
          };
          const formatType = shortcuts[event.key.toLowerCase()];
          if (!formatType) return;
          event.preventDefault();
          format(formatType);
        }}
        placeholder={placeholder}
      />
    </div>
  );
}
