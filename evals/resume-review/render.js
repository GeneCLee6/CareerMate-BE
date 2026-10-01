const fs = require("fs");
const PDFDocument = require("pdfkit");

/** A line in capitals and nothing else reads as a section heading. */
const isHeading = (line) => /^[A-Z][A-Z &/]{2,}$/.test(line.trim());

/**
 * Renders plain-text resume into a simple, readable A4 PDF: the first line
 * as the name, capitalised lines as section headings, "- " lines as
 * bullets. The PDF has a text layer, so the product's extractor can read it
 * back — which is what the text-versus-PDF comparison needs.
 */
function renderResumePdf(text, outFile) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: "A4", margin: 50, info: { Title: "Resume" } });
        const stream = fs.createWriteStream(outFile);
        stream.on("finish", resolve);
        stream.on("error", reject);
        doc.pipe(stream);

        const lines = text.replace(/\r\n/g, "\n").split("\n");
        lines.forEach((line, index) => {
            const trimmed = line.trim();
            if (index === 0) {
                doc.font("Helvetica-Bold").fontSize(18).text(trimmed);
                doc.moveDown(0.2);
            } else if (trimmed === "") {
                doc.moveDown(0.4);
            } else if (isHeading(trimmed)) {
                doc.moveDown(0.3).font("Helvetica-Bold").fontSize(11).text(trimmed);
                doc.moveDown(0.15);
            } else if (trimmed.startsWith("- ")) {
                doc.font("Helvetica").fontSize(10).text(`• ${trimmed.slice(2)}`, { indent: 10 });
            } else {
                doc.font("Helvetica").fontSize(10).text(trimmed);
            }
        });
        doc.end();
    });
}

module.exports = { renderResumePdf };
