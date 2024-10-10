let ctxs = [];
let dragStartY = null;
const canvasHolder = document.getElementById("canvas_holder");
const cursorLeft = document.getElementById("cursor_left");
const cursorRight = document.getElementById("cursor_right");
const cursorFill = document.getElementById("cursor_fill");
cursorFill.style.backgroundColor = "green";
let dragIdx = null;
let isAdding = true;
let pageHeight = null;
const guidelines = [];
const history = [];

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

const loadPdf = (pdfData) => {
  pdfjsLib.getDocument({ data: pdfData }).promise.then((pdf) => {
    // Create the PDF canvases
    for (let i = 1; i <= pdf.numPages; i++) {
      const canvas = document.createElement("canvas");
      canvasHolder.appendChild(canvas);
      const ctx = canvas.getContext("2d");
      ctxs.push(ctx);

      // Render the pages to the ctx
      pdf.getPage(i).then((page) => {
        const viewport = page.getViewport({ scale: 1 });
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        page.render({ canvasContext: ctx, viewport });
        pageHeight = viewport.height;
      });

      // Event Handling
      canvas.addEventListener("mousedown", (e) => {
        dragStartY = e.clientY + window.scrollY;
        dragIdx = i - 1;
      });
      canvas.addEventListener("mouseup", (e) => {
        if (dragIdx !== i - 1) return;
        dragIdx = null;
        const dragEndY = e.clientY + window.scrollY;
        if (dragStartY !== null && dragEndY !== dragStartY) {
          const yDiff = ctx.canvas.getBoundingClientRect().top + window.scrollY;
          const action = e.shiftKey ? removePdfData : insertWhitespace;
          action(
            ctx,
            (e.shiftKey ? Math.min(dragStartY, dragEndY) : dragStartY) - yDiff,
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

// User Actions
const insertWhitespace = (ctx, startY, delta, saveHistory) => {
  console.log("inserting whitespace: ", startY, delta);

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
  console.log("removing data: ", startY, delta);
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
// Used to undo the removePdfData action
const addPdfData = (ctx, startY, imageData) => {
  console.log("adding data: ", startY, imageData.height);
  const canvas = ctx.canvas;
  const startImg = ctx.getImageData(0, 0, canvas.width, startY);
  const endImg = ctx.getImageData(0, startY, canvas.width, canvas.height);

  canvas.height += imageData.height;
  ctx.putImageData(startImg, 0, 0);
  ctx.putImageData(imageData, 0, startY);
  ctx.putImageData(endImg, 0, startY + imageData.height);
};

// Mouse Visuals
document.addEventListener("mousemove", (e) => {
  cursorLeft.style.left = -window.innerWidth + e.clientX - 2 + "px";
  cursorRight.style.left = e.clientX + 2 + "px";
  cursorLeft.style.top = e.clientY + window.scrollY + "px";
  cursorRight.style.top = e.clientY + window.scrollY + "px";
  cursorFill.style.top = Math.min(e.clientY + window.scrollY + 2, dragStartY - 2) + "px";
  if (dragStartY !== null) cursorFill.style.height = Math.abs(dragStartY - (e.clientY + window.scrollY)) + "px";
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Shift") {
    isAdding = false;
    cursorFill.style.backgroundColor = "red";
  }
  if (e.key === "z" && (e.ctrlKey || e.metaKey)) {
    console.log("undo");
    undo();
  }
});
document.addEventListener("keyup", (e) => {
  if (e.key === "Shift") {
    isAdding = true;
    cursorFill.style.backgroundColor = "green";
  }
});

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
updatePageGuidelines();
const undo = () => {
  if (history.length === 0) return;
  const { undoAction } = history.pop();
  undoAction();
  updatePageGuidelines();
};
