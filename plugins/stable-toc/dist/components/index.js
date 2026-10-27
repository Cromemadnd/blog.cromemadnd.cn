import { createRequire as __createRequire } from "node:module";
const require = __createRequire(import.meta.url);

// node_modules/.pnpm/github-slugger@2.0.0/node_modules/github-slugger/index.js
var own = Object.hasOwnProperty;

// node_modules/.pnpm/@quartz-community+utils@0.1.1_github-slugger@2.0.0_hast-util-to-jsx-runtime@2.3.6_preac_236326e92195e1478e36b265a65fb1bd/node_modules/@quartz-community/utils/dist/index.js
import { jsxs, jsx, Fragment } from "preact/jsx-runtime";
import { h } from "preact";
function classNames(...classes) {
  return classes.filter(Boolean).join(" ");
}
var U200D = String.fromCharCode(8205);

// plugins/stable-toc/src/components/TableOfContents.tsx
import { useId } from "preact/hooks";

// quartz/i18n/locales/en-US.ts
var en_US_default = {
  propertyDefaults: {
    title: "Untitled",
    description: "No description provided"
  },
  components: {
    callout: {
      note: "Note",
      abstract: "Abstract",
      info: "Info",
      todo: "Todo",
      tip: "Tip",
      success: "Success",
      question: "Question",
      warning: "Warning",
      failure: "Failure",
      danger: "Danger",
      bug: "Bug",
      example: "Example",
      quote: "Quote"
    },
    backlinks: {
      title: "Backlinks",
      noBacklinksFound: "No backlinks found"
    },
    themeToggle: {
      lightMode: "Light mode",
      darkMode: "Dark mode"
    },
    readerMode: {
      title: "Reader mode"
    },
    explorer: {
      title: "Explorer"
    },
    footer: {
      createdWith: "Created with"
    },
    graph: {
      title: "Graph View"
    },
    recentNotes: {
      title: "Recent Notes",
      seeRemainingMore: ({ remaining }) => `See ${remaining} more \u2192`
    },
    sidebar: {
      showLeft: "Show left sidebar",
      hideLeft: "Hide left sidebar",
      showRight: "Show right sidebar",
      hideRight: "Hide right sidebar"
    },
    mobileNav: {
      label: "Page sections",
      explorer: "Explore",
      content: "Article",
      toc: "Contents",
      comments: "Comments"
    },
    transcludes: {
      transcludeOf: ({ targetSlug }) => `Transclude of ${targetSlug}`,
      linkToOriginal: "Link to original"
    },
    search: {
      title: "Search",
      searchBarPlaceholder: "Search for something"
    },
    tableOfContents: {
      title: "Table of Contents"
    },
    contentMeta: {
      readingTime: ({ minutes }) => `${minutes} min read`
    }
  },
  pages: {
    rss: {
      recentNotes: "Recent notes",
      lastFewNotes: ({ count }) => `Last ${count} notes`
    },
    error: {
      title: "Not Found",
      notFound: "Either this page is private or doesn't exist.",
      home: "Return to Homepage"
    },
    folderContent: {
      folder: "Folder",
      itemsUnderFolder: ({ count }) => count === 1 ? "1 item under this folder." : `${count} items under this folder.`
    },
    tagContent: {
      tag: "Tag",
      tagIndex: "Tag Index",
      itemsUnderTag: ({ count }) => count === 1 ? "1 item with this tag." : `${count} items with this tag.`,
      showingFirst: ({ count }) => `Showing first ${count} tags.`,
      totalTags: ({ count }) => `Found ${count} total tags.`
    }
  }
};

// quartz/i18n/locales/zh-CN.ts
var zh_CN_default = {
  propertyDefaults: {
    title: "\u65E0\u9898",
    description: "\u65E0\u63CF\u8FF0"
  },
  components: {
    callout: {
      note: "\u7B14\u8BB0",
      abstract: "\u6458\u8981",
      info: "\u63D0\u793A",
      todo: "\u5F85\u529E",
      tip: "\u63D0\u793A",
      success: "\u6210\u529F",
      question: "\u95EE\u9898",
      warning: "\u8B66\u544A",
      failure: "\u5931\u8D25",
      danger: "\u5371\u9669",
      bug: "\u9519\u8BEF",
      example: "\u793A\u4F8B",
      quote: "\u5F15\u7528"
    },
    backlinks: {
      title: "\u53CD\u5411\u94FE\u63A5",
      noBacklinksFound: "\u65E0\u6CD5\u627E\u5230\u53CD\u5411\u94FE\u63A5"
    },
    themeToggle: {
      lightMode: "\u4EAE\u8272\u6A21\u5F0F",
      darkMode: "\u6697\u8272\u6A21\u5F0F"
    },
    readerMode: {
      title: "\u9605\u8BFB\u6A21\u5F0F"
    },
    explorer: {
      title: "\u63A2\u7D22"
    },
    footer: {
      createdWith: "Created with"
    },
    graph: {
      title: "\u5173\u7CFB\u56FE\u8C31"
    },
    recentNotes: {
      title: "\u6700\u8FD1\u7684\u7B14\u8BB0",
      seeRemainingMore: ({ remaining }) => `\u67E5\u770B\u66F4\u591A${remaining}\u7BC7\u7B14\u8BB0 \u2192`
    },
    sidebar: {
      showLeft: "\u5C55\u5F00\u5DE6\u4FA7\u680F",
      hideLeft: "\u6536\u8D77\u5DE6\u4FA7\u680F",
      showRight: "\u5C55\u5F00\u53F3\u4FA7\u680F",
      hideRight: "\u6536\u8D77\u53F3\u4FA7\u680F"
    },
    mobileNav: {
      label: "\u9875\u9762\u5206\u533A",
      explorer: "\u5BFC\u822A",
      content: "\u6B63\u6587",
      toc: "\u76EE\u5F55",
      comments: "\u8BC4\u8BBA"
    },
    transcludes: {
      transcludeOf: ({ targetSlug }) => `\u5305\u542B${targetSlug}`,
      linkToOriginal: "\u6307\u5411\u539F\u59CB\u7B14\u8BB0\u7684\u94FE\u63A5"
    },
    search: {
      title: "\u641C\u7D22",
      searchBarPlaceholder: "\u641C\u7D22\u4E9B\u4EC0\u4E48"
    },
    tableOfContents: {
      title: "\u76EE\u5F55"
    },
    contentMeta: {
      readingTime: ({ minutes }) => `${minutes}\u5206\u949F\u9605\u8BFB`
    }
  },
  pages: {
    rss: {
      recentNotes: "\u6700\u8FD1\u7684\u7B14\u8BB0",
      lastFewNotes: ({ count }) => `\u6700\u8FD1\u7684${count}\u6761\u7B14\u8BB0`
    },
    error: {
      title: "\u65E0\u6CD5\u627E\u5230",
      notFound: "\u9875\u9762\u4E0D\u5B58\u5728\uFF0C\u6216\u8005\u5DF2\u7ECF\u88AB\u79FB\u52A8\u5230\u4E86\u522B\u5904\u3002",
      home: "\u8FD4\u56DE\u9996\u9875"
    },
    folderContent: {
      folder: "\u6587\u4EF6\u5939",
      itemsUnderFolder: ({ count }) => `\u6B64\u6587\u4EF6\u5939\u4E0B\u6709${count}\u6761\u7B14\u8BB0\u3002`
    },
    tagContent: {
      tag: "\u6807\u7B7E",
      tagIndex: "\u6807\u7B7E\u7D22\u5F15",
      itemsUnderTag: ({ count }) => `\u6B64\u6807\u7B7E\u4E0B\u6709${count}\u6761\u7B14\u8BB0\u3002`,
      showingFirst: ({ count }) => `\u663E\u793A\u524D${count}\u4E2A\u6807\u7B7E\u3002`,
      totalTags: ({ count }) => `\u603B\u5171\u6709${count}\u4E2A\u6807\u7B7E\u3002`
    }
  }
};

// quartz/i18n/index.ts
var TRANSLATIONS = {
  "en-US": en_US_default,
  "zh-CN": zh_CN_default
};
var defaultTranslation = "en-US";
var i18n = (locale) => TRANSLATIONS[locale ?? defaultTranslation];

// plugins/stable-toc/src/components/styles/legacyToc.scss
var legacyToc_default = "details.toc {\n  & summary {\n    cursor: pointer;\n\n    &::marker {\n      color: var(--dark);\n    }\n\n    & > * {\n      padding-left: 0.25rem;\n      display: inline-block;\n      margin: 0;\n    }\n  }\n\n  & ul {\n    list-style: none;\n    margin: 0.5rem 1.25rem;\n    padding: 0;\n  }\n\n  @for $i from 1 through 6 {\n    & .depth-#{$i} {\n      padding-left: calc(1rem * #{$i});\n    }\n  }\n}\n";

// plugins/stable-toc/src/components/styles/toc.scss
var toc_default = ".toc {\n  display: flex;\n  flex-direction: column;\n  overflow-y: hidden;\n  min-height: 1.4rem;\n  flex: 0 0.5 auto;\n  &:has(button.toc-header.collapsed) {\n    flex: 0 1 1.4rem;\n  }\n}\n\nbutton.toc-header {\n  background-color: transparent;\n  border: none;\n  text-align: left;\n  cursor: pointer;\n  padding: 0;\n  color: var(--dark);\n  display: flex;\n  align-items: center;\n\n  & h3 {\n    font-size: 1rem;\n    display: inline-block;\n    margin: 0;\n  }\n\n  & .fold {\n    margin-left: 0.5rem;\n    transition: transform 0.3s ease;\n    opacity: 0.8;\n  }\n\n  &.collapsed .fold {\n    transform: rotateZ(-90deg);\n  }\n}\n\nul.toc-content.overflow {\n  list-style: none;\n  position: relative;\n  margin: 0.5rem 0;\n  padding: 0;\n  max-height: calc(100% - 2rem);\n  overscroll-behavior: contain;\n  list-style: none;\n\n  & > li > a {\n    color: var(--dark);\n    opacity: 0.35;\n    transition:\n      0.5s ease opacity,\n      0.3s ease color;\n    &.in-view {\n      opacity: 0.75;\n    }\n  }\n\n  @for $i from 0 through 6 {\n    & .depth-#{$i} {\n      padding-left: calc(1rem * #{$i});\n    }\n  }\n}\n";

// plugins/stable-toc/src/components/scripts/toc.inline.ts
var toc_inline_default = 'var i=new IntersectionObserver(t=>{for(let e of t){let n=e.target.id,o=document.querySelectorAll(`a[data-for="${n}"]`),s=e.rootBounds?.height;s&&o.length>0&&(e.boundingClientRect.y<s?o.forEach(c=>c.classList.add("in-view")):o.forEach(c=>c.classList.remove("in-view")))}});function r(){this.classList.toggle("collapsed"),this.setAttribute("aria-expanded",this.getAttribute("aria-expanded")==="true"?"false":"true");let t=this.nextElementSibling;t&&t.classList.toggle("collapsed")}function a(){let t=Array.from(document.getElementsByClassName("toc"));for(let e of t){let n=e.querySelector(".toc-header"),o=e.querySelector(".toc-content");if(!n||!o)return;n.addEventListener("click",r);let s=()=>n.removeEventListener("click",r);window.addCleanup&&window.addCleanup(s)}}function d(){a(),i.disconnect(),document.querySelectorAll("h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]").forEach(e=>i.observe(e))}document.addEventListener("nav",d);document.addEventListener("render",d);\n';

// plugins/stable-toc/src/components/OverflowList.tsx
import { jsx as jsx2, jsxs as jsxs2 } from "preact/jsx-runtime";
var OverflowList_default = () => ({
  OverflowList: ({ children, ...props }) => /* @__PURE__ */ jsxs2("ul", { ...props, class: [props.class, "overflow"].filter(Boolean).join(" "), children: [
    children,
    /* @__PURE__ */ jsx2("li", { class: "overflow-end" })
  ] }),
  overflowListAfterDOMLoaded: `
document.addEventListener("nav", () => {
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      entry.target.parentElement?.classList.toggle("gradient-active", !entry.isIntersecting)
    }
  })
  document.querySelectorAll(".toc .overflow > .overflow-end").forEach((end) => observer.observe(end))
  window.addCleanup(() => observer.disconnect())
})
`
});

// plugins/stable-toc/src/components/TableOfContents.tsx
import { jsx as jsx3, jsxs as jsxs3 } from "preact/jsx-runtime";
var defaultOptions = {
  layout: "modern"
};
var TableOfContents_default = ((opts) => {
  const layout = opts?.layout ?? defaultOptions.layout;
  const { OverflowList, overflowListAfterDOMLoaded } = OverflowList_default();
  const TableOfContents = (props) => {
    const id = `toc-${useId()}`;
    const { fileData, cfg } = props;
    if (!fileData?.toc) {
      return null;
    }
    return /* @__PURE__ */ jsxs3("div", { class: classNames("toc"), children: [
      /* @__PURE__ */ jsxs3(
        "button",
        {
          type: "button",
          class: fileData.collapseToc ? "collapsed toc-header" : "toc-header",
          "aria-controls": id,
          "aria-expanded": !fileData.collapseToc,
          children: [
            /* @__PURE__ */ jsx3("h3", { children: i18n(cfg.locale).components.tableOfContents.title }),
            /* @__PURE__ */ jsx3(
              "svg",
              {
                xmlns: "http://www.w3.org/2000/svg",
                width: "24",
                height: "24",
                viewBox: "0 0 24 24",
                fill: "none",
                stroke: "currentColor",
                "stroke-width": "2",
                "stroke-linecap": "round",
                "stroke-linejoin": "round",
                class: "fold",
                children: /* @__PURE__ */ jsx3("polyline", { points: "6 9 12 15 18 9" })
              }
            )
          ]
        }
      ),
      /* @__PURE__ */ jsx3(
        OverflowList,
        {
          id,
          class: fileData.collapseToc ? "collapsed toc-content" : "toc-content",
          children: fileData.toc.map((tocEntry) => {
            const slug2 = String(tocEntry.slug);
            const depth = String(tocEntry.depth);
            const text = String(tocEntry.text);
            return /* @__PURE__ */ jsx3("li", { class: `depth-${depth}`, children: /* @__PURE__ */ jsx3("a", { href: `#${slug2}`, "data-for": slug2, children: text }) }, slug2);
          })
        }
      )
    ] });
  };
  TableOfContents.css = toc_default;
  TableOfContents.afterDOMLoaded = [toc_inline_default, overflowListAfterDOMLoaded].join("\n");
  const LegacyTableOfContents = (props) => {
    const { fileData, cfg } = props;
    if (!fileData?.toc) {
      return null;
    }
    return /* @__PURE__ */ jsxs3("details", { class: "toc", open: !fileData.collapseToc, children: [
      /* @__PURE__ */ jsx3("summary", { children: /* @__PURE__ */ jsx3("h3", { children: i18n(cfg.locale).components.tableOfContents.title }) }),
      /* @__PURE__ */ jsx3("ul", { children: fileData.toc.map((tocEntry) => {
        const slug2 = String(tocEntry.slug);
        const depth = String(tocEntry.depth);
        const text = String(tocEntry.text);
        return /* @__PURE__ */ jsx3("li", { class: `depth-${depth}`, children: /* @__PURE__ */ jsx3("a", { href: `#${slug2}`, "data-for": slug2, children: text }) }, slug2);
      }) })
    ] });
  };
  LegacyTableOfContents.css = legacyToc_default;
  return layout === "modern" ? TableOfContents : LegacyTableOfContents;
});
export {
  TableOfContents_default as TableOfContents
};
//# sourceMappingURL=index.js.map
