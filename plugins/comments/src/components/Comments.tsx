import type { QuartzComponent, QuartzComponentProps } from "@quartz-community/types";
import { classNames } from "../util/lang";
// @ts-expect-error - inline script imported as string by esbuild loader
import script from "./scripts/comments.inline";

type CommentsConstructor<Options> = (opts: Options) => QuartzComponent;

export type CommentsOptions = {
  provider: "giscus";
  options: {
    /** GitHub repository in `owner/name` form */
    repo: string;
    repoId: string;
    category: string;
    categoryId: string;
    /** Base URL for theme CSS files (defaults to the official giscus themes) */
    themeUrl?: string;
    lightTheme?: string;
    darkTheme?: string;
    mapping?: string;
    strict?: boolean;
    reactionsEnabled?: boolean;
    inputPosition?: "top" | "bottom";
    lang?: string;
  };
};

export default ((opts: CommentsOptions) => {
  const Comments: QuartzComponent = ({ displayClass, fileData }: QuartzComponentProps) => {
    const commentsOverride = fileData.frontmatter?.comments;
    if (commentsOverride === false || commentsOverride === "false") {
      return <></>;
    }

    const options = opts?.options;
    if (
      opts?.provider !== "giscus" ||
      !options?.repo ||
      !options.repoId ||
      !options.category ||
      !options.categoryId
    ) {
      console.warn(
        "Comments: the giscus provider requires `repo`, `repoId`, `category` and `categoryId` — comments will not render.",
      );
      return <></>;
    }

    const {
      repo,
      repoId,
      category,
      categoryId,
      themeUrl,
      lightTheme = "light",
      darkTheme = "dark",
      mapping = "url",
      strict = true,
      reactionsEnabled = true,
      inputPosition = "bottom",
      lang = "en",
    } = options;

    return (
      <div
        class={classNames(displayClass, "giscus")}
        id="comments"
        data-repo={repo}
        data-repo-id={repoId}
        data-category={category}
        data-category-id={categoryId}
        data-mapping={mapping}
        data-strict={strict ? "1" : "0"}
        data-reactions-enabled={reactionsEnabled ? "1" : "0"}
        data-input-position={inputPosition}
        data-light-theme={lightTheme}
        data-dark-theme={darkTheme}
        data-lang={lang}
        data-theme-url={themeUrl || undefined}
      ></div>
    );
  };

  Comments.afterDOMLoaded = script;
  Comments.displayName = "Comments";

  return Comments;
}) satisfies CommentsConstructor<CommentsOptions>;
