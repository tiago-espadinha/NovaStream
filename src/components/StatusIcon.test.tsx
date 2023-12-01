import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StatusIcon, type StatusTone } from "./StatusIcon";

const tones: StatusTone[] = ["success", "warning", "error"];

describe("StatusIcon", () => {
  it.each(tones)("hides the %s mark from screen readers", (tone) => {
    const html = renderToStaticMarkup(<StatusIcon tone={tone} />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toMatch(/<title|<text/);
  });

  it("draws a different shape for each tone", () => {
    const shapes = tones.map((tone) => renderToStaticMarkup(<StatusIcon tone={tone} />));
    expect(new Set(shapes).size).toBe(tones.length);
  });

  it("leaves the message as the only readable text", () => {
    const html = renderToStaticMarkup(
      <p>
        <StatusIcon tone="error" />
        Couldn't load your library.
      </p>,
    );
    expect(html.replace(/<svg[\s\S]*?<\/svg>/, "")).toBe("<p>Couldn&#x27;t load your library.</p>");
  });
});
