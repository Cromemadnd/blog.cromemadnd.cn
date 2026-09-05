import { PageFrame, PageFrameProps } from "./types"
import HeaderConstructor from "../Header"
import { getDate } from "../Date"
import { byDateAndAlphabetical, PageList } from "../PageList"
import { FullSlug, joinSegments, pathToRoot, resolveRelative } from "../../util/path"
import { i18n } from "../../i18n"

const Header = HeaderConstructor()

const formatNumericDate = (date: Date) => {
  const pad = (n: number) => `${n}`.padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

const sidebarToggleScript = `
(() => {
  // micromorph does not re-execute identical inline scripts, but if a nav ever
  // does replace this node the listeners below must not double-bind (two
  // toggles per click would make the buttons look dead)
  if (window.__quartzSidebarFrameInit) return
  window.__quartzSidebarFrameInit = true

  const sides = ["left", "right"]
  const mobileQuery = window.matchMedia("(max-width: 1199px)")
  const desktopQuery = window.matchMedia("(min-width: 1200px)")
  const STORAGE_KEY = "sidebar-visibility"

  const root = () => document.getElementById("quartz-root")

  const readSavedState = () => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") || {}
    } catch {
      return {}
    }
  }

  const syncSidebarToggle = (button, side, collapsed) => {
    const label = collapsed ? button.dataset.showLabel : button.dataset.hideLabel
    button.setAttribute("aria-pressed", collapsed ? "true" : "false")
    button.setAttribute("aria-label", label)
    button.setAttribute("title", label)
  }

  const syncAllSidebarToggles = () => {
    const el = root()
    if (!el) return

    for (const side of sides) {
      const collapsed = el.classList.contains(side + "-sidebar-collapsed")
      document.querySelectorAll('.sidebar-toggle[data-sidebar="' + side + '"]').forEach((button) => {
        syncSidebarToggle(button, side, collapsed)
      })
    }
  }

  // PC-only persistence: re-apply the remembered collapsed state on load and
  // after every SPA nav (micromorph re-syncs the root's class attribute from
  // the fresh markup, which would otherwise reset the sidebars).
  const applySavedSidebarState = () => {
    const el = root()
    if (!el || !desktopQuery.matches) return
    const saved = readSavedState()
    for (const side of sides) {
      el.classList.toggle(side + "-sidebar-collapsed", saved[side] === "collapsed")
    }
    syncAllSidebarToggles()
  }

  const persistSidebarState = (side, collapsed) => {
    const saved = readSavedState()
    saved[side] = collapsed ? "collapsed" : "open"
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))
    } catch {}
  }

  const handleToggleClick = (event) => {
    const button = event.target.closest(".sidebar-toggle")
    if (!button) return

    const el = root()
    const side = button.dataset.sidebar || "left"
    const collapsedClass = side + "-sidebar-collapsed"
    const collapsed = !el?.classList.contains(collapsedClass)
    el?.classList.toggle(collapsedClass, collapsed)
    persistSidebarState(side, collapsed)
    syncAllSidebarToggles()
  }

  document.addEventListener("click", handleToggleClick)
  document.addEventListener("DOMContentLoaded", syncAllSidebarToggles)
  applySavedSidebarState()

  // Mobile bottom bar switches between sub-pages (content is the default).
  // Each sub-page remembers its scroll offset, so leaving a tab and coming
  // back keeps the reader's place.
  const scrollMemory = new Map()

  // The search widget lives in the header for desktop, but on the explorer
  // tab it becomes the page's search bar (fixed positioning inside the header
  // paints unreliably there). Once it sits in the sidebar it is no longer a
  // ".page-header" descendant, so the lookup must cover both homes or any
  // "move it back" logic would silently never fire.
  const findSearchWidget = () =>
    document.querySelector(".page-header .search") ??
    document.querySelector(".sidebar.left > .search")

  const placeSearchWidget = (nav) => {
    const search = findSearchWidget()
    if (!search) return
    if (nav === "left") {
      document.querySelector(".sidebar.left")?.prepend(search)
    } else if (search.closest(".sidebar")) {
      const host = document.querySelector(".toolbar-actions .flex-component")
      ;(host ?? document.querySelector(".toolbar-actions"))?.appendChild(search)
    }
  }

  const setMobileView = (nav) => {
    const el = root()
    if (!el) return
    const prev = el.dataset.mobileView || "content"
    if (nav !== prev) {
      scrollMemory.set(prev, window.scrollY)
      el.dataset.mobileView = nav
      // the target region only exists in layout once the attribute flipped;
      // wait a frame so its stored offset is reachable
      requestAnimationFrame(() => {
        window.scrollTo({ top: scrollMemory.get(nav) ?? 0, behavior: "instant" })
      })
    }

    placeSearchWidget(nav)

    // the graph sizes itself at nav time and has no resize listener, so it
    // renders at zero size if its view was hidden — re-trigger its build
    if (nav === "right") {
      document.dispatchEvent(
        new CustomEvent("nav", { detail: { url: window.location.pathname } }),
      )
    }
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest(".mobile-nav button[data-nav]")
    if (!button || !mobileQuery.matches) return
    setMobileView(button.dataset.nav)
  })

  // On mobile the TOC lives in its own sub-page with the article hidden, so a
  // heading anchor has nothing to scroll: capture the click before the SPA
  // router, switch to the content sub-page, then glide to the section.
  document.addEventListener("click", (event) => {
    if (!mobileQuery.matches) return
    const link = event.target.closest('.toc-content a[href^="#"]')
    if (!link) return
    const id = decodeURIComponent(link.getAttribute("href").slice(1))
    const target = document.getElementById(id)
    if (!target) return
    event.preventDefault()
    event.stopPropagation()
    setMobileView("content")
    requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: "smooth", block: "start" })
    })
  }, true)

  // A real navigation lands on a fresh page: back to the content sub-page at
  // the top. The synthetic nav event setMobileView fires for the graph keeps
  // the same URL, so it must not be mistaken for navigation (it would wipe
  // the scroll memory mid tab-switch).
  let lastUrl = window.location.href
  document.addEventListener("nav", () => {
    applySavedSidebarState()
    if (!mobileQuery.matches) return
    if (window.location.href === lastUrl) return
    lastUrl = window.location.href
    scrollMemory.clear()
    setMobileView("content")
  })

  // Crossing the breakpoint: entering desktop restores the remembered state,
  // leaving it clears the classes so the mobile tab views are unaffected.
  desktopQuery.addEventListener?.("change", (event) => {
    if (event.matches) {
      applySavedSidebarState()
      return
    }
    const el = root()
    if (!el) return
    el.classList.remove("left-sidebar-collapsed", "right-sidebar-collapsed")
    syncAllSidebarToggles()
  })

  // Resizing across the breakpoint must not strand the search widget on the
  // wrong side: leaving mobile always returns it to the toolbar, and entering
  // mobile with the explorer tab still active takes it back into the sidebar.
  mobileQuery.addEventListener?.("change", (event) => {
    if (event.matches) {
      if (root()?.dataset.mobileView === "left") placeSearchWidget("left")
    } else {
      placeSearchWidget("content")
    }
  })

  // Arknights-style depth: the background layers sit at different distances,
  // so they drift with the pointer at layer-dependent rates (CSS translates
  // the plates via --par-x/--par-y; foreground content stays put). rAF-throttled.
  const parallaxQuery = window.matchMedia("(min-width: 1200px) and (pointer: fine)")
  let parallaxRaf = 0
  window.addEventListener("mousemove", (event) => {
    if (!parallaxQuery.matches || parallaxRaf) return
    parallaxRaf = requestAnimationFrame(() => {
      parallaxRaf = 0
      const el = document.documentElement.style
      el.setProperty("--par-x", (event.clientX / window.innerWidth - 0.5).toFixed(4))
      el.setProperty("--par-y", (event.clientY / window.innerHeight - 0.5).toFixed(4))
    })
  })
})()
`

/**
 * The default page frame — three-column layout with left sidebar, center
 * content (header + body + afterBody), and right sidebar, followed by a footer.
 *
 * This is the original Quartz layout, extracted from renderPage.tsx.
 */
export const DefaultFrame: PageFrame = {
  name: "default",
  render({
    componentData,
    header,
    beforeBody,
    pageBody: Content,
    afterBody,
    left,
    right,
  }: PageFrameProps) {
    const tags = componentData.fileData.frontmatter?.tags
    const isIndex = componentData.fileData.slug === "index"
    const date =
      !isIndex && componentData.fileData.dates ? getDate(componentData.fileData) : undefined
    const baseDir =
      componentData.fileData.slug === "404" ? "/" : pathToRoot(componentData.fileData.slug!)
    const iconPath = joinSegments(baseDir, "static/favicon.jpg")
    const toolbar = beforeBody.filter((BodyComponent) => BodyComponent.displayName === "Flex")
    const headerContent = beforeBody.filter(
      (BodyComponent) =>
        BodyComponent.displayName !== "Flex" && BodyComponent.displayName !== "ContentMetadata",
    )
    const contentMeta = beforeBody.filter(
      (BodyComponent) => BodyComponent.displayName === "ContentMetadata",
    )
    const recentFiles = componentData.allFiles.filter((file) => {
      const slug = file.slug
      return (
        slug !== undefined &&
        slug !== "404" &&
        slug !== "index" &&
        slug !== "tags" &&
        !slug.startsWith("tags/") &&
        !slug.endsWith("/index")
      )
    })
    // double chevrons pointing at their sidebar: far more recognizable at
    // 1.15rem than the old two-pane glyph, which read the same on both sides
    const SidebarToggleIcon = ({ side }: { side: "left" | "right" }) => (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        {side === "left" ? (
          <>
            <path d="m11 17-5-5 5-5" />
            <path d="m18 17-5-5 5-5" />
          </>
        ) : (
          <>
            <path d="m6 17 5-5-5-5" />
            <path d="m13 17 5-5-5-5" />
          </>
        )}
      </svg>
    )
    const sidebarToggleLabels = (side: "left" | "right") => {
      const key = side === "left" ? "Left" : "Right"
      return {
        "data-show-label": i18n(componentData.cfg.locale ?? "en-US").components.sidebar[
          `show${key}`
        ],
        "data-hide-label": i18n(componentData.cfg.locale ?? "en-US").components.sidebar[
          `hide${key}`
        ],
      }
    }

    const hasComments = afterBody.some(
      (BodyComponent) => BodyComponent.displayName === "Comments",
    )
    const mobileNav = i18n(componentData.cfg.locale ?? "en-US").components.mobileNav
    const MobileNavIcon = ({ children }: { children: JSX.Element }) => (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        {children}
      </svg>
    )

    return (
      <>
        <div class="left sidebar">
          {left.map((BodyComponent) => (
            <BodyComponent {...componentData} />
          ))}
        </div>
        <div class="page-header">
            <a
              class="site-brand"
              href={joinSegments(baseDir, "/")}
              aria-label={componentData.cfg.pageTitle}
            >
              <img src={iconPath} alt="" aria-hidden="true" />
              <span>{componentData.cfg.pageTitle}</span>
            </a>
            <Header {...componentData}>
              {header.map((HeaderComponent) => (
                <HeaderComponent {...componentData} />
              ))}
            </Header>
            <div class="page-header-actions">
              <div class="toolbar-actions">
                <button
                  type="button"
                  class="sidebar-toggle left-sidebar-toggle"
                  data-sidebar="left"
                  aria-pressed="false"
                  {...sidebarToggleLabels("left")}
                >
                  <SidebarToggleIcon side="left" />
                </button>
                {toolbar.map((BodyComponent) => (
                  <BodyComponent {...componentData} />
                ))}
                <button
                  type="button"
                  class="sidebar-toggle right-sidebar-toggle"
                  data-sidebar="right"
                  aria-pressed="false"
                  {...sidebarToggleLabels("right")}
                >
                  <SidebarToggleIcon side="right" />
                </button>
              </div>
            </div>
        </div>
        <div class="center">
            <div class="page-header-main">
              {headerContent.map((BodyComponent) => (
                <BodyComponent {...componentData} />
              ))}
              {!isIndex && (Array.isArray(tags) && tags.length > 0 ? true : date !== undefined) ? (
                <div class="page-meta-line">
                  {Array.isArray(tags) && tags.length > 0 ? (
                    <div class="page-tags">
                      {tags.map((tag) => (
                        <a
                          class="internal tag-link"
                          href={resolveRelative(
                            componentData.fileData.slug!,
                            `tags/${tag}` as FullSlug,
                          )}
                        >
                          {tag}
                        </a>
                      ))}
                    </div>
                  ) : null}
                  {date ? (
                    <span class="page-date">
                      <time dateTime={date.toISOString()}>{formatNumericDate(date)}</time>
                    </span>
                  ) : null}
                  {contentMeta.length > 0 ? (
                    <div class="page-reading-meta">
                      {contentMeta.map((BodyComponent) => (
                        <BodyComponent {...componentData} />
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
          </div>
          <Content {...componentData} />
          {isIndex && (
            <section class="home-recent-notes">
              <h2>{i18n(componentData.cfg.locale ?? "en-US").components.recentNotes.title}</h2>
              {PageList({
                ...componentData,
                allFiles: recentFiles,
                limit: 5,
                sort: byDateAndAlphabetical(),
              })}
            </section>
          )}
          <hr />
          <div class="page-footer">
            <div class="footer-copyright">
              <p>
                Copyright{" "}
                <a href={resolveRelative(componentData.fileData.slug!, "about" as FullSlug)}>
                  Cromemadnd
                </a>{" "}
                2026. All rights reserved
              </p>
              <p>
                Built with{" "}
                <a href="https://quartz.jzhao.xyz/" target="_blank" rel="noopener">
                  Quartz
                </a>{" "}
                v5.0.0 © 2026
              </p>
            </div>
            {afterBody.map((BodyComponent) => (
              <BodyComponent {...componentData} />
            ))}
          </div>
        </div>
        <div class="right sidebar">
          {right.map((BodyComponent) => (
            <BodyComponent {...componentData} />
          ))}
        </div>
        <nav class="mobile-nav" aria-label={mobileNav.label}>
          <button type="button" data-nav="left" aria-label={mobileNav.explorer}>
            <MobileNavIcon>
              <circle cx="12" cy="12" r="10" />
              <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
            </MobileNavIcon>
            <span>{mobileNav.explorer}</span>
          </button>
          <button type="button" data-nav="content" aria-label={mobileNav.content}>
            <MobileNavIcon>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </MobileNavIcon>
            <span>{mobileNav.content}</span>
          </button>
          <button type="button" data-nav="right" aria-label={mobileNav.toc}>
            <MobileNavIcon>
              <line x1="8" y1="6" x2="21" y2="6" />
              <line x1="8" y1="12" x2="21" y2="12" />
              <line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" />
              <line x1="3" y1="12" x2="3.01" y2="12" />
              <line x1="3" y1="18" x2="3.01" y2="18" />
            </MobileNavIcon>
            <span>{mobileNav.toc}</span>
          </button>
          {hasComments && (
            <button type="button" data-nav="comments" aria-label={mobileNav.comments}>
              <MobileNavIcon>
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </MobileNavIcon>
              <span>{mobileNav.comments}</span>
            </button>
          )}
        </nav>
        <script dangerouslySetInnerHTML={{ __html: sidebarToggleScript }} />
      </>
    )
  },
}
