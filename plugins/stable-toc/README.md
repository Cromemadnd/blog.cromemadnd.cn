# Stable Table of Contents

Local adaptation of quartz-community/table-of-contents at `4c25c048a7f788cb156dad0050d80c7ed88692f9` (MIT).
Keeps its transformer, layouts, styles and heading navigation.

- Uses Preact `useId()` so identical pages have identical output across builds.
- Preserves the supplied list ID so `aria-controls` references the correct element.
- The overflow observer discovers lists by class, without process-global counters.
- Uses the host Quartz locale translations (en-US and zh-CN).

Build with `node plugins/build.mjs stable-toc`; generated dist is committed.
