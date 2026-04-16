console.log('[DH Auto Poster] Content script loaded');

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	console.log('[DH Auto Poster] Message received:', message.action);
    if (message.action === 'publishPost') {
		publishToDailyhunt(message.imageBase64, message.quote, sendResponse);
	}
	return true;
});

async function publishToDailyhunt(imageBase64, quote, sendResponse) {
	try {
		// Step 1: Click "Create Post" button
		const buttons = Array.from(document.querySelectorAll('button'));
		let createBtn = buttons.find(b => b.textContent.includes('Create Post'));
		
		if (!createBtn) throw new Error('Create Post button not found');
		createBtn.click();
		console.log('[DH Auto Poster] Clicked Create Post');

		// Wait for modal to appear
		await new Promise(resolve => setTimeout(resolve, 2000));

		// Step 2: Click "Image/Meme" option
		const cards = Array.from(document.querySelectorAll('.ant-card.modalCard.ant-card-bordered.ant-card-hoverable'));
		const imageOption = cards.find(card => {
			const img = card.querySelector('img.createModalImage');
			const header = card.querySelector('h1.modalHeader');
			return img && img.src.includes('meme') && header && header.textContent.includes('Image/Meme');
		});
		
		if (!imageOption) throw new Error('Image/Meme option not found');
		
		imageOption.click();
		console.log('[DH Auto Poster] Clicked Image/Meme');

		// Wait for next page
		await new Promise(resolve => setTimeout(resolve, 1500));

		// Step 3: Fill title textarea
		const textareas = Array.from(document.querySelectorAll('textarea'));
		const textarea = textareas.find(ta => 
			ta.placeholder?.includes('Title') || 
			ta.placeholder?.includes('title') ||
			ta.placeholder?.includes('Image')
		);
		
		if (!textarea) throw new Error('Title textarea not found');
		textarea.value = quote;
		textarea.dispatchEvent(new Event('input', { bubbles: true }));
		textarea.dispatchEvent(new Event('change', { bubbles: true }));
		textarea.focus();
		console.log('[DH Auto Poster] Filled title:', quote);

		// Step 4: Upload image
		const fileInputs = Array.from(document.querySelectorAll('input[type="file"]'));
		const fileInput = fileInputs[0];
		
		if (!fileInput) throw new Error('File input not found');

		// Convert base64 to blob
		const base64Data = imageBase64.split(',')[1];
		const binaryString = atob(base64Data);
		const bytes = new Uint8Array(binaryString.length);
		for (let i = 0; i < binaryString.length; i++) {
			bytes[i] = binaryString.charCodeAt(i);
		}
		const blob = new Blob([bytes], { type: 'image/jpeg' });

		// Create a File object
		const file = new File([blob], `quote_${Date.now()}.jpg`, { type: 'image/jpeg' });

		// Trigger file input
		const dataTransfer = new DataTransfer();
		dataTransfer.items.add(file);
		fileInput.files = dataTransfer.files;
		fileInput.dispatchEvent(new Event('change', { bubbles: true }));
		fileInput.dispatchEvent(new Event('input', { bubbles: true }));
		console.log('[DH Auto Poster] Uploaded image');

		// Wait for image to load and cropper to appear
		await new Promise(resolve => setTimeout(resolve, 3500));

		// Step 5: Click Save in image cropper
		const allButtons = Array.from(document.querySelectorAll('button'));
		const saveBtn = allButtons.find(b => 
			b.textContent.trim() === 'Save' || 
			b.textContent.includes('Save') &&
			b.textContent.length < 20
		);
		
		if (saveBtn) {
			saveBtn.click();
			console.log('[DH Auto Poster] Clicked Save');
			await new Promise(resolve => setTimeout(resolve, 2500));
		}

		// Step 6: Click Next button
		const nextBtn = allButtons.find(b => b.textContent.includes('Next'));
		if (nextBtn) {
			nextBtn.click();
			console.log('[DH Auto Poster] Clicked Next');
			await new Promise(resolve => setTimeout(resolve, 1500));
		}

		sendResponse({
			success: true,
			message: 'Image uploaded and moved to next step!'
		});
	} catch (error) {
		console.error('[DH Auto Poster] Error:', error);
		sendResponse({
			success: false,
			error: error.message
		});
	}
}