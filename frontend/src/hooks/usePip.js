import { useRef, useState, useCallback, useEffect } from "react";
import { createRoot } from "react-dom/client";

function copyStyles(sourceDoc, targetDoc) {
  [...sourceDoc.styleSheets].forEach((sheet) => {
    try {
      const css = [...sheet.cssRules].map((r) => r.cssText).join("\n");
      const style = targetDoc.createElement("style");
      style.textContent = css;
      targetDoc.head.appendChild(style);
    } catch {
      // Cross-origin sheet — link par href
      if (sheet.href) {
        const link = targetDoc.createElement("link");
        link.rel = "stylesheet";
        link.href = sheet.href;
        targetDoc.head.appendChild(link);
      }
    }
  });
}

export function usePip() {
  const [isOpen, setIsOpen] = useState(false);
  const pipWinRef = useRef(null);
  const rootRef = useRef(null);

  const isSupported = "documentPictureInPicture" in window;

  const open = useCallback(
    async (jsx, { width = 430, height = 600 } = {}) => {
      if (!isSupported) return;

      // Ferme une fenêtre PiP déjà ouverte avant d'en ouvrir une nouvelle
      if (pipWinRef.current) {
        pipWinRef.current.close();
      }

      try {
        const pipWin = await window.documentPictureInPicture.requestWindow({
          width,
          height,
        });
        pipWinRef.current = pipWin;

        copyStyles(document, pipWin.document);
        pipWin.document.body.style.cssText = "margin:0;background:#f0f4f8;";

        const container = pipWin.document.createElement("div");
        pipWin.document.body.appendChild(container);

        // createRoot dans le document PiP : React gère ses propres événements
        // dans ce contexte, indépendamment du document principal.
        const root = createRoot(container);
        rootRef.current = root;
        root.render(jsx);

        setIsOpen(true);

        pipWin.addEventListener("pagehide", () => {
          rootRef.current?.unmount();
          rootRef.current = null;
          pipWinRef.current = null;
          setIsOpen(false);
        });
      } catch {
        // Refus utilisateur ou navigateur non compatible
      }
    },
    [isSupported]
  );

  const close = useCallback(() => {
    pipWinRef.current?.close();
  }, []);

  // Nettoyage si le composant parent est démonté
  useEffect(() => () => pipWinRef.current?.close(), []);

  return { isOpen, isSupported, open, close };
}
