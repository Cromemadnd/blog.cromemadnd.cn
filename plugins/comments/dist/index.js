import { createRequire as __createRequire } from "node:module";
const require = __createRequire(import.meta.url);

// node_modules/@quartz-community/utils/dist/lang.js
function classNames(...classes) {
  return classes.filter(Boolean).join(" ");
}

// plugins/comments/src/components/scripts/comments.inline.ts
var comments_inline_default = 'var c="https://giscus.app",l=`${c}/client.js`,i=(e,n)=>e==="dark"?n.dataset.darkTheme??"dark":e==="light"?n.dataset.lightTheme??"light":e,d=(e,n)=>`${(e.dataset.themeUrl??`${c}/themes`).replace(/\\/+$/,"")}/${n}.css`,r=[],h=()=>{for(let s of r)s();r=[];let e=document.querySelector("#comments");if(!e)return;e.innerHTML="";let n=document.documentElement.getAttribute("saved-theme")??"dark",m=d(e,i(n,e)),t=document.createElement("script");t.src=l,t.async=!0,t.crossOrigin="anonymous";for(let[s,a]of Object.entries(e.dataset))a!==void 0&&(t.dataset[s]=a);t.dataset.loading="lazy",t.dataset.emitMetadata="0",t.dataset.theme=m,e.appendChild(t);let o=s=>{let a=document.querySelector("iframe.giscus-frame");if(!a||!s.detail?.theme)return;let u=d(e,i(s.detail.theme,e));a.contentWindow?.postMessage({giscus:{setConfig:{theme:u}}},c)};document.addEventListener("themechange",o),r.push(()=>document.removeEventListener("themechange",o))};document.addEventListener("nav",h);\n';

// plugins/comments/src/components/Comments.tsx
import { Fragment, jsx } from "preact/jsx-runtime";
var Comments_default = ((opts) => {
  const Comments = ({ displayClass, fileData }) => {
    const commentsOverride = fileData.frontmatter?.comments;
    if (commentsOverride === false || commentsOverride === "false") {
      return /* @__PURE__ */ jsx(Fragment, {});
    }
    const options = opts?.options;
    if (opts?.provider !== "giscus" || !options?.repo || !options.repoId || !options.category || !options.categoryId) {
      console.warn(
        "Comments: the giscus provider requires `repo`, `repoId`, `category` and `categoryId` \u2014 comments will not render."
      );
      return /* @__PURE__ */ jsx(Fragment, {});
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
      lang = "en"
    } = options;
    return /* @__PURE__ */ jsx(
      "div",
      {
        class: classNames(displayClass, "giscus"),
        id: "comments",
        "data-repo": repo,
        "data-repo-id": repoId,
        "data-category": category,
        "data-category-id": categoryId,
        "data-mapping": mapping,
        "data-strict": strict ? "1" : "0",
        "data-reactions-enabled": reactionsEnabled ? "1" : "0",
        "data-input-position": inputPosition,
        "data-light-theme": lightTheme,
        "data-dark-theme": darkTheme,
        "data-lang": lang,
        "data-theme-url": themeUrl || void 0
      }
    );
  };
  Comments.afterDOMLoaded = comments_inline_default;
  Comments.displayName = "Comments";
  return Comments;
});
export {
  Comments_default as Comments
};
//# sourceMappingURL=index.js.map
