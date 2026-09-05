const GISCUS_ORIGIN = "https://giscus.app";
const GISCUS_CLIENT = `${GISCUS_ORIGIN}/client.js`;

const getThemeName = (theme: string, container: HTMLElement): string => {
  if (theme === "dark") return container.dataset.darkTheme ?? "dark";
  if (theme === "light") return container.dataset.lightTheme ?? "light";
  return theme;
};

const getThemeUrl = (container: HTMLElement, themeName: string): string => {
  const base = (container.dataset.themeUrl ?? `${GISCUS_ORIGIN}/themes`).replace(/\/+$/, "");
  return `${base}/${themeName}.css`;
};

let cleanup: (() => void)[] = [];

const setupComments = () => {
  for (const fn of cleanup) fn();
  cleanup = [];

  const container = document.querySelector<HTMLElement>("#comments");
  if (!container) return;

  // SPA navigation diffs the body with micromorph, recycling the #comments
  // container together with the previous page's giscus iframe — always start
  // from a clean slate so the discussion matches the current pathname.
  container.innerHTML = "";

  const theme = document.documentElement.getAttribute("saved-theme") ?? "dark";
  const themeUrl = getThemeUrl(container, getThemeName(theme, container));

  const script = document.createElement("script");
  script.src = GISCUS_CLIENT;
  script.async = true;
  script.crossOrigin = "anonymous";
  // relay the server-rendered config onto the giscus client (dataset keys are
  // camelCase and are serialized back to their data-* form)
  for (const [key, value] of Object.entries(container.dataset)) {
    if (value !== undefined) script.dataset[key] = value;
  }
  script.dataset.loading = "lazy";
  script.dataset.emitMetadata = "0";
  script.dataset.theme = themeUrl;
  container.appendChild(script);

  const changeTheme = (e: CustomEvent<{ theme: "light" | "dark" }>) => {
    const iframe = document.querySelector<HTMLIFrameElement>("iframe.giscus-frame");
    if (!iframe || !e.detail?.theme) return;
    const url = getThemeUrl(container, getThemeName(e.detail.theme, container));
    iframe.contentWindow?.postMessage({ giscus: { setConfig: { theme: url } } }, GISCUS_ORIGIN);
  };
  document.addEventListener("themechange", changeTheme);
  cleanup.push(() => document.removeEventListener("themechange", changeTheme));
};

document.addEventListener("nav", setupComments);
