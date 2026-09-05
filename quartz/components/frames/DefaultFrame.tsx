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
  const sides = ["left", "right"]
  const mobileQuery = window.matchMedia("(max-width: 1199px)")

  const root = () => document.getElementById("quartz-root")

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

  const handleToggleClick = (event) => {
    const button = event.target.closest(".sidebar-toggle")
    if (!button) return

    const el = root()
    const side = button.dataset.sidebar || "left"
    const collapsedClass = side + "-sidebar-collapsed"
    const collapsed = !el?.classList.contains(collapsedClass)
    el?.classList.toggle(collapsedClass, collapsed)
    syncAllSidebarToggles()
  }

  document.addEventListener("click", handleToggleClick)
  document.addEventListener("DOMContentLoaded", syncAllSidebarToggles)
  document.addEventListener("nav", syncAllSidebarToggles)
  syncAllSidebarToggles()

  // Mobile bottom bar switches between sub-pages (content is the default).
  document.addEventListener("click", (event) => {
    const button = event.target.closest(".mobile-nav button[data-nav]")
    if (!button || !mobileQuery.matches) return

    const el = root()
    if (!el) return
    const nav = button.dataset.nav
    el.dataset.mobileView = nav
    window.scrollTo({ top: 0 })

    // The search widget lives in the header for desktop, but on the explorer
    // tab it becomes the page's search bar: relocate the node (fixed
    // positioning inside the header paints unreliably here).
    const search = document.querySelector(".page-header .search")
    if (search) {
      if (nav === "left") {
        document.querySelector(".sidebar.left")?.prepend(search)
      } else if (search.closest(".sidebar")) {
        const host = document.querySelector(".toolbar-actions .flex-component")
        ;(host ?? document.querySelector(".toolbar-actions"))?.appendChild(search)
      }
    }

    // the graph sizes itself at nav time and has no resize listener, so it
    // renders at zero size if its view was hidden — re-trigger its build
    if (nav === "right") {
      document.dispatchEvent(
        new CustomEvent("nav", { detail: { url: window.location.pathname } }),
      )
    }
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
    const SidebarToggleIcon = () => (
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
        <rect width="18" height="18" x="3" y="3" rx="2" />
        <path d="M9 3v18" />
        <path d="M15 3v18" />
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
                  <SidebarToggleIcon />
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
                  <SidebarToggleIcon />
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
