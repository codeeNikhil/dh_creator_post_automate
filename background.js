chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message.action === 'relayPublish') {
		const tabId = message.tabId;
		const imageBase64 = message.imageBase64;
		const quote = message.quote;

		// Forward the message to the content script on the specified tab
		chrome.tabs.sendMessage(tabId, {
			action: 'publishPost',
			imageBase64: imageBase64,
			quote: quote
		}, (response) => {
			if (chrome.runtime.lastError) {
				console.log('Content script relay error:', chrome.runtime.lastError);
				// Try injecting the content script
				chrome.scripting.executeScript({
					target: { tabId: tabId },
					files: ['content.js']
				}).then(() => {
					// Retry sending the message after injection
					chrome.tabs.sendMessage(tabId, {
						action: 'publishPost',
						imageBase64: imageBase64,
						quote: quote
					}, (retryResponse) => {
						sendResponse(retryResponse || { success: false, error: 'Content script injection failed' });
					});
				}).catch(err => {
					console.log('Script injection error:', err);
					sendResponse({
						success: false,
						error: 'Unable to inject content script. Make sure you\'re on Dailyhunt page.'
					});
				});
			} else {
				sendResponse(response);
			}
		});

		return true; // Keep channel open for async response
	}
});

// Inject content script on page load
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
	if (changeInfo.status === 'complete' && (tab.url?.includes('dailyhunt.in') || tab.url?.includes('dailyhunt.com'))) {
		console.log('Dailyhunt tab detected, injecting content script');
		chrome.scripting.executeScript({
			target: { tabId: tabId },
			files: ['content.js']
		}).catch(err => console.log('Injection error:', err));
	}
});
