// ../../node_modules/.pnpm/preact@10.29.8_preact-render-to-string@6.7.0/node_modules/preact/dist/preact.mjs
var l;
l = { __e: function(n2, l2, u3, t2) {
  for (var i2, r2, o2; l2 = l2.__; ) if ((i2 = l2.__c) && !i2.__) try {
    if ((r2 = i2.constructor) && null != r2.getDerivedStateFromError && (i2.setState(r2.getDerivedStateFromError(n2)), o2 = i2.__d), null != i2.componentDidCatch && (i2.componentDidCatch(n2, t2 || {}), o2 = i2.__d), o2) return i2.__E = i2;
  } catch (l3) {
    n2 = l3;
  }
  throw n2;
} }, "function" == typeof Promise ? Promise.prototype.then.bind(Promise.resolve()) : setTimeout, Math.random().toString(8);

// ../../node_modules/.pnpm/preact@10.29.8_preact-render-to-string@6.7.0/node_modules/preact/jsx-runtime/dist/jsxRuntime.mjs
var f2 = 0;
function u2(e2, t2, n2, o2, i2, u3) {
  t2 || (t2 = {});
  var a2, c2, p2 = t2;
  if ("ref" in p2) for (c2 in p2 = {}, t2) "ref" == c2 ? a2 = t2[c2] : p2[c2] = t2[c2];
  var l2 = { type: e2, props: p2, key: n2, ref: a2, __k: null, __: null, __b: 0, __e: null, __c: null, constructor: void 0, __v: --f2, __i: -1, __u: 0, __source: i2, __self: u3 };
  if ("function" == typeof e2 && (a2 = e2.defaultProps)) for (c2 in a2) void 0 === p2[c2] && (p2[c2] = a2[c2]);
  return l.vnode && l.vnode(l2), l2;
}

// src/components/OverflowList.tsx
var OverflowList = ({
  children,
  ...props
}) => {
  return /* @__PURE__ */ u2("ul", { ...props, class: [props.class, "overflow"].filter(Boolean).join(" "), id: props.id, children: [
    children,
    /* @__PURE__ */ u2("li", { class: "overflow-end" })
  ] });
};
var numLists = 0;
var OverflowList_default = () => {
  const id = `list-${numLists++}`;
  return {
    OverflowList: (props) => /* @__PURE__ */ u2(OverflowList, { ...props, id }),
    overflowListAfterDOMLoaded: `
document.addEventListener("nav", (e) => {
  const ul = document.getElementById("${id}")
  if (!ul) return

  const end = ul.querySelector(".overflow-end")
  if (!end) return

  const scrollContainer = ul.parentElement
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const parentUl = entry.target.parentElement
      if (!parentUl) return
      if (entry.isIntersecting) {
        parentUl.classList.remove("gradient-active")
      } else {
        parentUl.classList.add("gradient-active")
      }
    }
  }, scrollContainer ? { root: scrollContainer } : undefined)

  observer.observe(end)
  window.addCleanup(() => observer.disconnect())
})
`
  };
};

// ../../node_modules/.pnpm/@quartz-community+utils@0.1.1_github-slugger@2.0.0_hast-util-to-jsx-runtime@2.3.6_preac_236326e92195e1478e36b265a65fb1bd/node_modules/@quartz-community/utils/dist/lang.js
function classNames(...classes) {
  return classes.filter(Boolean).join(" ");
}

// src/i18n/locales/en-US.ts
var en_US_default = {
  components: {
    explorer: {
      title: "Explorer"
    }
  }
};

// src/i18n/index.ts
var locales = {
  "en-US": en_US_default
};
function i18n(locale) {
  return locales[locale] || en_US_default;
}

// src/components/styles/explorer.scss
var explorer_default = "@media all and (max-width: 800px) {\n  .page > #quartz-body > :not(.sidebar.left:has(.explorer)) {\n    transition: transform 300ms ease-in-out;\n  }\n  .page > #quartz-body.lock-scroll > :not(.sidebar.left:has(.explorer)) {\n    transform: translateX(100dvw);\n    transition: transform 300ms ease-in-out;\n  }\n  .page > #quartz-body .sidebar.left:has(.explorer) {\n    box-sizing: border-box;\n    position: sticky;\n    background-color: var(--light);\n    padding: 1rem 0 1rem 0;\n    margin: 0;\n  }\n  .page > #quartz-body .hide-until-loaded ~ .explorer-content {\n    display: none;\n  }\n}\n.explorer {\n  display: flex;\n  flex-direction: column;\n  overflow-y: hidden;\n  min-height: 1.2rem;\n  flex: 0 1 auto;\n}\n\n.explorer.collapsed {\n  flex: 0 1 1.2rem;\n}\n\n.explorer.collapsed .fold {\n  transform: rotateZ(-90deg);\n}\n\n.explorer .fold {\n  margin-left: 0.5rem;\n  transition: transform 0.3s ease;\n  opacity: 0.8;\n}\n\n@media all and (max-width: 800px) {\n  .explorer {\n    order: -1;\n    height: initial;\n    overflow: hidden;\n    flex-shrink: 0;\n    align-self: flex-start;\n    margin-top: auto;\n    margin-bottom: auto;\n  }\n}\n.explorer button.mobile-explorer {\n  display: none;\n}\n\n.explorer button.desktop-explorer {\n  display: flex;\n}\n\n@media all and (max-width: 800px) {\n  .explorer button.mobile-explorer {\n    display: flex;\n  }\n  .explorer button.desktop-explorer {\n    display: none;\n  }\n}\n.explorer svg {\n  pointer-events: all;\n  transition: transform 0.35s ease;\n}\n\n.explorer svg > polyline {\n  pointer-events: none;\n}\n\nbutton.mobile-explorer,\nbutton.desktop-explorer {\n  background-color: transparent;\n  border: none;\n  text-align: left;\n  cursor: pointer;\n  padding: 0;\n  color: var(--dark);\n  display: flex;\n  align-items: center;\n}\n\nbutton.mobile-explorer h2,\nbutton.desktop-explorer h2 {\n  font-size: 1rem;\n  display: inline-block;\n  margin: 0;\n}\n\n.explorer-content {\n  list-style: none;\n  overflow: hidden;\n  overflow-y: auto;\n  margin-top: 0.5rem;\n}\n\n.explorer-content ul {\n  list-style: none;\n  margin: 0;\n  padding: 0;\n}\n\n.explorer-content ul.explorer-ul {\n  overscroll-behavior: contain;\n}\n\n.explorer-content ul li > a {\n  color: var(--dark);\n  opacity: 0.75;\n  pointer-events: all;\n}\n\n.explorer-content ul li > a.active {\n  opacity: 1;\n  color: var(--tertiary);\n}\n\n.explorer-content .folder-outer {\n  visibility: collapse;\n  display: grid;\n  grid-template-rows: 0fr;\n  transition-property: grid-template-rows, visibility;\n  transition-duration: 0.3s;\n  transition-timing-function: ease-in-out;\n}\n\n.explorer-content .folder-outer.open {\n  visibility: visible;\n  grid-template-rows: 1fr;\n}\n\n.explorer-content .folder-outer > ul {\n  overflow: hidden;\n  margin-left: 6px;\n  padding-left: 0.8rem;\n  border-left: 1px solid var(--lightgray);\n}\n\n.folder-container {\n  flex-direction: row;\n  display: flex;\n  align-items: center;\n  user-select: none;\n}\n\n.folder-container div > a {\n  color: var(--secondary);\n  font-family: var(--headerFont);\n  font-size: 0.95rem;\n  font-weight: 600;\n  line-height: 1.5rem;\n  display: inline-block;\n}\n\n.folder-container div > a:hover {\n  color: var(--tertiary);\n}\n\n.folder-container div > button {\n  color: var(--dark);\n  background-color: transparent;\n  border: none;\n  text-align: left;\n  cursor: pointer;\n  padding-left: 0;\n  padding-right: 0;\n  display: flex;\n  align-items: center;\n  font-family: var(--headerFont);\n}\n\n.folder-container div > button span {\n  font-size: 0.95rem;\n  display: inline-block;\n  color: var(--secondary);\n  font-weight: 600;\n  margin: 0;\n  line-height: 1.5rem;\n  pointer-events: none;\n}\n\n.folder-icon {\n  margin-right: 5px;\n  color: var(--secondary);\n  cursor: pointer;\n  transition: transform 0.3s ease;\n  backface-visibility: visible;\n  flex-shrink: 0;\n}\n\nli:has(> .folder-outer:not(.open)) > .folder-container > svg {\n  transform: rotate(-90deg);\n}\n\n.folder-icon:hover {\n  color: var(--tertiary);\n}\n\n@media all and (max-width: 800px) {\n  .explorer.collapsed {\n    flex: 0 0 34px;\n  }\n  .explorer.collapsed > .explorer-content {\n    transform: translateX(-100vw);\n    visibility: hidden;\n  }\n  .explorer:not(.collapsed) {\n    flex: 0 0 34px;\n  }\n  .explorer:not(.collapsed) > .explorer-content {\n    transform: translateX(0);\n    visibility: visible;\n  }\n  .explorer .explorer-content {\n    box-sizing: border-box;\n    z-index: 100;\n    position: absolute;\n    top: 0;\n    left: 0;\n    margin-top: 0;\n    background-color: var(--light);\n    max-width: 100vw;\n    width: 100vw;\n    transform: translateX(-100vw);\n    transition: transform 200ms ease, visibility 200ms ease;\n    overflow: hidden;\n    padding: 4rem 0 2rem 0;\n    height: 100dvh;\n    max-height: 100dvh;\n    visibility: hidden;\n  }\n  .explorer .mobile-explorer {\n    margin: 0;\n    padding: 5px;\n    z-index: 101;\n  }\n  .explorer .mobile-explorer.hide-until-loaded {\n    display: none;\n  }\n  .explorer .mobile-explorer .lucide-menu {\n    stroke: var(--darkgray);\n  }\n}\n@media all and (max-width: 800px) {\n  .mobile-no-scroll .explorer-content > .explorer-ul {\n    overscroll-behavior: contain;\n  }\n}";

// src/components/scripts/explorer.inline.ts
var explorer_inline_default = `var J=Object.hasOwnProperty;function y(e){let u=O(P(e,"index"),!0);return u.length===0?"/":u}function I(){return typeof document>"u"?"":document.body?.dataset?.basepath??""}function b(e,u){let D=u??I(),r=e.startsWith("/")?e:"/"+e;return D+r}function W(e,u){return e===u||e.endsWith("/"+u)}function P(e,u){return W(e,u)&&(e=e.slice(0,-u.length)),e}function O(e,u){return e.startsWith("/")&&(e=e.substring(1)),!u&&e.endsWith("/")&&(e=e.slice(0,-1)),e}var N=class e{constructor(u,D){this.children=[],this.slugSegments=u,this.data=D||null,this.isFolder=!1,this.fileSegmentHint=null,this.displayNameOverride=void 0}get displayName(){return this.displayNameOverride!==void 0?this.displayNameOverride:(this.data?.title==="index"?void 0:this.data?.title)||this.fileSegmentHint||this.slugSegment||""}set displayName(u){this.displayNameOverride=u}get slug(){let u=this.slugSegments.join("/");return this.isFolder?u+"/index":u}get slugSegment(){return this.slugSegments[this.slugSegments.length-1]||""}makeChild(u,D){let r=[...this.slugSegments,u[0]],i=new e(r,D);return this.children.push(i),i}insert(u,D){if(u.length===0)return;this.isFolder=!0;let r=u[0];if(u.length===1)r==="index"?this.data||(this.data=D):this.makeChild(u,D);else{let i=this.children.find(n=>n.slugSegment===r);i||(i=this.makeChild(u,void 0));let t=(D.filePath||D.slug||"").split("/");i.fileSegmentHint=t[t.length-u.length],i.insert(u.slice(1),D)}}add(u){this.insert(u.slug.split("/"),u)}sort(u){this.children.sort(u),this.children.forEach(D=>D.sort(u))}filter(u){this.children=this.children.filter(u),this.children.forEach(D=>D.filter(u))}map(u){u(this),this.children.forEach(D=>D.map(u))}static fromEntries(u){let D=new e([],null);return u.forEach(([,r])=>D.add(r)),D}},R=(e,u)=>!e.isFolder&&!u.isFolder||e.isFolder&&u.isFolder?e.displayName.localeCompare(u.displayName,void 0,{numeric:!0,sensitivity:"base"}):!e.isFolder&&u.isFolder?1:-1,j=e=>e.slugSegment!=="tags";function H(e,u,D,r){return D&&e.filter(D),r&&e.map(r),u&&e.sort(u),e}async function q(e){try{console.log("[Explorer] Fetching content index...");let u=await fetchData;if(console.log("[Explorer] Fetched data keys:",Object.keys(u).slice(0,5)),!u)return console.error("[Explorer] No data received"),null;let D=u.content||u,r=Object.entries(D);if(console.log("[Explorer] Entry count:",r.length),r.length===0)return console.warn("[Explorer] No content entries found"),null;let i=N.fromEntries(r);console.log("[Explorer] Trie root children:",i.children.length);let t=R,n=j,d=null;if(e)try{let E=JSON.parse(e);E.sortFn&&(t=new Function("a","b","return ("+E.sortFn+")(a, b)")),E.filterFn&&(n=new Function("node","return ("+E.filterFn+")(node)")),E.mapFn&&(d=new Function("node","("+E.mapFn+")(node)"))}catch(E){console.error("Error parsing data functions:",E)}return H(i,t,n,d)}catch(u){return console.error("Error building file trie:",u),null}}var L=0;function w(e,u,D,r,i,t=""){let n=document.getElementById("template-folder"),d=document.getElementById("template-file");if(!n||!d)return;let E=t?t+"/"+e.slugSegment:e.slugSegment,C=y(D);if(e.isFolder){let s=n.content.cloneNode(!0),c=s.querySelector(".folder-container"),h=s.querySelector(".folder-button"),g=s.querySelector(".folder-title"),x=s.querySelector(".folder-outer"),S=s.querySelector(".content");if(g&&(g.textContent=e.displayName||e.slugSegment),c&&(c.dataset.folderpath=e.slug),r==="link"&&h){let F=document.createElement("a");F.className=h.className;let A=y(e.slug);F.href=b(A||""),g?F.appendChild(g):F.textContent=e.displayName||e.slugSegment,h.replaceWith(F),h=F}let o=i[e.slug]!==void 0?i[e.slug]:!1,l=y(e.slug),a=l&&l===C.slice(0,l.length);if((!o||a)&&x&&x.classList.add("open"),e.children&&e.children.length>0&&S)for(let F of e.children)w(F,S,D,r,i,E);u.appendChild(s)}else if(e.data){let s=d.content.cloneNode(!0),c=s.querySelector("a");c&&(c.href=b(e.data.slug),c.textContent=e.displayName||e.slugSegment,e.data.slug===D&&c.classList.add("active","is-active")),u.appendChild(s)}}async function k(e){let u=++L;try{console.log("[Explorer] Nav event received, generation:",u);let D=(e.detail?.url||"").replace(/^\\/+/,""),r=document.querySelectorAll("div.explorer");console.log("[Explorer] Found",r.length,"explorers");let i={};try{JSON.parse(localStorage.getItem("fileTree")||"[]").forEach(n=>{i[n.path]=n.collapsed})}catch(t){console.error("[Explorer] Error loading saved state:",t)}for(let t of r){let n=t.querySelector(".explorer-ul");if(!n){console.warn("[Explorer] No explorer-ul found");continue}n.innerHTML='<li class="overflow-end"></li>';let d=t.dataset.dataFns,E=t.dataset.behavior||"collapse";console.log("[Explorer] Starting tree build...");let C=await q(d);if(u===L){if(console.log("[Explorer] Render generation is current, rendering tree"),console.log("[Explorer] Trie result:",C?"success":"null"),C&&C.children&&C.children.length>0){n.innerHTML='<li class="overflow-end"></li>',console.log("[Explorer] Rendering",C.children.length,"children");for(let l of C.children)w(l,n,D,E,i,"");console.log("[Explorer] Render complete, final list length:",n.children.length)}else console.warn("[Explorer] No trie or empty children");let o=sessionStorage.getItem("explorerScrollTop");if(o)n.scrollTop=parseInt(o,10);else{let l=n.querySelector(".active");l&&l.scrollIntoView({behavior:"smooth"})}}else console.log("[Explorer] Stale render generation, skipping tree render");let s=u===L,c=[],h=t.getElementsByClassName("explorer-toggle");if(!s)continue;for(let o of h){let l=function(){let a=this.closest(".explorer");if(!a)return;let F=a.classList.toggle("collapsed");a.setAttribute("aria-expanded",F?"false":"true"),F?document.documentElement.classList.remove("mobile-no-scroll"):document.documentElement.classList.add("mobile-no-scroll")};o.addEventListener("click",l),c.push(()=>o.removeEventListener("click",l))}let g=t.getElementsByClassName("folder-icon");if(!s)continue;for(let o of g){let l=function(a){a.stopPropagation();let F=this.parentElement;if(!F)return;let A=F.nextElementSibling;if(!A)return;A.classList.toggle("open");let p=!A.classList.contains("open"),m=F.dataset.folderpath,f=JSON.parse(localStorage.getItem("fileTree")||"[]"),B=f.findIndex(v=>v.path===m);B>=0?f[B].collapsed=p:f.push({path:m,collapsed:p}),localStorage.setItem("fileTree",JSON.stringify(f))};o.addEventListener("click",l),c.push(()=>o.removeEventListener("click",l))}let x=t.getElementsByClassName("folder-button");if(!s)continue;for(let o of x){let l=function(a){let F=this.closest(".folder-container");if(!F)return;let A=t.dataset.behavior||"collapse",p=F.nextElementSibling,m=F.dataset.folderpath;if(A!=="link"){if(a.stopPropagation(),!p)return;p.classList.toggle("open");let f=!p.classList.contains("open"),B=JSON.parse(localStorage.getItem("fileTree")||"[]"),v=B.findIndex(T=>T.path===m);v>=0?B[v].collapsed=f:B.push({path:m,collapsed:f}),localStorage.setItem("fileTree",JSON.stringify(B))}};o.addEventListener("click",l),c.push(()=>o.removeEventListener("click",l))}let S=t.getElementsByClassName("folder-container");if(s){for(let o of S){let l=function(a){if(t.dataset.behavior!=="link"||a.target.closest(".folder-icon")||a.target.closest("a"))return;let F=o.querySelector("a.folder-button");F&&F.click()};o.addEventListener("click",l),c.push(()=>o.removeEventListener("click",l))}typeof window<"u"&&window.addCleanup&&window.addCleanup(()=>c.forEach(o=>o()))}}for(let t of document.getElementsByClassName("explorer")){let n=t.querySelector(".mobile-explorer");n&&(n.classList.remove("hide-until-loaded"),n.checkVisibility&&n.checkVisibility()&&(t.classList.add("collapsed"),t.setAttribute("aria-expanded","false"),document.documentElement.classList.remove("mobile-no-scroll")))}}catch(D){console.error("[Explorer] Fatal error in nav handler:",D)}}document.addEventListener("nav",k);document.addEventListener("render",k);document.addEventListener("prenav",()=>{let e=document.querySelector(".explorer-ul");e&&sessionStorage.setItem("explorerScrollTop",e.scrollTop.toString())});
`;

// src/components/Explorer.tsx
var defaultOptions = {
  folderDefaultState: "collapsed",
  folderClickBehavior: "link",
  useSavedState: true,
  mapFn: (node) => {
    return node;
  },
  sortFn: (a2, b2) => {
    if (!a2.isFolder && !b2.isFolder || a2.isFolder && b2.isFolder) {
      return (a2.displayName || "").localeCompare(b2.displayName || "", void 0, {
        numeric: true,
        sensitivity: "base"
      });
    }
    if (!a2.isFolder && b2.isFolder) {
      return 1;
    }
    return -1;
  },
  filterFn: (node) => node.slugSegment !== "tags",
  order: ["filter", "map", "sort"]
};
var numExplorers = 0;
function concatenateResources(...resources) {
  return resources.filter((r2) => !!r2).join("\n");
}
var Explorer_default = ((userOpts) => {
  const opts = { ...defaultOptions, ...userOpts };
  const { OverflowList: OverflowList2, overflowListAfterDOMLoaded } = OverflowList_default();
  const ExplorerComponent = (props) => {
    const { cfg } = props;
    const displayClass = props.displayClass;
    const id = `explorer-${numExplorers++}`;
    return /* @__PURE__ */ u2(
      "div",
      {
        class: classNames(displayClass, "explorer", "nav-files-container"),
        "data-behavior": opts.folderClickBehavior,
        "data-collapsed": opts.folderDefaultState,
        "data-savestate": opts.useSavedState,
        "data-data-fns": JSON.stringify({
          order: opts.order,
          sortFn: opts.sortFn?.toString(),
          filterFn: opts.filterFn?.toString(),
          mapFn: opts.mapFn?.toString()
        }),
        children: [
          /* @__PURE__ */ u2(
            "button",
            {
              type: "button",
              class: "explorer-toggle mobile-explorer hide-until-loaded",
              "data-mobile": true,
              "aria-controls": id,
              "aria-label": i18n(cfg?.locale ?? "en-US").components.explorer.title,
              children: /* @__PURE__ */ u2(
                "svg",
                {
                  xmlns: "http://www.w3.org/2000/svg",
                  width: "24",
                  height: "24",
                  viewBox: "0 0 24 24",
                  "stroke-width": "2",
                  "stroke-linecap": "round",
                  "stroke-linejoin": "round",
                  class: "lucide-menu",
                  children: [
                    /* @__PURE__ */ u2("line", { x1: "4", x2: "20", y1: "12", y2: "12" }),
                    /* @__PURE__ */ u2("line", { x1: "4", x2: "20", y1: "6", y2: "6" }),
                    /* @__PURE__ */ u2("line", { x1: "4", x2: "20", y1: "18", y2: "18" })
                  ]
                }
              )
            }
          ),
          /* @__PURE__ */ u2("div", { id, class: "explorer-content", "aria-expanded": false, role: "group", children: /* @__PURE__ */ u2(OverflowList2, { class: "explorer-ul" }) }),
          /* @__PURE__ */ u2("template", { id: "template-file", children: /* @__PURE__ */ u2("li", { children: /* @__PURE__ */ u2("a", { href: "#", class: "nav-file-title tree-item-self" }) }) }),
          /* @__PURE__ */ u2("template", { id: "template-folder", children: /* @__PURE__ */ u2("li", { children: [
            /* @__PURE__ */ u2("div", { class: "folder-container nav-folder-title tree-item-self", children: [
              /* @__PURE__ */ u2(
                "svg",
                {
                  xmlns: "http://www.w3.org/2000/svg",
                  width: "12",
                  height: "12",
                  viewBox: "5 8 14 8",
                  fill: "none",
                  stroke: "currentColor",
                  "stroke-width": "2",
                  "stroke-linecap": "round",
                  "stroke-linejoin": "round",
                  class: "folder-icon nav-folder-collapse-indicator collapse-icon",
                  children: /* @__PURE__ */ u2("polyline", { points: "6 9 12 15 18 9" })
                }
              ),
              /* @__PURE__ */ u2("div", { children: /* @__PURE__ */ u2("button", { class: "folder-button", children: /* @__PURE__ */ u2("span", { class: "folder-title" }) }) })
            ] }),
            /* @__PURE__ */ u2("div", { class: "folder-outer", children: /* @__PURE__ */ u2("ul", { class: "content tree-item-children" }) })
          ] }) })
        ]
      }
    );
  };
  ExplorerComponent.css = explorer_default;
  ExplorerComponent.afterDOMLoaded = concatenateResources(explorer_inline_default, overflowListAfterDOMLoaded);
  return ExplorerComponent;
});

export { Explorer_default as Explorer };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map