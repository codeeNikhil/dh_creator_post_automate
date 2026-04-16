let quotes = [];
let templates = [];
let generatedImageBlob = null;
let generatedQuote = '';

const generateBtn = document.getElementById('generateBtn');
const publishBtn = document.getElementById('publishBtn');
const resultDiv = document.getElementById('result');
const resultTitle = document.getElementById('title');
const statusText = document.getElementById('status');

function setStatus(message, isError = false) {
  statusText.textContent = message;
  statusText.style.color = isError ? '#b91c1c' : '#374151';
}

async function loadAssets() {
  try {
    const quotesResponse = await fetch(chrome.runtime.getURL('assets/quotes/quotes.json'));
    quotes = await quotesResponse.json();
  } catch (error) {
    setStatus('Failed to load quotes.', true);
  }

  templates = [];
  let i = 1;
  while (true) {
    try {
      const templateUrl = chrome.runtime.getURL(`assets/templates/template_${i}.jpg`);
      const response = await fetch(templateUrl, { method: 'HEAD' });
      if (response.ok) {
        templates.push(`template_${i}.jpg`);
        i++;
      } else {
        break;
      }
    } catch (err) {
      break;
    }
  }

  if (templates.length === 0) {
    setStatus('No templates found. Add template_1.jpg in assets/templates.', true);
  }
}

async function generatePost() {
  if (quotes.length === 0) {
    setStatus('No quotes loaded.', true);
    return;
  }

  if (templates.length === 0) {
    setStatus('No templates available.', true);
    return;
  }

  setStatus('Generating post...');
  generateBtn.disabled = true;

  try {
    const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
    const randomTemplate = templates[Math.floor(Math.random() * templates.length)];

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = chrome.runtime.getURL(`assets/templates/${randomTemplate}`);

    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = img.width;
    canvas.height = img.height;

    ctx.drawImage(img, 0, 0);

    const isPortrait = img.height > img.width;
    const margin = Math.min(img.width, img.height) * 0.1;
    const maxWidth = img.width - 2 * margin;
    const maxHeight = img.height - 2 * margin;

    let fontSize = isPortrait ? Math.floor(img.width / 15) : Math.floor(img.height / 10);
    ctx.font = `bold ${fontSize}px Arial`;
    ctx.fillStyle = 'black';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const words = randomQuote.split(' ');
    let lines = [];
    let currentLine = '';
    for (let word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }

    while (lines.length * fontSize * 1.2 > maxHeight && fontSize > 10) {
      fontSize -= 2;
      ctx.font = `bold ${fontSize}px Arial`;
    }

    const lineHeight = fontSize * 1.2;
    let y = (img.height - lines.length * lineHeight) / 2 + lineHeight / 2;
    for (const line of lines) {
      ctx.fillText(line, img.width / 2, y);
      y += lineHeight;
    }

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg'));
    const url = URL.createObjectURL(blob);

    resultDiv.innerHTML = `<img src="${url}" alt="Generated post">`;
    resultDiv.dataset.imageUrl = url;
    generatedImageBlob = blob;
    generatedQuote = randomQuote.split(' - ')[0] || randomQuote;
    resultTitle.value = generatedQuote;

    setStatus('Post generated successfully.');
  } catch (error) {
    console.error(error);
    setStatus(`Error: ${error.message || error}`, true);
  } finally {
    generateBtn.disabled = false;
  }
}

async function publishPost() {
  if (!generatedImageBlob) {
    setStatus('Generate a post first.', true);
    return;
  }

  setStatus('Publishing to Dailyhunt...');
  publishBtn.disabled = true;

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab || !tab.id) {
      setStatus('No active Dailyhunt tab found.', true);
      publishBtn.disabled = false;
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result;
      chrome.tabs.sendMessage(tab.id, {
        action: 'publishPost',
        imageBase64: base64,
        quote: generatedQuote
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.log('Direct message failed, trying background relay:', chrome.runtime.lastError);
          chrome.runtime.sendMessage({
            action: 'relayPublish',
            tabId: tab.id,
            imageBase64: base64,
            quote: generatedQuote
          }, (relayResponse) => {
            if (chrome.runtime.lastError) {
              setStatus('Unable to connect to Dailyhunt. Make sure Dailyhunt tab is open.', true);
            } else if (relayResponse?.success) {
              setStatus(relayResponse.message || 'Posted successfully!');
            } else {
              setStatus(relayResponse?.error || 'Publishing failed.', true);
            }
            publishBtn.disabled = false;
          });
          return;
        }

        if (response?.success) {
          setStatus(response.message || 'Posted successfully!');
        } else {
          setStatus(response?.error || 'Publishing failed.', true);
        }
        publishBtn.disabled = false;
      });
    };
    reader.readAsDataURL(generatedImageBlob);
  });
}

generateBtn.addEventListener('click', generatePost);
publishBtn.addEventListener('click', publishPost);

loadAssets();
