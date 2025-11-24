import { createFileRoute, Link } from "@tanstack/react-router";
import { HomeLayout } from "fumadocs-ui/layouts/home";
import { baseOptions } from "@/lib/layout.shared";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <HomeLayout {...baseOptions()} className="text-center py-32 justify-center">
      <div className="flex items-center justify-between mx-auto max-w-6xl">
        <div>
          <h1 className="font-medium text-xl mb-4">
            The Typescript toolkit for ambitious voice AI apps
          </h1>
          <Link
            to="/docs/$"
            params={{
              _splat: "",
            }}
            className="px-3 py-2 rounded-lg bg-fd-primary text-fd-primary-foreground font-medium text-sm mx-auto"
          >
            Get Started
          </Link>
        </div>
        <div className="w-2/5">
          <div className="flex items-start gap-2 mb-2">
            <span>client.ts</span>
            <span>server.ts</span>
          </div>
          <img src="../../public/images/ray-so-export.png" alt="Get Started" />
        </div>
      </div>
    </HomeLayout>
  );
}
