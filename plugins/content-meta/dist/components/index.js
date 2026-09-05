import { createRequire as __createRequire } from "node:module";
const require = __createRequire(import.meta.url);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) => function __require2() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// plugins/content-meta/node_modules/reading-time/lib/reading-time.js
var require_reading_time = __commonJS({
  "plugins/content-meta/node_modules/reading-time/lib/reading-time.js"(exports, module) {
    "use strict";
    function codeIsInRanges(number, arrayOfRanges) {
      return arrayOfRanges.some(
        ([lowerBound, upperBound]) => lowerBound <= number && number <= upperBound
      );
    }
    function isCJK(c) {
      if ("string" !== typeof c) {
        return false;
      }
      const charCode = c.charCodeAt(0);
      return codeIsInRanges(
        charCode,
        [
          // Hiragana (Katakana not included on purpose,
          // context: https://github.com/ngryman/reading-time/pull/35#issuecomment-853364526)
          // If you think Katakana should be included and have solid reasons, improvement is welcomed
          [12352, 12447],
          // CJK Unified ideographs
          [19968, 40959],
          // Hangul
          [44032, 55203],
          // CJK extensions
          [131072, 191456]
        ]
      );
    }
    function isAnsiWordBound(c) {
      return " \n\r	".includes(c);
    }
    function isPunctuation(c) {
      if ("string" !== typeof c) {
        return false;
      }
      const charCode = c.charCodeAt(0);
      return codeIsInRanges(
        charCode,
        [
          [33, 47],
          [58, 64],
          [91, 96],
          [123, 126],
          // CJK Symbols and Punctuation
          [12288, 12351],
          // Full-width ASCII punctuation variants
          [65280, 65519]
        ]
      );
    }
    function readingTime2(text, options = {}) {
      let words = 0, start = 0, end = text.length - 1;
      const wordsPerMinute = options.wordsPerMinute || 200;
      const isWordBound = options.wordBound || isAnsiWordBound;
      while (isWordBound(text[start])) start++;
      while (isWordBound(text[end])) end--;
      const normalizedText = `${text}
`;
      for (let i = start; i <= end; i++) {
        if (isCJK(normalizedText[i]) || !isWordBound(normalizedText[i]) && (isWordBound(normalizedText[i + 1]) || isCJK(normalizedText[i + 1]))) {
          words++;
        }
        if (isCJK(normalizedText[i])) {
          while (i <= end && (isPunctuation(normalizedText[i + 1]) || isWordBound(normalizedText[i + 1]))) {
            i++;
          }
        }
      }
      const minutes = words / wordsPerMinute;
      const time = Math.round(minutes * 60 * 1e3);
      const displayed = Math.ceil(minutes.toFixed(2));
      return {
        text: displayed + " min read",
        minutes,
        time,
        words
      };
    }
    module.exports = readingTime2;
  }
});

// plugins/content-meta/node_modules/reading-time/lib/stream.js
var require_stream = __commonJS({
  "plugins/content-meta/node_modules/reading-time/lib/stream.js"(exports, module) {
    "use strict";
    var readingTime2 = require_reading_time();
    var Transform = __require("stream").Transform;
    var util = __require("util");
    function ReadingTimeStream(options) {
      if (!(this instanceof ReadingTimeStream)) {
        return new ReadingTimeStream(options);
      }
      Transform.call(this, { objectMode: true });
      this.options = options || {};
      this.stats = {
        minutes: 0,
        time: 0,
        words: 0
      };
    }
    util.inherits(ReadingTimeStream, Transform);
    ReadingTimeStream.prototype._transform = function(chunk, encoding, callback) {
      const stats = readingTime2(chunk.toString(encoding), this.options);
      this.stats.minutes += stats.minutes;
      this.stats.time += stats.time;
      this.stats.words += stats.words;
      callback();
    };
    ReadingTimeStream.prototype._flush = function(callback) {
      this.stats.text = Math.ceil(this.stats.minutes.toFixed(2)) + " min read";
      this.push(this.stats);
      callback();
    };
    module.exports = ReadingTimeStream;
  }
});

// plugins/content-meta/node_modules/reading-time/index.js
var require_reading_time2 = __commonJS({
  "plugins/content-meta/node_modules/reading-time/index.js"(exports, module) {
    module.exports.default = module.exports = require_reading_time();
    module.exports.readingTimeStream = require_stream();
  }
});

// plugins/content-meta/src/components/ContentMeta.tsx
var import_reading_time = __toESM(require_reading_time2(), 1);

// node_modules/@quartz-community/utils/dist/lang.js
function classNames(...classes) {
  return classes.filter(Boolean).join(" ");
}

// node_modules/@quartz-community/utils/dist/date.js
function formatDate(d, locale = "en-US") {
  return d.toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "2-digit"
  });
}

// node_modules/@quartz-community/utils/dist/sort.js
function getDate(data) {
  const defaultDateType = data.defaultDateType;
  if (!defaultDateType) {
    return void 0;
  }
  const dates = data.dates;
  return dates?.[defaultDateType];
}

// plugins/content-meta/src/util/date.tsx
import { jsx } from "preact/jsx-runtime";
function DateComponent({ date, locale }) {
  return /* @__PURE__ */ jsx("time", { datetime: date.toISOString(), children: formatDate(date, locale) });
}

// plugins/content-meta/src/i18n/locales/en-US.ts
var en_US_default = {
  components: {
    contentMeta: {
      readingTime: ({ minutes }) => {
        if (minutes === 1) {
          return "1 min read";
        }
        return `${minutes} min read`;
      }
    }
  }
};

// plugins/content-meta/src/i18n/locales/ar-SA.ts
var ar_SA_default = {
  components: {
    contentMeta: {
      readingTime: ({ minutes }) => minutes == 1 ? `\u062F\u0642\u064A\u0642\u0629 \u0623\u0648 \u0623\u0642\u0644 \u0644\u0644\u0642\u0631\u0627\u0621\u0629` : minutes == 2 ? `\u062F\u0642\u064A\u0642\u062A\u0627\u0646 \u0644\u0644\u0642\u0631\u0627\u0621\u0629` : `${minutes} \u062F\u0642\u0627\u0626\u0642 \u0644\u0644\u0642\u0631\u0627\u0621\u0629`
    }
  }
};

// plugins/content-meta/src/i18n/locales/ca-ES.ts
var ca_ES_default = {
  components: {
    contentMeta: {
      readingTime: ({ minutes }) => `Es llegeix en ${minutes} min`
    }
  }
};

// plugins/content-meta/src/i18n/locales/cs-CZ.ts
var cs_CZ_default = {
  components: {
    contentMeta: {
      readingTime: ({ minutes }) => `${minutes} min \u010Dten\xED`
    }
  }
};

// plugins/content-meta/src/i18n/locales/de-DE.ts
var de_DE_default = {
  components: {
    contentMeta: {
      readingTime: ({ minutes }) => `${minutes} Min. Lesezeit`
    }
  }
};

// plugins/content-meta/src/i18n/locales/en-GB.ts
var en_GB_default = {
  components: {
    contentMeta: {
      readingTime: ({ minutes }) => `${minutes} min read`
    }
  }
};

// plugins/content-meta/src/i18n/locales/es-ES.ts
var es_ES_default = {
  components: {
    contentMeta: {
      readingTime: ({ minutes }) => `Se lee en ${minutes} min`
    }
  }
};

// plugins/content-meta/src/i18n/locales/fa-IR.ts
var fa_IR_default = {
  components: {
    contentMeta: {
      readingTime: ({ minutes }) => `\u0632\u0645\u0627\u0646 \u062A\u0642\u0631\u06CC\u0628\u06CC \u0645\u0637\u0627\u0644\u0639\u0647: ${minutes} \u062F\u0642\u06CC\u0642\u0647`
    }
  }
};

// plugins/content-meta/src/i18n/locales/fi-FI.ts
var fi_FI_default = {
  components: {
    contentMeta: {
      readingTime: ({ minutes }) => `${minutes} min lukuaika`
    }
  }
};

// plugins/content-meta/src/i18n/locales/fr-FR.ts
var fr_FR_default = {
  components: {
    contentMeta: {
      readingTime: ({ minutes }) => `${minutes} min de lecture`
    }
  }
};

// plugins/content-meta/src/i18n/locales/he-IL.ts
var he_IL_default = {
  components: {
    contentMeta: {
      readingTime: ({ minutes }) => `${minutes} \u05D3\u05E7\u05D5\u05EA \u05E7\u05E8\u05D9\u05D0\u05D4`
    }
  }
};

// plugins/content-meta/src/i18n/locales/hu-HU.ts
var hu_HU_default = {
  components: {
    contentMeta: {
      readingTime: ({ minutes }) => `${minutes} perces olvas\xE1s`
    }
  }
};

// plugins/content-meta/src/i18n/locales/id-ID.ts
var id_ID_default = {
  components: {
    contentMeta: {
      readingTime: ({ minutes }) => `${minutes} menit baca`
    }
  }
};

// plugins/content-meta/src/i18n/locales/it-IT.ts
var it_IT_default = {
  components: {
    contentMeta: {
      readingTime: ({ minutes }) => minutes === 1 ? "1 minuto" : `${minutes} minuti`
    }
  }
};

// plugins/content-meta/src/i18n/locales/ja-JP.ts
var ja_JP_default = {
  components: {
    contentMeta: {
      readingTime: ({ minutes }) => `${minutes} min read`
    }
  }
};

// plugins/content-meta/src/i18n/locales/kk-KZ.ts
var kk_KZ_default = {
  components: {
    contentMeta: {
      readingTime: ({ minutes }) => `${minutes} \u043C\u0438\u043D \u043E\u049B\u0443`
    }
  }
};

// plugins/content-meta/src/i18n/locales/ko-KR.ts
var ko_KR_default = {
  components: {
    contentMeta: {
      readingTime: ({ minutes }) => `${minutes} min read`
    }
  }
};

// plugins/content-meta/src/i18n/locales/lt-LT.ts
var lt_LT_default = {
  components: {
    contentMeta: {
      readingTime: ({ minutes }) => `${minutes} min skaitymo`
    }
  }
};

// plugins/content-meta/src/i18n/locales/nb-NO.ts
var nb_NO_default = {
  components: {
    contentMeta: {
      readingTime: ({ minutes }) => `${minutes} min lesning`
    }
  }
};

// plugins/content-meta/src/i18n/locales/nl-NL.ts
var nl_NL_default = {
  components: {
    contentMeta: {
      readingTime: ({ minutes }) => minutes === 1 ? "1 minuut leestijd" : `${minutes} minuten leestijd`
    }
  }
};

// plugins/content-meta/src/i18n/locales/pl-PL.ts
var pl_PL_default = {
  components: {
    contentMeta: {
      readingTime: ({ minutes }) => `${minutes} min. czytania `
    }
  }
};

// plugins/content-meta/src/i18n/locales/pt-BR.ts
var pt_BR_default = {
  components: {
    contentMeta: {
      readingTime: ({ minutes }) => `Leitura de ${minutes} min`
    }
  }
};

// plugins/content-meta/src/i18n/locales/ro-RO.ts
var ro_RO_default = {
  components: {
    contentMeta: {
      readingTime: ({ minutes }) => minutes == 1 ? `lectur\u0103 de 1 minut` : `lectur\u0103 de ${minutes} minute`
    }
  }
};

// plugins/content-meta/src/i18n/locales/ru-RU.ts
var ru_RU_default = {
  components: {
    contentMeta: {
      readingTime: ({ minutes }) => `\u0432\u0440\u0435\u043C\u044F \u0447\u0442\u0435\u043D\u0438\u044F ~${minutes} \u043C\u0438\u043D.`
    }
  }
};

// plugins/content-meta/src/i18n/locales/th-TH.ts
var th_TH_default = {
  components: {
    contentMeta: {
      readingTime: ({ minutes }) => `\u0E2D\u0E48\u0E32\u0E19\u0E23\u0E32\u0E27 ${minutes} \u0E19\u0E32\u0E17\u0E35`
    }
  }
};

// plugins/content-meta/src/i18n/locales/tr-TR.ts
var tr_TR_default = {
  components: {
    contentMeta: {
      readingTime: ({ minutes }) => `${minutes} dakika okuma s\xFCresi`
    }
  }
};

// plugins/content-meta/src/i18n/locales/uk-UA.ts
var uk_UA_default = {
  components: {
    contentMeta: {
      readingTime: ({ minutes }) => `${minutes} \u0445\u0432 \u0447\u0438\u0442\u0430\u043D\u043D\u044F`
    }
  }
};

// plugins/content-meta/src/i18n/locales/vi-VN.ts
var vi_VN_default = {
  components: {
    contentMeta: {
      readingTime: ({ minutes }) => `${minutes} ph\xFAt \u0111\u1ECDc`
    }
  }
};

// plugins/content-meta/src/i18n/locales/zh-CN.ts
var zh_CN_default = {
  components: {
    contentMeta: {
      readingTime: ({ minutes }) => `${minutes}\u5206\u949F\u9605\u8BFB`
    }
  }
};

// plugins/content-meta/src/i18n/locales/zh-TW.ts
var zh_TW_default = {
  components: {
    contentMeta: {
      readingTime: ({ minutes }) => `\u95B1\u8B80\u6642\u9593\u7D04 ${minutes} \u5206\u9418`
    }
  }
};

// plugins/content-meta/src/i18n/index.ts
var locales = {
  "en-US": en_US_default,
  "ar-SA": ar_SA_default,
  "ca-ES": ca_ES_default,
  "cs-CZ": cs_CZ_default,
  "de-DE": de_DE_default,
  "en-GB": en_GB_default,
  "es-ES": es_ES_default,
  "fa-IR": fa_IR_default,
  "fi-FI": fi_FI_default,
  "fr-FR": fr_FR_default,
  "he-IL": he_IL_default,
  "hu-HU": hu_HU_default,
  "id-ID": id_ID_default,
  "it-IT": it_IT_default,
  "ja-JP": ja_JP_default,
  "kk-KZ": kk_KZ_default,
  "ko-KR": ko_KR_default,
  "lt-LT": lt_LT_default,
  "nb-NO": nb_NO_default,
  "nl-NL": nl_NL_default,
  "pl-PL": pl_PL_default,
  "pt-BR": pt_BR_default,
  "ro-RO": ro_RO_default,
  "ru-RU": ru_RU_default,
  "th-TH": th_TH_default,
  "tr-TR": tr_TR_default,
  "uk-UA": uk_UA_default,
  "vi-VN": vi_VN_default,
  "zh-CN": zh_CN_default,
  "zh-TW": zh_TW_default
};
function i18n(locale) {
  return locales[locale] || en_US_default;
}

// plugins/content-meta/src/components/styles/contentMeta.scss
var contentMeta_default = '.content-meta {\n  margin-top: 0;\n  color: var(--darkgray);\n\n  &[show-comma="true"] {\n    > *:not(:last-child) {\n      margin-right: 8px;\n\n      &::after {\n        content: ",";\n      }\n    }\n  }\n}\n';

// plugins/content-meta/src/components/ContentMeta.tsx
import { jsx as jsx2 } from "preact/jsx-runtime";
var defaultOptions = {
  showDate: true,
  showReadingTime: true,
  showComma: true
};
var ContentMeta_default = ((opts) => {
  const options = { ...defaultOptions, ...opts };
  function ContentMetadata({ cfg, fileData, displayClass }) {
    const text = fileData.text;
    if (text) {
      const segments = [];
      if (options.showDate && fileData.dates) {
        const locale = cfg.locale || "en-US";
        const defaultDateType = fileData.defaultDateType ?? cfg.defaultDateType;
        if (defaultDateType) {
          const dataWithDefaultDateType = {
            ...fileData,
            defaultDateType
          };
          const date = getDate(dataWithDefaultDateType);
          if (date) {
            segments.push(/* @__PURE__ */ jsx2(DateComponent, { date, locale }));
          }
        }
      }
      if (options.showReadingTime) {
        const { minutes, words: _words } = (0, import_reading_time.default)(text);
        const locale = cfg.locale || "en-US";
        const displayedTime = i18n(locale).components.contentMeta.readingTime({
          minutes: Math.ceil(minutes)
        });
        segments.push(/* @__PURE__ */ jsx2("span", { children: displayedTime }));
      }
      return /* @__PURE__ */ jsx2("p", { "show-comma": options.showComma, class: classNames(displayClass, "content-meta"), children: segments });
    } else {
      return null;
    }
  }
  ContentMetadata.css = contentMeta_default;
  ContentMetadata.displayName = "ContentMetadata";
  return ContentMetadata;
});
export {
  ContentMeta_default as ContentMeta
};
/*! Bundled license information:

reading-time/lib/reading-time.js:
reading-time/lib/stream.js:
  (*!
   * reading-time
   * Copyright (c) Nicolas Gryman <ngryman@gmail.com>
   * MIT Licensed
   *)
*/
//# sourceMappingURL=index.js.map
