// LaTeX → SVG data URL, for equations on the whiteboard. MathJax is large, so
// it's only loaded the first time someone opens the equation tool; everyone
// else just draws the SVG image stored on the stroke.

type Converter = (latex: string) => string;

let converterPromise: Promise<Converter> | null = null;

function loadConverter(): Promise<Converter> {
  converterPromise ??= (async () => {
    const [{ mathjax }, { TeX }, { SVG }, { liteAdaptor }, { RegisterHTMLHandler }, { AllPackages }] =
      await Promise.all([
        import("mathjax-full/js/mathjax.js"),
        import("mathjax-full/js/input/tex.js"),
        import("mathjax-full/js/output/svg.js"),
        import("mathjax-full/js/adaptors/liteAdaptor.js"),
        import("mathjax-full/js/handlers/html.js"),
        import("mathjax-full/js/input/tex/AllPackages.js"),
      ]);
    const adaptor = liteAdaptor();
    RegisterHTMLHandler(adaptor);
    const doc = mathjax.document("", {
      InputJax: new TeX({
        packages: AllPackages.filter((p: string) => p !== "bussproofs"),
        // Surface syntax errors to the editor instead of rendering them in red.
        formatError: (_jax: unknown, err: Error) => {
          throw err;
        },
      }),
      // fontCache "none" inlines every glyph path, so the SVG is fully
      // self-contained once it's turned into an <img>.
      OutputJax: new SVG({ fontCache: "none" }),
    });
    return (latex: string) => adaptor.innerHTML(doc.convert(latex, { display: true }));
  })();
  converterPromise.catch(() => {
    converterPromise = null;
  });
  return converterPromise;
}

export function preloadMath() {
  void loadConverter().catch(() => undefined);
}

export interface RenderedMath {
  src: string;
  // Natural size in board pixels.
  width: number;
  height: number;
}

// MathJax measures in ex. Text strokes use a width*4 px font, and 1ex is
// about half the font size, so equations come out the same size as text
// written with the same pen width — the width picker sizes both.
const EX_PX_PER_WIDTH = 2;

export async function renderMath(latex: string, color: string, penWidth: number): Promise<RenderedMath> {
  const convert = await loadConverter();
  const markup = convert(latex);

  const doc = new DOMParser().parseFromString(markup, "image/svg+xml");
  const svg = doc.documentElement;
  if (svg.nodeName !== "svg") throw new Error("Could not render that equation");

  const exPx = EX_PX_PER_WIDTH * Math.max(3, penWidth);
  const toPx = (value: string | null) => {
    const n = parseFloat(value ?? "");
    return Number.isFinite(n) ? n * exPx : 0;
  };
  const width = Math.max(1, toPx(svg.getAttribute("width")));
  const height = Math.max(1, toPx(svg.getAttribute("height")));

  // An <img> has no surrounding text color or font size, so pin both.
  svg.setAttribute("width", `${width}px`);
  svg.setAttribute("height", `${height}px`);
  svg.removeAttribute("style");
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const serialized = new XMLSerializer().serializeToString(svg).replaceAll("currentColor", color);

  const bytes = new TextEncoder().encode(serialized);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return { src: `data:image/svg+xml;base64,${btoa(binary)}`, width, height };
}
