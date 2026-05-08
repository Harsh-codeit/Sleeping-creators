import { ArrowLeft, FileText, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";

function Section({ heading, paragraphs = [], bullets = [] }) {
  return (
    <section className="border border-zinc-800 bg-zinc-950/80 p-6 md:p-7">
      <h2 className="text-lg font-semibold text-white">{heading}</h2>
      <div className="mt-4 space-y-4">
        {paragraphs.map((paragraph) => (
          <p key={paragraph} className="text-sm leading-7 text-zinc-300">
            {paragraph}
          </p>
        ))}
        {bullets.length > 0 && (
          <ul className="space-y-2 text-sm leading-7 text-zinc-300">
            {bullets.map((bullet) => (
              <li key={bullet} className="flex gap-3">
                <span className="mt-3 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-zinc-500" />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export default function LegalDocument({
  eyebrow,
  title,
  summary,
  lastUpdated,
  sections,
}) {
  return (
    <div className="min-h-screen bg-zinc-950">
      <div className="mx-auto max-w-5xl px-6 py-8 md:px-8 md:py-10">
        <div className="mb-10 flex flex-col gap-6 border border-zinc-800 bg-zinc-950/90 p-6 md:flex-row md:items-end md:justify-between md:p-8">
          <div className="max-w-2xl">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center border border-zinc-700 bg-white text-black">
                <ShieldCheck size={18} />
              </div>
              <div>
                <div className="text-sm font-bold tracking-tight text-white">Sleeping Creators</div>
                <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-zinc-500">
                  Content Engine
                </div>
              </div>
            </div>

            <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-zinc-500">
              {eyebrow}
            </div>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-white md:text-4xl">
              {title}
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-zinc-300">
              {summary}
            </p>
          </div>

          <div className="space-y-3 md:text-right">
            <div className="inline-flex items-center gap-2 border border-zinc-800 bg-zinc-900 px-3 py-2 text-[10px] font-mono uppercase tracking-[0.25em] text-zinc-400">
              <FileText size={12} />
              Last Updated
            </div>
            <div className="text-sm text-zinc-200">{lastUpdated}</div>
            <Link
              to="/login"
              className="inline-flex items-center gap-2 text-xs font-mono text-zinc-500 transition-colors duration-150 hover:text-white"
            >
              <ArrowLeft size={13} />
              Back to App
            </Link>
          </div>
        </div>

        <div className="space-y-4">
          {sections.map((section) => (
            <Section key={section.heading} {...section} />
          ))}
        </div>
      </div>
    </div>
  );
}
