import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import "@fontsource/geist";
import UseVoiceAILogo from "@/components/logo";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <div className="flex items-center gap-2">
          <UseVoiceAILogo size={28} />
          <span className="text-xl">usevoiceai</span>
        </div>
      ),
    },
    githubUrl: "https://github.com/ankitiscracked/usevoiceai",
  };
}
