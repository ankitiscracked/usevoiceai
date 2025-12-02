import { TabbedCodeHighlight } from "@/components/tabbed-code-highlight";
import { baseOptions } from "@/lib/layout.shared";
import { createFileRoute, Link } from "@tanstack/react-router";
import { HomeLayout } from "fumadocs-ui/layouts/home";

export const Route = createFileRoute("/")({
  component: Home,
  loader: async () => {
    const snippets = [
      {
        name: "worker.ts",
        language: "typescript",
        code: `export const VoiceSessionDO = createVoiceDurableObject<Env>({
  transcription: (env) => deepgram("nova-3", { apiKey: env.DEEPGRAM_API_KEY }),
  agent: () => new MockAgentProcessor(),
  speech: (env) => cartesia("sonic-3", { apiKey: env.CARTESIA_API_KEY }),
});

export default {
  async fetch(request: Request, env: Env) {
      const stub = env.VOICE_SESSION.get(id);
      return stub.fetch(new Request(request, { headers }));
    }
    return new Response("Not found", { status: 404 });
  },
};

export { VoiceSessionDO };`,
      },
      {
        name: "client.ts",
        language: "typescript",
        code: `const { startRecording, stopRecording, status, speechStream } = useVoice({
  socketOptions: { url: import.meta.env.VITE_USEVOICEAI_WS_URL },
});

const { stop } = useSpeech({ speechStream });`,
      },
    ];

    // const highlightedSnippets = await Promise.all(
    //   snippets.map(async (snippet) => ({
    //     ...snippet,
    //     html: await highlightCode(snippet.code, snippet.language),
    //   }))
    // );

    return { snippets };
  },
});

function Home() {
  const { snippets } = Route.useLoaderData();

  return (
    <HomeLayout {...baseOptions()} className="">
      <div className="flex flex-col lg:flex-row items-center justify-between lg:max-w-[80%] xl:w-fd-container 2xl:max-w-fd-container mx-auto px-4 min-h-[60vh] gap-12 lg:gap-24 mt-12">
        <div className="flex-1 shrink-0 text-center lg:text-left w-1/2">
          <h1 className="font text-3xl mb-4 text-left tracking-tight">
            The Typescript toolkit for ambitious voice AI apps
          </h1>
          <Link
            to="/docs/$"
            params={{
              _splat: "",
            }}
            className="px-3 py-2 rounded-sm bg-zinc-800 dark:bg-zinc-200 text-zinc-200 dark:text-zinc-800 text-sm mx-auto inline-block"
          >
            Get Started
          </Link>
        </div>
        <div className="w-1/2">
          <TabbedCodeHighlight snippets={snippets} />
        </div>
      </div>
    </HomeLayout>
  );
}
