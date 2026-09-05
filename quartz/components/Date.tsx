import { ValidLocale } from "../i18n"
import { QuartzPluginData } from "../plugins/vfile"

interface Props {
  date: Date
  locale?: ValidLocale
}

export type ValidDateType = keyof Required<QuartzPluginData>["dates"]

export function getDate(data: QuartzPluginData): Date | undefined {
  if (!data.defaultDateType) {
    throw new Error(
      `Field 'defaultDateType' was not set. Ensure the CreatedModifiedDate plugin is configured with a 'defaultDateType' option. See https://quartz.jzhao.xyz/plugins/CreatedModifiedDate for more details.`,
    )
  }
  return data.dates?.[data.defaultDateType]
}

// ISO format everywhere: it matches the numeric date style in the page header
// and avoids mixing locale-specific month names into the terminal-styled UI.
export function formatDate(d: Date, _locale: ValidLocale = "en-US"): string {
  const pad = (n: number) => `${n}`.padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function Date({ date, locale }: Props) {
  return <time datetime={date.toISOString()}>{formatDate(date, locale)}</time>
}
