"use client";

import { useLayoutEffect } from "react";

export const themeInitScript = `(function(){try{var s=localStorage.getItem("viatik-theme");var r=document.documentElement;if(s==="dark"||s==="light"){r.setAttribute("data-theme",s);}else{r.removeAttribute("data-theme");}var l=localStorage.getItem("viatik-language");if(l==="en"||l==="es"){r.lang=l;}var b=localStorage.getItem("viatik-sidebar");if(b==="collapsed"){r.setAttribute("data-sidebar","collapsed");}else{r.removeAttribute("data-sidebar");}}catch(e){}})();`;

function applyStoredPreferences() {
  try {
    const root = document.documentElement;
    const theme = localStorage.getItem("viatik-theme");
    if (theme === "dark" || theme === "light") root.setAttribute("data-theme", theme);
    else root.removeAttribute("data-theme");
    const language = localStorage.getItem("viatik-language");
    if (language === "en" || language === "es") root.lang = language;
    const sidebar = localStorage.getItem("viatik-sidebar");
    if (sidebar === "collapsed") root.setAttribute("data-sidebar", "collapsed");
    else root.removeAttribute("data-sidebar");
  } catch {
    // Storage or the document may be unavailable.
  }
}

/** Blocking theme/language init. The script is only in the server HTML, because React 19 does not execute scripts created during client render. Hydration can drop the attribute, so it is applied again before paint. */
export function ThemeInitScript() {
  useLayoutEffect(() => {
    applyStoredPreferences();
  }, []);

  if (typeof window !== "undefined") return null;
  return (
    <script
      id="theme-init"
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: themeInitScript }}
    />
  );
}
