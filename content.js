// Debug log when content script loads
console.log('[Content] Content script loaded on page:', window.location.href);

// Listen for messages from the extension
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  console.log('[Content] Message received:', request.action, request);
  console.log('[Content] Sender:', sender);
  
  if (request.action === 'ping') {
    console.log('[Content] Received ping, sending pong response');
    sendResponse({success: true, message: 'Content script is loaded'});
    return true;
  } else if (request.action === 'extractContent') {
    console.log('[Content] Direct request to extract webpage content');
    try {
      // Extract the webpage content
      const pageContent = extractPageContent();
      console.log('[Content] Content extracted successfully for direct request. Size:', JSON.stringify(pageContent).length);
      
      // Send the extracted content back
      sendResponse({success: true, pageContent: pageContent});
    } catch (error) {
      console.error('[Content] Error extracting page content for direct request:', error);
      sendResponse({success: false, error: error.message});
    }
    return true; // Keep the messaging channel open for async response
  } else if (request.action === 'summarize') {
    console.log('[Content] Extracting webpage content for summarization');
    try {
      // Extract the webpage content
      const pageContent = extractPageContent();
      console.log('[Content] Content extracted successfully. Size:', JSON.stringify(pageContent).length);
      
      // Log detailed info about the extracted content
      console.log('[Content] Page data details:');
      console.log('  - URL:', pageContent.url);
      console.log('  - Title:', pageContent.title);
      console.log('  - Meta Description:', pageContent.metaDescription?.substring(0, 100) || 'None');
      console.log('  - Content Length:', pageContent.content?.length || 0, 'characters');
      console.log('  - Forms detected:', pageContent.forms?.length || 0);
      
      // Send the content to the background script
      console.log('[Content] Sending content to background script with openSidebar action');
      chrome.runtime.sendMessage({
        action: 'openSidebar',
        mode: 'summarize',
        pageContent: pageContent
      }, function(response) {
        if (chrome.runtime.lastError) {
          console.error('[Content] Error sending content to background:', chrome.runtime.lastError);
          sendResponse({success: false, error: chrome.runtime.lastError.message});
        } else {
          console.log('[Content] Content sent to background successfully:', response);
          sendResponse({success: true});
        }
      });
    } catch (error) {
      console.error('[Content] Error extracting page content:', error);
      sendResponse({success: false, error: error.message});
    }
  } else if (request.action === 'executeScript') {
    console.log('[Content] Executing script on page for form filling');
    // Execute a script on the page (e.g., form filling)
    try {
      const result = executeScript(request.script, request.data);
      console.log('[Content] Script executed successfully');
      sendResponse({success: true, result: result});
    } catch (error) {
      console.error('[Content] Error executing script:', error);
      sendResponse({success: false, error: error.message});
    }
  } else {
    console.warn('[Content] Unknown action received:', request.action);
    sendResponse({success: false, error: 'Unknown action'});
  }
  
  return true; // Keep the message channel open for async response
});

// Function to extract relevant content from the webpage
function extractPageContent() {
  console.log('[Content] Starting content extraction');
  
  try {
    // Get the page title
    const title = document.title;
    console.log('[Content] Page title:', title);
    
    // Get meta description and keywords if available
    let metaDescription = '';
    let metaKeywords = '';
    
    const descriptionMeta = document.querySelector('meta[name="description"]');
    if (descriptionMeta) {
      metaDescription = descriptionMeta.getAttribute('content');
      console.log('[Content] Found meta description:', metaDescription.substring(0, 100) + (metaDescription.length > 100 ? '...' : ''));
    } else {
      console.log('[Content] No meta description found');
    }
    
    const keywordsMeta = document.querySelector('meta[name="keywords"]');
    if (keywordsMeta) {
      metaKeywords = keywordsMeta.getAttribute('content');
      console.log('[Content] Found meta keywords:', metaKeywords);
    } else {
      console.log('[Content] No meta keywords found');
    }
    
    // Get main content (prioritize article, main, or content divs)
    console.log('[Content] Searching for main content element');
    let mainContent = '';
    const contentSelectors = [
      'article', 'main', '[role="main"]', 
      '#content', '.content', 
      '#main', '.main'
    ];
    
    let contentElement = null;
    for (const selector of contentSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        contentElement = element;
        console.log('[Content] Found content element using selector:', selector);
        break;
      }
    }
    
    // If we couldn't find a main content container, use the body
    if (!contentElement) {
      console.log('[Content] No specific content element found, using body');
      contentElement = document.body;
    }
    
    // Extract text content, removing script and style elements
    console.log('[Content] Cleaning and extracting text content');
    const clonedElement = contentElement.cloneNode(true);
    const scriptsAndStyles = clonedElement.querySelectorAll('script, style, iframe, nav, footer, header, aside');
    console.log('[Content] Removing', scriptsAndStyles.length, 'non-content elements');
    scriptsAndStyles.forEach(element => element.remove());
    
    mainContent = clonedElement.textContent
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 15000); // Limit the content length
    
    console.log('[Content] Extracted content length:', mainContent.length, 'characters');
    if (mainContent.length === 15000) {
      console.log('[Content] Content was truncated to limit');
    }
  
  // Return structured page data
  const pageData = {
    url: window.location.href,
    title: title,
    metaDescription: metaDescription,
    metaKeywords: metaKeywords,
    content: mainContent,
    timestamp: new Date().toISOString()
  };
  
  console.log('[Content] Extraction complete. Page data structure created');
  return pageData;
} catch (error) {
  console.error('[Content] Error during content extraction:', error);
  // Return minimal page data on error
  return {
    url: window.location.href,
    title: document.title || '',
    content: 'Error extracting page content: ' + error.message,
    timestamp: new Date().toISOString()
  };
}
}

// Helper function to find the label associated with an input
function getInputLabel(input) {
  // Check for a label with a matching 'for' attribute
  if (input.id) {
    const label = document.querySelector(`label[for="${input.id}"]`);
    if (label) {
      return label.textContent.trim();
    }
  }
  
  // Check if the input is inside a label
  let parent = input.parentElement;
  while (parent) {
    if (parent.tagName === 'LABEL') {
      const labelText = parent.textContent.replace(input.value || '', '').trim();
      return labelText;
    }
    parent = parent.parentElement;
  }
  
  // Check nearby text for potential labels
  const previousSibling = input.previousElementSibling;
  if (previousSibling && (previousSibling.tagName === 'LABEL' || previousSibling.tagName === 'SPAN')) {
    return previousSibling.textContent.trim();
  }
  
  return '';
}

// Function to execute scripts for form filling
function executeScript(script, data) {
  // Create a function from the script string and execute it with the provided data
  try {
    const scriptFunction = new Function('data', script);
    return scriptFunction(data);
  } catch (error) {
    console.error('Error executing script:', error);
    throw error;
  }
}
