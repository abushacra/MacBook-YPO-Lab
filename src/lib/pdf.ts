/**
 * A minimal PDF writer: one receipt per page, each image scaled to fit under a
 * caption naming it.
 *
 * Written here rather than pulled in for the same reason as the ZIP and XLSX
 * writers beside it — the whole surface used is "put these photos on pages".
 *
 * A JPEG goes in untouched. PDF can carry JPEG-compressed data natively through
 * the DCTDecode filter, so the bytes are copied straight across: no decoding,
 * no re-encoding, and no loss of what the camera captured. Anything that is not
 * a JPEG cannot be embedded without a decoder this file deliberately does not
 * have, so it gets a page saying so and its original file stays in the ZIP.
 */

/** US Letter in points, which is what an accountant prints on. */
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 36;
const CAPTION_HEIGHT = 54;

export type PdfPage = {
  /** Lines of text above the image. The first is drawn bold and larger. */
  caption: string[];
  /** The image bytes, or null for a receipt with nothing attached. */
  image: Uint8Array | null;
  /** Shown in place of an image: why there is nothing to show. */
  note?: string;
};

type Jpeg = { bytes: Uint8Array; width: number; height: number; components: number };

/**
 * Reads a JPEG's pixel dimensions out of its frame header.
 *
 * Walking the markers is the only way to know the size, and the size is what
 * decides the scale on the page. Returns null for anything that is not a JPEG
 * this writer can place, which is how non-JPEG files are diverted to a note.
 */
export function readJpeg(bytes: Uint8Array): Jpeg | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) {
      i += 1;
      continue;
    }

    const marker = bytes[i + 1]!;
    // Padding and the standalone markers carry no length to skip over.
    if (marker === 0xff || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      i += 2;
      continue;
    }

    const length = (bytes[i + 2]! << 8) | bytes[i + 3]!;
    if (length < 2) return null;

    /*
     * Any SOF but SOF4/SOF8/SOF12 (the non-image markers that share the range)
     * carries the frame size. Progressive JPEGs (SOF2) are included: Acrobat
     * and every modern reader handle them through DCTDecode.
     */
    const isFrame =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

    if (isFrame) {
      const height = (bytes[i + 5]! << 8) | bytes[i + 6]!;
      const width = (bytes[i + 7]! << 8) | bytes[i + 8]!;
      const components = bytes[i + 9]!;
      if (width === 0 || height === 0) return null;
      // 1 is greyscale, 3 is colour. CMYK JPEGs need an inverted Decode array
      // and are rare enough from a phone that a note is better than a guess.
      if (components !== 1 && components !== 3) return null;
      return { bytes, width, height, components };
    }

    i += 2 + length;
  }

  return null;
}

/** Escapes a string for a PDF literal, and drops what WinAnsi cannot show. */
function pdfText(value: string): string {
  return value
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/·/g, "-")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

/**
 * Builds the PDF.
 *
 * Objects are written in order and their byte offsets recorded as they go,
 * which is what the cross-reference table at the end is: a map from object
 * number to where it starts. Getting those offsets wrong is the one way to
 * produce a file no reader will open, so they are measured from the bytes
 * actually emitted rather than computed in advance.
 */
export function buildPdf(pages: PdfPage[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;

  const encoder = new TextEncoder();
  const push = (part: Uint8Array | string) => {
    const bytes = typeof part === "string" ? encoder.encode(part) : part;
    chunks.push(bytes);
    length += bytes.length;
  };

  // A PDF with no pages is not a valid PDF, so an empty run still gets a page
  // that says it is empty.
  const sheets: PdfPage[] =
    pages.length > 0
      ? pages
      : [{ caption: ["No receipts"], image: null, note: "No receipts in this range." }];

  /*
   * Object numbering, fixed up front so the page tree can reference children
   * that are written later: 1 catalog, 2 page tree, 3 and 4 the two fonts,
   * then three objects per page (page, contents, image). A page without an
   * image simply leaves its image number unused, which the cross-reference
   * table marks free.
   */
  const REGULAR_FONT = 3;
  const BOLD_FONT = 4;
  const FIRST_PAGE_OBJECT = 5;
  const perPage = 3;
  const pageObject = (i: number) => FIRST_PAGE_OBJECT + i * perPage;
  const contentObject = (i: number) => pageObject(i) + 1;
  const imageObject = (i: number) => pageObject(i) + 2;

  const object = (number: number, body: string | Uint8Array[]) => {
    offsets[number] = length;
    push(`${number} 0 obj\n`);
    if (typeof body === "string") push(body);
    else for (const part of body) push(part);
    push("\nendobj\n");
  };

  push("%PDF-1.4\n");
  // A binary comment tells anything sniffing the file that it is not text.
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  object(1, "<< /Type /Catalog /Pages 2 0 R >>");

  const kids = sheets.map((_, i) => `${pageObject(i)} 0 R`).join(" ");
  object(2, `<< /Type /Pages /Count ${sheets.length} /Kids [${kids}] >>`);
  object(
    REGULAR_FONT,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  );
  object(
    BOLD_FONT,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  );

  for (const [i, page] of sheets.entries()) {
    const jpeg = page.image ? readJpeg(page.image) : null;

    const top = PAGE_HEIGHT - MARGIN;
    const stream: string[] = ["BT /F1 14 Tf 1 0 0 1 " + MARGIN + " " + (top - 14) + " Tm"];

    // The first caption line is the heading; the rest sit under it, smaller.
    for (const [lineIndex, line] of page.caption.entries()) {
      if (lineIndex === 0) stream.push(`(${pdfText(line)}) Tj`);
      else stream.push(`/F2 9.5 Tf 0 -14 Td (${pdfText(line)}) Tj`);
    }
    stream.push("ET");

    if (jpeg) {
      /*
       * Fit inside the margins and below the caption, keeping the aspect
       * ratio, and never enlarge a small photo past its own pixels — blowing a
       * thumbnail up to fill a page only makes the blur bigger.
       */
      const boxWidth = PAGE_WIDTH - MARGIN * 2;
      const boxHeight = PAGE_HEIGHT - MARGIN * 2 - CAPTION_HEIGHT;
      const scale = Math.min(boxWidth / jpeg.width, boxHeight / jpeg.height, 1);
      const width = jpeg.width * scale;
      const height = jpeg.height * scale;
      const x = MARGIN + (boxWidth - width) / 2;
      const y = MARGIN + (boxHeight - height) / 2;

      stream.push(`q ${width.toFixed(2)} 0 0 ${height.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im0 Do Q`);
    } else {
      const note = page.note ?? "No receipt file attached.";
      stream.push(
        `BT /F2 11 Tf 1 0 0 1 ${MARGIN} ${PAGE_HEIGHT / 2} Tm (${pdfText(note)}) Tj ET`,
      );
    }

    const content = stream.join("\n");
    const fonts = `/Font << /F1 ${REGULAR_FONT} 0 R /F2 ${BOLD_FONT} 0 R >>`;
    const resources = jpeg
      ? `<< ${fonts} /XObject << /Im0 ${imageObject(i)} 0 R >> >>`
      : `<< ${fonts} >>`;

    object(
      pageObject(i),
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
        `/Resources ${resources} /Contents ${contentObject(i)} 0 R >>`,
    );

    object(contentObject(i), `<< /Length ${encoder.encode(content).length} >>\nstream\n${content}\nendstream`);

    if (jpeg) {
      object(imageObject(i), [
        encoder.encode(
          `<< /Type /XObject /Subtype /Image /Width ${jpeg.width} /Height ${jpeg.height} ` +
            `/ColorSpace ${jpeg.components === 1 ? "/DeviceGray" : "/DeviceRGB"} /BitsPerComponent 8 ` +
            `/Filter /DCTDecode /Length ${jpeg.bytes.length} >>\nstream\n`,
        ),
        jpeg.bytes,
        encoder.encode("\nendstream"),
      ]);
    }
  }

  const maxObject = Math.max(...offsets.map((_, i) => i).filter((i) => offsets[i] !== undefined));
  const xrefOffset = length;

  let xref = `xref\n0 ${maxObject + 1}\n0000000000 65535 f \n`;
  for (let n = 1; n <= maxObject; n += 1) {
    const at = offsets[n];
    xref +=
      at === undefined
        ? "0000000000 65535 f \n"
        : `${at.toString().padStart(10, "0")} 00000 n \n`;
  }
  push(xref);
  push(`trailer\n<< /Size ${maxObject + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}
