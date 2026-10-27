import type { JSX } from "preact"

export default () => ({
  OverflowList: ({ children, ...props }: JSX.HTMLAttributes<HTMLUListElement>) => (
    <ul {...props} class={[props.class, "overflow"].filter(Boolean).join(" ")}>
      {children}
      <li class="overflow-end" />
    </ul>
  ),
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
`,
})
