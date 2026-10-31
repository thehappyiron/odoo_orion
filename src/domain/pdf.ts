import PDFDocument from "pdfkit";
import type { Invoice } from "@/lib/types";
const rupees = (n: number) => `INR ${(n / 100).toFixed(2)}`;
export async function invoicePdf(i: Invoice): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margin: 48,
    info: { Title: i.number, Author: "Brightloop" },
  });
  const chunks: Buffer[] = [];
  const complete = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  doc.fillColor("#182336").fontSize(25).text("brightloop");
  doc.fontSize(10).fillColor("#64748b").text("SUBSCRIPTION INVOICE", 48, 85);
  doc
    .fontSize(12)
    .fillColor("#182336")
    .text(i.number, 360, 54, { width: 185, align: "right" });
  doc.fontSize(10).text(i.status, 360, 75, { width: 185, align: "right" });
  doc.text(`Bill to: ${i.customer_snapshot.company}`, 48, 125);
  doc.text(i.customer_snapshot.email);
  if (i.customer_snapshot.address)
    doc.text(i.customer_snapshot.address, { width: 260 });
  doc.text(
    `Period: ${i.period_start} to ${i.period_end} (end exclusive)`,
    48,
    190,
  );
  doc.text(`Due: ${i.due_on}`);
  doc.moveDown();
  let y = 245;
  doc
    .font("Helvetica-Bold")
    .text("PRODUCT / VARIANT", 48, y, { width: 275 })
    .text("QTY", 325, y)
    .text("UNIT", 365, y)
    .text("TOTAL", 460, y, { width: 85, align: "right" });
  y += 27;
  doc.font("Helvetica");
  for (const l of i.lines) {
    if (y > 665) {
      doc.addPage();
      y = 60;
    }
    const label = l.name + (l.variant ? ` / ${l.variant}` : "");
    const height = Math.max(40, doc.heightOfString(label, { width: 265 }) + 18);
    doc
      .fontSize(10)
      .text(label, 48, y, { width: 265 })
      .text(String(l.quantity), 325, y)
      .text(rupees(l.unitAmount), 365, y, { width: 90 })
      .text(rupees(l.total), 460, y, { width: 85, align: "right" });
    y += height;
    doc
      .moveTo(48, y - 12)
      .lineTo(547, y - 12)
      .strokeColor("#e2e8f0")
      .stroke();
  }
  if (y > 575) {
    doc.addPage();
    y = 65;
  }
  for (const [label, value] of [
    ["Subtotal", i.subtotal],
    [`Discount${i.discount_code ? ` (${i.discount_code})` : ""}`, -i.discount],
    ["Tax", i.tax],
    ["Total", i.total],
    ["Received", i.paid],
    ["Balance", i.total - i.paid],
  ] as const) {
    doc
      .fontSize(11)
      .text(label, 300, y, { width: 140 })
      .text(rupees(value), 435, y, { width: 110, align: "right" });
    y += 24;
  }
  doc
    .fontSize(9)
    .fillColor("#64748b")
    .text(
      "Prices are tax-exclusive. Taxes are configured business rules. Payments shown are manually recorded receipts.",
      48,
      y + 25,
      { width: 495 },
    );
  if (i.fixture) doc.text("DEMO FIXTURE", 48, y + 65);
  doc.end();
  return complete;
}
