const loadHtmlToImage = (() => {
  let promise;
  return () => {
    if (!promise) {
      promise = import("https://esm.sh/html-to-image@1.11.13");
    }
    return promise;
  };
})();

const waitForCardAssets = async (root) => {
  const images = Array.from(root.querySelectorAll("img"));
  const waitForImage = async (img) => {
    if (!img.src) {
      return;
    }
    if (!img.complete) {
      await new Promise((resolve) => {
        const handleComplete = () => {
          img.removeEventListener("load", handleComplete);
          img.removeEventListener("error", handleComplete);
          resolve();
        };
        img.addEventListener("load", handleComplete);
        img.addEventListener("error", handleComplete);
      });
    }
    if (img.decode) {
      try {
        await img.decode();
      } catch {
        return;
      }
    }
  };
  await Promise.all(
    images.map((img) => {
      return waitForImage(img);
    })
  );
  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
  }
  await new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
};

const blobToDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject();
    reader.readAsDataURL(blob);
  });

const fetchDataUrl = async (url) => {
  try {
    const response = await fetch(url, {
      mode: "cors",
      credentials: "omit"
    });
    if (!response.ok) {
      return null;
    }
    const blob = await response.blob();
    return await blobToDataUrl(blob);
  } catch {
    return null;
  }
};

const replaceStyleUrl = async (value) => {
  const match = value.match(/url\\(["']?([^"')]+)["']?\\)/);
  if (!match) {
    return value;
  }
  const url = match[1];
  if (!url || url.startsWith("data:") || url.startsWith("blob:")) {
    return value;
  }
  const dataUrl = await fetchDataUrl(url);
  if (!dataUrl) {
    return value;
  }
  return value.replace(match[0], `url("${dataUrl}")`);
};

const inlineImagesForCapture = async (root) => {
  const images = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    images.map(async (img) => {
      const src = img.currentSrc || img.src;
      if (!src || src.startsWith("data:") || src.startsWith("blob:")) {
        return;
      }
      const dataUrl = await fetchDataUrl(src);
      if (!dataUrl) {
        return;
      }
      img.src = dataUrl;
      img.removeAttribute("srcset");
    })
  );
  const styledElements = Array.from(root.querySelectorAll("*"));
  await Promise.all(
    styledElements.map(async (element) => {
      const backgroundImage = element.style.backgroundImage;
      if (backgroundImage) {
        const next = await replaceStyleUrl(backgroundImage);
        if (next !== backgroundImage) {
          element.style.backgroundImage = next;
        }
      }
      const maskImage = element.style.maskImage;
      if (maskImage) {
        const next = await replaceStyleUrl(maskImage);
        if (next !== maskImage) {
          element.style.maskImage = next;
        }
      }
      const webkitMaskImage = element.style.getPropertyValue("-webkit-mask-image");
      if (webkitMaskImage) {
        const next = await replaceStyleUrl(webkitMaskImage);
        if (next !== webkitMaskImage) {
          element.style.setProperty("-webkit-mask-image", next);
        }
      }
    })
  );
};

const downloadShinyCardPng = async (card, options) => {
  const isValid = () => options.isStillValid() && card.isConnected;
  if (!isValid()) {
    return;
  }
  try {
    if (options.readyPromise) {
      await options.readyPromise;
    }
    if (!isValid()) {
      return;
    }
    await waitForCardAssets(card);
    if (!isValid()) {
      return;
    }
    const rect = card.getBoundingClientRect();
    const captureWrapper = document.createElement("div");
    captureWrapper.style.position = "fixed";
    captureWrapper.style.left = "-10000px";
    captureWrapper.style.top = "0";
    captureWrapper.style.width = `${rect.width}px`;
    captureWrapper.style.height = `${rect.height}px`;
    captureWrapper.style.pointerEvents = "none";
    captureWrapper.style.opacity = "0";
    const captureNode = card.cloneNode(true);
    captureNode.style.transform = "none";
    captureNode.style.transformStyle = "flat";
    captureNode.style.boxShadow = "none";
    captureNode.style.borderRadius = "0";
    captureNode.style.width = `${rect.width}px`;
    captureNode.style.height = `${rect.height}px`;
    captureWrapper.appendChild(captureNode);
    document.body.appendChild(captureWrapper);
    let blob = null;
    try {
      await inlineImagesForCapture(captureNode);
      await waitForCardAssets(captureNode);
      if (!isValid()) {
        return;
      }
      const htmlToImage = await loadHtmlToImage();
      const toBlob = htmlToImage.toBlob || (htmlToImage.default && htmlToImage.default.toBlob);
      if (!toBlob) {
        return;
      }
      blob = await toBlob(captureNode, {
        cacheBust: true,
        fetchRequestInit: {
          mode: "cors",
          credentials: "omit"
        },
        pixelRatio: (window.devicePixelRatio || 1) * options.scale,
        style: {
          transform: "none",
          transformStyle: "flat",
          boxShadow: "none"
        }
      });
    } finally {
      if (captureWrapper.parentNode) {
        captureWrapper.parentNode.removeChild(captureWrapper);
      }
    }
    if (!blob || !isValid()) {
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = options.fileName;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
  } catch {
    return;
  }
};

let shinyCardDownloadTimeout = null;
let shinyCardDownloadToken = 0;
let shinyCardDownloadResolver = null;

const resolveShinyCardDownload = () => {
  if (shinyCardDownloadResolver) {
    const resolve = shinyCardDownloadResolver;
    shinyCardDownloadResolver = null;
    resolve();
  }
};

const cancelShinyCardDownload = () => {
  shinyCardDownloadToken += 1;
  if (shinyCardDownloadTimeout !== null) {
    window.clearTimeout(shinyCardDownloadTimeout);
    shinyCardDownloadTimeout = null;
  }
  resolveShinyCardDownload();
};

const scheduleShinyCardDownload = ({ card, fileName, readyPromise, scale, delayMs = 1000 }) => {
  cancelShinyCardDownload();
  const token = shinyCardDownloadToken;
  const promise = new Promise((resolve) => {
    shinyCardDownloadResolver = resolve;
    shinyCardDownloadTimeout = window.setTimeout(async () => {
      shinyCardDownloadTimeout = null;
      try {
        if (token !== shinyCardDownloadToken || !card.isConnected) {
          resolveShinyCardDownload();
          return;
        }
        await downloadShinyCardPng(card, {
          fileName,
          readyPromise,
          scale,
          isStillValid: () => token === shinyCardDownloadToken
        });
      } finally {
        resolveShinyCardDownload();
      }
    }, delayMs);
  });
  return promise;
};

window.monsShinyCardCapture = {
  scheduleShinyCardDownload,
  cancelShinyCardDownload
};
