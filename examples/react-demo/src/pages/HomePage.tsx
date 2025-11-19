import { Link } from "@tanstack/react-router";

const examples = [
  {
    title: "Manual Push-to-Talk",
    to: "/manual",
    description:
      "Classic press-to-start interaction. Useful for deterministic flows or when you want full control over each turn.",
  },
  {
    title: "Hands-free Auto Detection",
    to: "/auto",
    description:
      "Leverages STT hints to auto-stop and auto-restart recording, enabling natural barge-ins and conversational overlap.",
  },
];

export function HomePage() {
  return (
    <div className="max-w-4xl mx-auto space-y-10">
      <section className="space-y-4 text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-stone-500">
          Examples
        </p>
        <h1 className="text-4xl font-bold text-stone-900">
          Choose a voice interaction flow
        </h1>
        <p className="text-stone-600 max-w-2xl mx-auto">
          These demos reuse the same hook API but showcase different behaviors
          depending on the transcription hints you enable. Pick one to see it in
          action.
        </p>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        {examples.map((example) => (
          <Link
            key={example.to}
            to={example.to}
            className="block border border-stone-200 rounded-xl p-6 bg-white hover:border-stone-400 transition-colors"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-stone-900">
                {example.title}
              </h2>
              <span className="text-sm text-stone-400">→</span>
            </div>
            <p className="text-stone-600 mt-3">{example.description}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
