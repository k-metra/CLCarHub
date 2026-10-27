import { useId, useState, type ReactNode } from "react";

export default function FaqAccordion({
  question,
  children,
  className = "",
}: {
  question: string;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const contentId = useId();

  return (
    <div className={className}>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-5 text-left font-semibold"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen(current => !current)}
      >
        <span>{question}</span>
        <span className={`shrink-0 text-2xl font-normal text-[#ff641f] transition-transform duration-300 ease-out ${open ? "rotate-45" : ""}`} aria-hidden="true">+</span>
      </button>
      <div
        id={contentId}
        className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
        aria-hidden={!open}
      >
        <div className="min-h-0 overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  );
}
