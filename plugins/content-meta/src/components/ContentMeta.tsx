import type {
  QuartzComponentConstructor,
  QuartzComponentProps,
  QuartzPluginData,
  ValidDateType,
} from "@quartz-community/types";
import readingTime from "reading-time";
import { classNames } from "../util/lang";
import { DateComponent, getDate } from "../util/date";
import { i18n } from "../i18n";
import type { JSX } from "preact";
import style from "./styles/contentMeta.scss";

export interface ContentMetaOptions {
  /**
   * Whether to display the page date (disable when the frame renders its own date)
   */
  showDate: boolean;
  /**
   * Whether to display reading time
   */
  showReadingTime: boolean;
  showComma: boolean;
}

const defaultOptions: ContentMetaOptions = {
  showDate: true,
  showReadingTime: true,
  showComma: true,
};

export default ((opts?: Partial<ContentMetaOptions>) => {
  // Merge options with defaults
  const options: ContentMetaOptions = { ...defaultOptions, ...opts };

  function ContentMetadata({ cfg, fileData, displayClass }: QuartzComponentProps) {
    const text = fileData.text;

    if (text) {
      const segments: (string | JSX.Element)[] = [];

      if (options.showDate && fileData.dates) {
        const locale = cfg.locale || "en-US";
        const defaultDateType =
          (fileData.defaultDateType as ValidDateType | undefined) ??
          (cfg.defaultDateType as ValidDateType | undefined);
        if (defaultDateType) {
          const dataWithDefaultDateType: QuartzPluginData = {
            ...(fileData as QuartzPluginData),
            defaultDateType,
          };
          const date = getDate(dataWithDefaultDateType);
          if (date) {
            segments.push(<DateComponent date={date} locale={locale} />);
          }
        }
      }

      // Display reading time if enabled
      if (options.showReadingTime) {
        const { minutes, words: _words } = readingTime(text as string);
        const locale = cfg.locale || "en-US";
        const displayedTime = i18n(locale).components.contentMeta.readingTime({
          minutes: Math.ceil(minutes),
        });
        segments.push(<span>{displayedTime}</span>);
      }

      return (
        <p show-comma={options.showComma} class={classNames(displayClass, "content-meta")}>
          {segments}
        </p>
      );
    } else {
      return null;
    }
  }

  ContentMetadata.css = style;
  ContentMetadata.displayName = "ContentMetadata";

  return ContentMetadata;
}) satisfies QuartzComponentConstructor;
