let quotes = [];
let templates = [];
let generatedImageBlob = null;
let generatedQuote = '';

let autoRunning = false;
let stopRequested = false;

const generateBtn = document.getElementById('generateBtn');
const publishBtn = document.getElementById('publishBtn');
const autoGenerateBtn = document.getElementById('autoGenerate');
const stopBtn = document.getElementById('stopBtn');
const resultDiv = document.getElementById('result');
const resultTitle = document.getElementById('title');
const statusText = document.getElementById('status');
stopBtn.style.display = 'none';

function setStatus(message, isError = false) {
  statusText.textContent = message;
  statusText.style.color = isError ? '#b91c1c' : '#374151';
}

function pickRandom(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const { width } = ctx.measureText(testLine);
    if (width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

function drawQuoteOnCanvas(canvas, quote) {
  const ctx = canvas.getContext('2d');
  const padding = Math.round(canvas.width * 0.08);
  const maxTextWidth = canvas.width - padding * 2;
  let fontSize = Math.max(24, Math.floor(canvas.width / 18));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;

  let lines = [];
  let lineHeight = 0;
  let totalHeight = 0;
  do {
    ctx.font = `bold ${fontSize}px sans-serif`;
    lines = wrapText(ctx, quote, maxTextWidth);
    lineHeight = fontSize * 1.25;
    totalHeight = lines.length * lineHeight;
    if (totalHeight > canvas.height * 0.55 && fontSize > 18) {
      fontSize -= 2;
    } else {
      break;
    }
  } while (fontSize > 18);

  const yStart = (canvas.height - totalHeight) / 2;

  ctx.fillStyle = '#000000';
  ctx.lineWidth = Math.max(4, Math.floor(fontSize / 10));

  lines.forEach((line, index) => {
    const y = yStart + index * lineHeight;
    ctx.fillText(line, canvas.width / 2, y);
  });
}

async function createImageBlob(templateUrl, quote) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth || 720;
      canvas.height = image.naturalHeight || 1280;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      drawQuoteOnCanvas(canvas, quote);
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to create image blob.'));
        }
      }, 'image/jpeg', 0.92);
    };
    image.onerror = () => reject(new Error('Failed to load template image.'));
    image.src = templateUrl;
  });
}

async function loadAssets() {
  try {
    const quotesResponse = await fetch(chrome.runtime.getURL('assets/quotes/quotes.json'));
    if (!quotesResponse.ok) {
      throw new Error('Unable to load quotes.');
    }
    const loadedQuotes = await quotesResponse.json();
    quotes = Array.isArray(loadedQuotes) ? loadedQuotes : [];
  } catch (error) {
    setStatus('Failed to load quotes.', true);
    return;
  }

  templates = [];
  const maxTemplates = 20;
  for (let i = 1; i <= maxTemplates; i += 1) {
    const templateUrl = chrome.runtime.getURL(`assets/templates/template_${i}.jpg`);
    try {
      const response = await fetch(templateUrl);
      if (!response.ok) {
        break;
      }
      templates.push(templateUrl);
    } catch (error) {
      break;
    }
  }

  if (templates.length === 0) {
    setStatus('No template images found.', true);
    return;
  }

  setStatus('Assets loaded. Ready to generate.');
}

async function generatePost() {
  if (templates.length === 0) {
    setStatus('No templates available.', true);
    return;
  }

  generatedQuote = pickRandom(quotes);
  if (typeof generatedQuote === 'object') {
    generatedQuote = generatedQuote.text || generatedQuote.quote || JSON.stringify(generatedQuote);
  }

  const templateUrl = pickRandom(templates);
  generateBtn.disabled = true;
  publishBtn.disabled = true;
  autoGenerateBtn.disabled = true;
  setStatus('Generating image...');

  try {
    const blob = await createImageBlob(templateUrl, generatedQuote);
    generatedImageBlob = blob;
    const imageUrl = URL.createObjectURL(blob);

    resultDiv.innerHTML = '';
    const imgEl = document.createElement('img');
    imgEl.src = imageUrl;
    imgEl.alt = 'Generated quote image';
    imgEl.style.maxWidth = '100%';
    imgEl.style.borderRadius = '8px';
    resultDiv.appendChild(imgEl);

    resultTitle.value = generatedQuote.length > 80 ? `${generatedQuote.slice(0, 80)}...` : generatedQuote;
    setStatus('Image created. Click Publish or start auto mode.');
  } catch (error) {
    console.error(error);
    setStatus(error.message || 'Image generation failed.', true);
  } finally {
    generateBtn.disabled = false;
    publishBtn.disabled = false;
    if (!autoRunning) {
      autoGenerateBtn.disabled = false;
    }
  }
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sendPublishMessage(tabId, base64) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, {
      action: 'publishPost',
      imageBase64: base64,
      quote: generatedQuote
    }, (response) => {
      if (chrome.runtime.lastError) {
        chrome.runtime.sendMessage({
          action: 'relayPublish',
          tabId,
          imageBase64: base64,
          quote: generatedQuote
        }, (relayResponse) => {
          resolve(relayResponse || { success: false, error: chrome.runtime.lastError.message });
        });
      } else {
        resolve(response);
      }
    });
  });
}

async function publishPostAsync() {
  if (!generatedImageBlob) {
    throw new Error('Generate a post first.');
  }

  const tabs = await new Promise((resolve) => chrome.tabs.query({ active: true, currentWindow: true }, resolve));
  const tab = tabs[0];
  if (!tab || !tab.id) {
    throw new Error('No active Dailyhunt tab found.');
  }

  const base64 = await blobToDataURL(generatedImageBlob);
  const response = await sendPublishMessage(tab.id, base64);
  if (!response?.success) {
    throw new Error(response?.error || 'Publishing failed.');
  }

  return response;
}

async function publishPost() {
  publishBtn.disabled = true;
  generateBtn.disabled = true;
  autoGenerateBtn.disabled = true;
  setStatus('Publishing to Dailyhunt...');

  try {
    const response = await publishPostAsync();
    setStatus(response.message || 'Published successfully.');
  } catch (error) {
    console.error(error);
    setStatus(error.message || 'Publish failed.', true);
  } finally {
    publishBtn.disabled = false;
    generateBtn.disabled = false;
    if (!autoRunning) {
      autoGenerateBtn.disabled = false;
    }
  }
}

async function runAutoLoop() {
  if (autoRunning) return;

  autoRunning = true;
  stopRequested = false;
  generateBtn.disabled = true;
  publishBtn.disabled = true;
  autoGenerateBtn.disabled = true;
  stopBtn.style.display = 'inline-block';
  stopBtn.disabled = false;
  setStatus('Auto mode started. Generating and publishing...');

  while (!stopRequested) {
    try {
      await generatePost();
      await publishPostAsync();
      setStatus('Post published. Waiting 15-20 seconds...');
    } catch (error) {
      console.error(error);
      setStatus(`Auto run stopped: ${error.message}`, true);
      break;
    }

    if (stopRequested) {
      break;
    }

    const delay = 15000 + Math.floor(Math.random() * 5001);
    await sleep(delay);
  }

  autoRunning = false;
  stopRequested = false;
  generateBtn.disabled = false;
  publishBtn.disabled = false;
  autoGenerateBtn.disabled = false;
  stopBtn.disabled = true;
  stopBtn.style.display = 'none';
  setStatus('Auto mode stopped.');
}

function stopAutoLoop() {
  if (!autoRunning) {
    setStatus('Auto mode is not running.');
    return;
  }

  stopRequested = true;
  stopBtn.disabled = true;
  setStatus('Stop requested. Waiting for current task to finish...');
}

generateBtn.addEventListener('click', generatePost);
publishBtn.addEventListener('click', publishPost);
autoGenerateBtn.addEventListener('click', runAutoLoop);
stopBtn.addEventListener('click', stopAutoLoop);

loadAssets();
