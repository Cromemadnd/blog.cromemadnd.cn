import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"

const Header: QuartzComponent = ({ children }: QuartzComponentProps) => {
  return children.length > 0 ? <header>{children}</header> : null
}

// Layout for <header> lives in custom.scss (.page-header>header); the slot is
// empty in the current layout, so the component only renders null there.
export default (() => Header) satisfies QuartzComponentConstructor
