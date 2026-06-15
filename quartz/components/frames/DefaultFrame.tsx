import { PageFrame, PageFrameProps } from "./types"
import HeaderConstructor from "../Header"
import { joinSegments, pathToRoot } from "../../util/path"

const Header = HeaderConstructor()

const sidebarToggleScript = `
(() => {
  const bindSidebarToggle = () => {
    document.querySelectorAll(".sidebar-toggle").forEach((button) => {
      if (button.dataset.bound === "true") return
      button.dataset.bound = "true"
      button.addEventListener("click", () => {
        const root = document.getElementById("quartz-root")
        const collapsed = !root?.classList.contains("left-sidebar-collapsed")
        root?.classList.toggle("left-sidebar-collapsed", collapsed)
        button.setAttribute("aria-pressed", collapsed ? "true" : "false")
      })
    })
  }

  document.addEventListener("DOMContentLoaded", bindSidebarToggle)
  document.addEventListener("nav", bindSidebarToggle)
  document.addEventListener("render", bindSidebarToggle)
  bindSidebarToggle()
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
    footer: Footer,
  }: PageFrameProps) {
    const tags = componentData.fileData.frontmatter?.tags
    const tagText = Array.isArray(tags) ? tags.join("  ") : undefined
    const baseDir =
      componentData.fileData.slug === "404" ? "/" : pathToRoot(componentData.fileData.slug!)
    const iconPath = joinSegments(baseDir, "static/favicon.jpg")
    const toolbar = beforeBody.filter((BodyComponent) => BodyComponent.displayName === "Flex")
    const headerContent = beforeBody.filter((BodyComponent) => BodyComponent.displayName !== "Flex")

    return (
      <>
        <div class="left sidebar">
          {left.map((BodyComponent) => (
            <BodyComponent {...componentData} />
          ))}
          <Footer {...componentData} />
        </div>
        <div class="center">
          <div class="page-header" data-tags={tagText}>
            <a class="site-brand" href={baseDir} aria-label={componentData.cfg.pageTitle}>
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
              {/* <button
                type="button"
                class="sidebar-toggle"
                aria-label="Toggle sidebar"
                aria-pressed="false"
                title="Toggle sidebar"
              >
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
                  <path d="m14 9 3 3-3 3" />
                </svg>
              </button> */}
            </div>
          </div>
          <Content {...componentData} />
          <hr />
          <div class="page-footer">
            {afterBody.map((BodyComponent) => (
              <BodyComponent {...componentData} />
            ))}
          </div>
        </div>
        <div class="right sidebar">
          <div class="sidebar-toolbar">
            {toolbar.map((BodyComponent) => (
              <BodyComponent {...componentData} />
            ))}
          </div>
          {right.map((BodyComponent) => (
            <BodyComponent {...componentData} />
          ))}
        </div>
        <script dangerouslySetInnerHTML={{ __html: sidebarToggleScript }} />
      </>
    )
  },
}
