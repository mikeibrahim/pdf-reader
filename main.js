const canvasHolder = document.getElementById("canvas_holder");
const cursorLeft = document.getElementById("cursor_left");
const cursorRight = document.getElementById("cursor_right");
const cursorFill = document.getElementById("cursor_fill");
const guidelines = [];
const history = [];
const ctxs = [];

let dragStartY = null;
let dragIdx = null;
let isAdding = true;
let pageHeight = null;
let whitespaceCover = false;

document.getElementById("pdf-file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (file && file.type === "application/pdf") {
    const reader = new FileReader();
    reader.onload = function (event) {
      const pdfData = event.target.result;
      loadPdf(pdfData);
    };
    reader.readAsArrayBuffer(file);
  } else {
    alert("Please select a valid PDF file.");
  }
});
document.getElementById("export-button").addEventListener("click", () => {
  // Combine all ctx to a single canvas, then split up the canvas into pages based on pageHeight
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = ctxs[0].canvas.width;
  canvas.height = ctxs.reduce((acc, ctx) => acc + ctx.canvas.height, 0);
  let y = 0;
  ctxs.forEach((c) => {
    ctx.drawImage(c.canvas, 0, y);
    y += c.canvas.height;
  });

  const pdf = new jspdf.jsPDF("p", "pt", [canvas.width / 1.33, pageHeight / 1.33]);
  const numPages = Math.ceil(canvas.height / pageHeight);
  for (let i = 0; i < numPages; i++) {
    const pageCanvas = document.createElement("canvas");
    const pageCtx = pageCanvas.getContext("2d");
    pageCanvas.width = canvas.width;
    pageCanvas.height = pageHeight;
    const ctxImage = ctx.getImageData(0, i * pageHeight, canvas.width, pageHeight);
    pageCtx.putImageData(ctxImage, 0, 0);
    pdf.addImage(pageCanvas.toDataURL("image/png"), "PNG", 0, 0);
    if (i !== numPages - 1) pdf.addPage();
  }
  pdf.save("output.pdf");
});

const loadPdf = (pdfData) => {
  ctxs.forEach((ctx) => ctx.canvas.remove());
  ctxs.length = 0;
  pdfjsLib.getDocument({ data: pdfData }).promise.then((pdf) => {
    // Create the PDF canvases
    for (let i = 1; i <= pdf.numPages; i++) {
      const canvas = document.createElement("canvas");
      canvasHolder.appendChild(canvas);
      const ctx = canvas.getContext("2d");
      ctxs.push(ctx);

      // Render the pages to the ctx
      pdf.getPage(i).then((page) => {
        const viewport = page.getViewport({ scale: 1.5 });
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        page.render({ canvasContext: ctx, viewport });
        pageHeight = viewport.height;
      });

      // Event Handling
      canvas.addEventListener("mousedown", (e) => {
        dragStartY = e.clientY + window.scrollY;
        dragIdx = i - 1;
        whitespaceCover = e.button === 2;
        cursorFill.style.backgroundColor = whitespaceCover ? "orange" : "green";
      });
      canvas.addEventListener("mouseup", (e) => {
        if (dragIdx !== i - 1) {
          cursorFill.style.height = "0";
          dragStartY = null;
        }
        dragIdx = null;
        const dragEndY = e.clientY + window.scrollY;
        if (dragStartY !== null && dragEndY !== dragStartY) {
          const yDiff = ctx.canvas.getBoundingClientRect().top + window.scrollY;
          const action = e.shiftKey ? removePdfData : whitespaceCover ? coverPdfData : insertWhitespace;
          action(
            ctx,
            (e.shiftKey || whitespaceCover ? Math.min(dragStartY, dragEndY) : dragStartY) - yDiff,
            Math.abs(dragStartY - dragEndY),
            true
          );
          updatePageGuidelines();
        }
        dragStartY = null;
        cursorFill.style.height = "0";
      });
    }
  });
};

const insertWhitespace = (ctx, startY, delta, saveHistory) => {
  if (saveHistory) history.push({ undoAction: () => removePdfData(ctx, startY, delta, false) });

  const canvas = ctx.canvas;
  const startImg = ctx.getImageData(0, 0, canvas.width, startY);
  const endImg = ctx.getImageData(0, startY, canvas.width, canvas.height);

  canvas.height += delta;
  ctx.fillStyle = "white";
  ctx.putImageData(startImg, 0, 0);
  ctx.fillRect(0, startY, canvas.width, delta);
  ctx.putImageData(endImg, 0, startY + delta);
};

const removePdfData = (ctx, startY, delta, saveHistory) => {
  if (saveHistory) {
    const removedData = ctx.getImageData(0, startY, ctx.canvas.width, delta);
    history.push({ undoAction: () => addPdfData(ctx, startY, removedData, false) });
  }

  const canvas = ctx.canvas;
  const startImg = ctx.getImageData(0, 0, canvas.width, startY);
  const endImg = ctx.getImageData(0, startY + delta, canvas.width, canvas.height);

  canvas.height -= delta;
  ctx.putImageData(startImg, 0, 0);
  ctx.putImageData(endImg, 0, startY);
};

const coverPdfData = (ctx, startY, delta, saveHistory) => {
  if (saveHistory) {
    const coveredData = ctx.getImageData(0, startY, ctx.canvas.width, delta);
    history.push({
      undoAction: () => {
        removePdfData(ctx, startY, delta, false);
        addPdfData(ctx, startY, coveredData, false);
      },
    });
  }

  const canvas = ctx.canvas;
  const startImg = ctx.getImageData(0, 0, canvas.width, startY);
  const endImg = ctx.getImageData(0, startY + delta, canvas.width, canvas.height);

  ctx.fillStyle = "white";
  ctx.putImageData(startImg, 0, 0);
  ctx.fillRect(0, startY, canvas.width, delta);
  ctx.putImageData(endImg, 0, startY + delta);
};

const addPdfData = (ctx, startY, imageData) => {
  const canvas = ctx.canvas;
  const startImg = ctx.getImageData(0, 0, canvas.width, startY);
  const endImg = ctx.getImageData(0, startY, canvas.width, canvas.height);

  canvas.height += imageData.height;
  ctx.putImageData(startImg, 0, 0);
  ctx.putImageData(imageData, 0, startY);
  ctx.putImageData(endImg, 0, startY + imageData.height);
};

const updatePageGuidelines = () => {
  let totalHeight = 0;
  for (let i = 0; i < ctxs.length; i++) totalHeight += ctxs[i].canvas.height;
  let numGuidelines = Math.floor(totalHeight / pageHeight);
  guidelines.forEach((guideline) => guideline.remove());

  for (let i = 1; i <= numGuidelines; i++) {
    const guideline = document.createElement("div");
    guideline.className = "guideline";
    guideline.style.top = i * pageHeight + 100 + "px";
    document.body.appendChild(guideline);
    guidelines.push(guideline);
  }
};

const undo = () => {
  if (history.length === 0) return;
  const { undoAction } = history.pop();
  undoAction();
  updatePageGuidelines();
};
const updateCursor = (e) => {
  cursorLeft.style.left = -window.innerWidth + e.clientX - 2 + "px";
  cursorRight.style.left = e.clientX + 2 + "px";
  cursorLeft.style.top = e.clientY + window.scrollY + "px";
  cursorRight.style.top = e.clientY + window.scrollY + "px";
};

// Mouse Visuals
document.addEventListener("mousemove", (e) => {
  updateCursor(e);
  cursorFill.style.top = Math.min(e.clientY + window.scrollY + 1, dragStartY - 3) + 1 + "px";
  if (dragStartY !== null) cursorFill.style.height = Math.abs(dragStartY - (e.clientY + window.scrollY)) + "px";
});
document.addEventListener("scroll", (e) => {
  updateCursor({ clientX: 0, clientY: 0 });
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Shift") {
    isAdding = false;
    cursorFill.style.backgroundColor = "red";
  }
  if (e.key === "z" && (e.ctrlKey || e.metaKey)) {
    undo();
  }
});

document.addEventListener("keyup", (e) => {
  if (e.key === "Shift") {
    isAdding = true;
    cursorFill.style.backgroundColor = whitespaceCover ? "orange" : "green";
  }
});
document.addEventListener("contextmenu", (event) => event.preventDefault());

updatePageGuidelines();
