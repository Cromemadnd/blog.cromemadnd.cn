import { PageFrame, PageFrameProps } from "./types"
import HeaderConstructor from "../Header"
import { getDate } from "../Date"
import { byDateAndAlphabetical, PageList } from "../PageList"
import { FullSlug, joinSegments, pathToRoot, resolveRelative } from "../../util/path"

const Header = HeaderConstructor()

const formatNumericDate = (date: Date) =>
  `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`

const sidebarToggleScript = `
(() => {
  const sides = ["left", "right"]

  const syncSidebarToggle = (button, side, collapsed) => {
    button.setAttribute("aria-pressed", collapsed ? "true" : "false")
    button.setAttribute("aria-label", collapsed ? "Show " + side + " sidebar" : "Hide " + side + " sidebar")
    button.setAttribute("title", collapsed ? "Show " + side + " sidebar" : "Hide " + side + " sidebar")
  }

  const syncAllSidebarToggles = () => {
    const root = document.getElementById("quartz-root")
    if (!root) return

    for (const side of sides) {
      const collapsed = root.classList.contains(side + "-sidebar-collapsed")
      document.querySelectorAll('.sidebar-toggle[data-sidebar="' + side + '"]').forEach((button) => {
        syncSidebarToggle(button, side, collapsed)
      })
    }
  }

  const handleToggleClick = (event) => {
    const button = event.target.closest(".sidebar-toggle")
    if (!button) return

    const root = document.getElementById("quartz-root")
    const side = button.dataset.sidebar || "left"
    const collapsedClass = side + "-sidebar-collapsed"
    const collapsed = !root?.classList.contains(collapsedClass)
    root?.classList.toggle(collapsedClass, collapsed)
    syncAllSidebarToggles()
  }

  document.addEventListener("click", handleToggleClick)
  document.addEventListener("DOMContentLoaded", syncAllSidebarToggles)
  document.addEventListener("nav", syncAllSidebarToggles)
  document.addEventListener("render", syncAllSidebarToggles)
  syncAllSidebarToggles()
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
    const tagText = Array.isArray(tags) ? tags.join("  ") : undefined
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

    return (
      <>
        <div class="left sidebar">
          {left.map((BodyComponent) => (
            <BodyComponent {...componentData} />
          ))}
          {/* <Footer {...componentData} /> */}
        </div>
        <div class="center">
          <div class="page-header" data-tags={tagText}>
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
            <div class="popover-hint">
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
            <div class="page-header-actions">
              <button
                type="button"
                class="sidebar-toggle left-sidebar-toggle"
                data-sidebar="left"
                aria-label="Hide left sidebar"
                aria-pressed="false"
                title="Hide left sidebar"
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
                aria-label="Hide right sidebar"
                aria-pressed="false"
                title="Hide right sidebar"
              >
                <SidebarToggleIcon />
              </button>
            </div>
          </div>
          <Content {...componentData} />
          {isIndex && (
            <section class="home-recent-notes">
              <h2>Recent Notes</h2>
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
        <script dangerouslySetInnerHTML={{ __html: sidebarToggleScript }} />
      </>
    )
  },
}
