// Add initial debug log to verify script is loaded
console.log('[Sidebar] Script loading at', new Date().toISOString());

// Initialize sidebar state
let pageData = null;
let chatHistory = [];
let ollamaSettings = {
  host: 'http://localhost:11434',
  model: 'deepseek-r1:8b'
};

// Global error handler to catch unhandled exceptions
window.addEventListener('error', function(event) {
  console.error('[Sidebar] Unhandled error:', event.error);
});

// Theme management
function setTheme(isDarkMode) {
  if (isDarkMode) {
    document.body.classList.add('dark-theme');
  } else {
    document.body.classList.remove('dark-theme');
  }
  
  // Save theme preference
  chrome.storage.sync.set({ darkMode: isDarkMode }, function() {
    console.log('[Sidebar] Theme preference saved:', isDarkMode ? 'dark' : 'light');
  });
}

// DOM elements
const chatPanel = document.getElementById('chat-panel');
const formFillPanel = document.getElementById('form-fill-panel');
const settingsPanel = document.getElementById('settings-panel');
const chatMessages = document.getElementById('chat-messages');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const formsList = document.getElementById('forms-list');
const formData = document.getElementById('form-data');
const fillFormBtn = document.getElementById('fill-form-btn');
const connectionStatus = document.getElementById('connection-status');
const modeBtns = document.querySelectorAll('.mode-btn');
const closeSidebarBtn = document.getElementById('close-sidebar-btn');

// Settings elements
const darkModeToggle = document.getElementById('dark-mode-toggle');
const ollamaHostInput = document.getElementById('ollama-host');
const ollamaModelInput = document.getElementById('ollama-model');
const systemPromptInput = document.getElementById('system-prompt');
const testConnectionBtn = document.getElementById('test-connection-btn');
const connectionStatusSettings = document.getElementById('connection-status-settings');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const resetSettingsBtn = document.getElementById('reset-settings-btn');

// Initialize when document is loaded
document.addEventListener('DOMContentLoaded', async function() {
  // Setup streaming listener
  setupStreamListener();
  // Initialize dark mode
  initDarkMode();
  // Initialize settings panel
  initSettings();
  console.log('[Sidebar] DOM loaded, beginning initialization');
  
  try {
    // Log which DOM elements we're trying to find
    console.log('[Sidebar] Checking for UI elements:');
    console.log('  - chatPanel:', !!document.getElementById('chat-panel'));
    console.log('  - formFillPanel:', !!document.getElementById('form-fill-panel'));
    console.log('  - settingsPanel:', !!document.getElementById('settings-panel'));
    console.log('  - closeSidebarBtn:', !!document.getElementById('close-sidebar-btn'));
    console.log('  - modeBtns:', document.querySelectorAll('.mode-btn').length);
    
    // Get Ollama settings from storage
    console.log('[Sidebar] Retrieving Ollama settings from storage');
    chrome.storage.sync.get({
      ollamaHost: 'http://localhost:11434',
      ollamaModel: 'deepseek-r1:8b',
      systemPrompt: 'You are a helpful AI assistant integrated into a browser extension.'
    }, function(items) {
      if (chrome.runtime.lastError) {
        console.error('[Sidebar] Error retrieving settings:', chrome.runtime.lastError);
        return;
      }
      
      console.log('[Sidebar] Retrieved settings:', items);
      ollamaSettings.host = items.ollamaHost;
      ollamaSettings.model = items.ollamaModel;
      ollamaSettings.systemPrompt = items.systemPrompt;
      
      // Check if Ollama is running
      testOllamaConnection();
    });
    
    // Get sidebar mode and page data from session storage
    console.log('[Sidebar] Retrieving sidebar mode and page content from session storage');
    chrome.storage.session.get(['sidebarMode', 'pageContent'], function(data) {
      if (chrome.runtime.lastError) {
        console.error('[Sidebar] Error retrieving session data:', chrome.runtime.lastError);
        // Default to chat mode
        switchToMode('chat');
        return;
      }
      
      console.log('[Sidebar] Retrieved session data keys:', Object.keys(data));
      
      if (data.pageContent) {
        pageData = data.pageContent;
        console.log('[Sidebar] Page data available, size:', JSON.stringify(pageData).length);
        
        // Log the structure of pageData for debugging
        console.log('[Sidebar] Page data structure:', {
          url: pageData.url,
          title: pageData.title,
          hasMetaDescription: !!pageData.metaDescription,
          hasContent: !!pageData.content,
          contentLength: pageData.content?.length || 0,
          formCount: pageData.forms?.length || 0,
          timestamp: pageData.timestamp
        });
        
        // Verify content data is properly loaded
        if (!pageData.content || pageData.content.length === 0) {
          console.error('[Sidebar] Page content is missing or empty! This will affect AI responses.');
          // Add a warning message to the UI
          document.getElementById('connection-status').innerHTML = 
            'Warning: Page content could not be loaded correctly. AI responses may be limited.';
          document.getElementById('connection-status').classList.add('warning');
        } else {
          console.log('[Sidebar] Content sample:', pageData.content.substring(0, 100) + '...');
        }
        
        // Always use chat mode by default since summary mode is removed
        console.log('[Sidebar] Switching to chat mode (with page data)');
        if (data.sidebarMode === 'settings') {
          console.log('[Sidebar] Opening settings panel');
          switchToMode('settings');
        } else if (data.sidebarMode === 'form') {
          console.log('[Sidebar] Opening form fill panel');
          switchToMode('form');
        } else {
          // Default to chat mode
          switchToMode('chat');
        }
        
        // Add a message indicating that context is available
        if (pageData.content && pageData.content.length > 0) {
          const noticeEl = document.createElement('div');
          noticeEl.className = 'context-notice';
          noticeEl.innerHTML = `<i>Context from <b>${pageData.title}</b> is available for questions</i>`;
          document.querySelector('.messages-container').appendChild(noticeEl);
        }
        
        // Populate the forms panel if we have form data
        if (pageData.forms && pageData.forms.length > 0) {
          console.log('[Sidebar] Populating forms panel with', pageData.forms.length, 'forms');
          populateFormsPanel(pageData.forms);
        } else {
          console.log('[Sidebar] No form data available on this page');
        }
      } else {
        console.log('[Sidebar] No page data available, defaulting to chat mode');
        // No page data, default to chat
        switchToMode('chat');
      }
    });
    
    // Set up event listeners
    console.log('[Sidebar] Setting up event listeners');
    setupEventListeners();
    
    console.log('[Sidebar] Initialization complete');
  } catch (error) {
    console.error('[Sidebar] Error during initialization:', error);
  }
});

// Test connection to Ollama
async function testOllamaConnection(statusElement = null) {
  console.log('[Sidebar] Testing connection to Ollama at', ollamaSettings.host);
  const connectionStatusElement = statusElement || document.getElementById('connection-status');
  
  if (!connectionStatusElement) {
    console.error('[Sidebar] Connection status element not found');
    return;
  }
  
  try {
    console.log('[Sidebar] Sending request to Ollama tags API');
    const response = await fetch(`${ollamaSettings.host}/api/tags`);
    console.log('[Sidebar] Ollama response status:', response.status);
    
    if (response.ok) {
      const data = await response.json();
      console.log('[Sidebar] Available Ollama models:', data);
      
      connectionStatusElement.textContent = `Connected to Ollama (${ollamaSettings.model})`;
      connectionStatusElement.classList.add('connected');
      connectionStatusElement.classList.remove('error');
      console.log('[Sidebar] Successfully connected to Ollama');
    } else {
      throw new Error(`Status: ${response.status}`);
    }
  } catch (error) {
    console.error('[Sidebar] Ollama connection error:', error);
    connectionStatusElement.textContent = 'Error connecting to Ollama. Make sure it\'s running.';
    connectionStatusElement.classList.add('error');
    connectionStatusElement.classList.remove('connected');
  }
}

// Initialize dark mode functionality
function initDarkMode() {
  console.log('[Sidebar] Initializing dark mode');
  const darkModeToggle = document.getElementById('dark-mode-toggle');
  
  if (!darkModeToggle) {
    console.error('[Sidebar] Dark mode toggle element not found');
    return;
  }
  
  // Check if dark mode preference is saved
  chrome.storage.sync.get({ darkMode: false }, function(items) {
    if (chrome.runtime.lastError) {
      console.error('[Sidebar] Error getting dark mode preference:', chrome.runtime.lastError);
    } else {
      // Set initial state based on saved preference
      darkModeToggle.checked = items.darkMode;
      if (items.darkMode) {
        document.body.classList.add('dark-theme');
      }
      console.log('[Sidebar] Dark mode initialized:', items.darkMode);
    }
  });
  
  // Add change event listener to toggle
  darkModeToggle.addEventListener('change', function() {
    const isDarkMode = this.checked;
    console.log('[Sidebar] Dark mode toggled to:', isDarkMode);
    
    // Save preference
    chrome.storage.sync.set({ darkMode: isDarkMode }, function() {
      if (chrome.runtime.lastError) {
        console.error('[Sidebar] Error saving dark mode preference:', chrome.runtime.lastError);
      }
    });
    
    // Apply or remove dark mode class
    if (isDarkMode) {
      document.body.classList.add('dark-theme');
    } else {
      document.body.classList.remove('dark-theme');
    }
  });
}

// Initialize settings panel
function initSettings() {
  console.log('[Sidebar] Initializing settings panel');
  
  // Load Ollama settings
  chrome.storage.sync.get({
    ollamaHost: 'http://localhost:11434',
    ollamaModel: 'deepseek-r1:8b',
    systemPrompt: 'You are a helpful AI assistant integrated into a browser extension.'
  }, function(items) {
    if (chrome.runtime.lastError) {
      console.error('[Sidebar] Error retrieving settings:', chrome.runtime.lastError);
      return;
    }
    
    // Populate settings form
    if (ollamaHostInput) ollamaHostInput.value = items.ollamaHost;
    if (ollamaModelInput) ollamaModelInput.value = items.ollamaModel;
    if (systemPromptInput) systemPromptInput.value = items.systemPrompt;
    
    console.log('[Sidebar] Settings loaded:', items);
  });
  
  // Set up save settings button
  if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', function() {
      const settings = {
        ollamaHost: ollamaHostInput ? ollamaHostInput.value.trim() : 'http://localhost:11434',
        ollamaModel: ollamaModelInput ? ollamaModelInput.value.trim() : 'deepseek-r1:8b',
        systemPrompt: systemPromptInput ? systemPromptInput.value.trim() : 'You are a helpful AI assistant integrated into a browser extension.'
      };
      
      console.log('[Sidebar] Saving settings:', settings);
      
      chrome.storage.sync.set(settings, function() {
        if (chrome.runtime.lastError) {
          console.error('[Sidebar] Error saving settings:', chrome.runtime.lastError);
          // Show error message
          const errorEl = document.createElement('div');
          errorEl.className = 'context-notice error';
          errorEl.innerHTML = `<i>Error saving settings: ${chrome.runtime.lastError.message}</i>`;
          settingsPanel.appendChild(errorEl);
        } else {
          console.log('[Sidebar] Settings saved successfully');
          // Update current settings
          ollamaSettings.host = settings.ollamaHost;
          ollamaSettings.model = settings.ollamaModel;
          ollamaSettings.systemPrompt = settings.systemPrompt;
          
          // Show success message
          const successEl = document.createElement('div');
          successEl.className = 'context-notice success';
          successEl.innerHTML = '<i>Settings saved successfully!</i>';
          settingsPanel.appendChild(successEl);
          
          // Remove success message after 3 seconds
          setTimeout(() => {
            if (successEl.parentNode) {
              successEl.parentNode.removeChild(successEl);
            }
          }, 3000);
          
          // Test connection with new settings
          testOllamaConnection();
        }
      });
    });
  }
  
  // Set up reset settings button
  if (resetSettingsBtn) {
    resetSettingsBtn.addEventListener('click', function() {
      const defaultSettings = {
        ollamaHost: 'http://localhost:11434',
        ollamaModel: 'deepseek-r1:8b',
        systemPrompt: 'You are a helpful AI assistant integrated into a browser extension.'
      };
      
      // Update form fields
      if (ollamaHostInput) ollamaHostInput.value = defaultSettings.ollamaHost;
      if (ollamaModelInput) ollamaModelInput.value = defaultSettings.ollamaModel;
      if (systemPromptInput) systemPromptInput.value = defaultSettings.systemPrompt;
      
      console.log('[Sidebar] Settings reset to defaults');
    });
  }
  
  // Set up test connection button
  if (testConnectionBtn) {
    testConnectionBtn.addEventListener('click', function() {
      const host = ollamaHostInput ? ollamaHostInput.value.trim() : 'http://localhost:11434';
      console.log('[Sidebar] Testing connection to:', host);
      
      // Temporarily update host for testing
      const originalHost = ollamaSettings.host;
      ollamaSettings.host = host;
      
      // Test connection
      testOllamaConnection(document.getElementById('connection-status-settings'))
        .then(() => {
          console.log('[Sidebar] Connection test completed');
        })
        .catch(error => {
          console.error('[Sidebar] Connection test failed:', error);
        })
        .finally(() => {
          // Restore original host if settings weren't saved
          ollamaSettings.host = originalHost;
        });
    });
  }
}

// Set up event listeners for UI interactions
function setupEventListeners() {
  console.log('[Sidebar] Setting up event listeners');
  
  // Add close button event listener
  if (closeSidebarBtn) {
    closeSidebarBtn.addEventListener('click', function() {
      console.log('[Sidebar] Close button clicked, closing sidebar');
      // Close the sidebar
      chrome.runtime.sendMessage({action: 'closeSidebar'});
    });
  } else {
    console.error('[Sidebar] Close sidebar button not found');
  }
  
  try {
    // Mode switching buttons
    const modeBtnsElements = document.querySelectorAll('.mode-btn');
    console.log('[Sidebar] Found', modeBtnsElements.length, 'mode buttons');
    
    if (modeBtnsElements.length === 0) {
      console.error('[Sidebar] No mode buttons found');
    }
    
    modeBtnsElements.forEach(btn => {
      btn.addEventListener('click', function() {
        const mode = this.id.replace('mode-', '');
        console.log('[Sidebar] Mode button clicked:', mode);
        
        // All modes including settings should be handled locally now
        console.log('[Sidebar] Switching to mode:', mode);
        
        switchToMode(mode);
      });
    });
    
    // Add a refresh context button to the chat panel
    const chatPanel = document.getElementById('chat-panel');
    if (chatPanel && !document.getElementById('refresh-context-btn')) {
      const refreshBtn = document.createElement('button');
      refreshBtn.id = 'refresh-context-btn';
      refreshBtn.className = 'refresh-context-btn';
      refreshBtn.innerHTML = '<span class="icon">↻</span> Refresh Page Context';
      refreshBtn.title = 'Get fresh context from the current page';
      
      // Insert the button at the top of the chat panel
      const messagesContainer = document.getElementById('chat-messages');
      if (messagesContainer) {
        chatPanel.insertBefore(refreshBtn, messagesContainer);
      }
      
      // Add event listener to the refresh button
      refreshBtn.addEventListener('click', async function() {
        console.log('[Sidebar] Refresh context button clicked');
        refreshBtn.disabled = true;
        refreshBtn.innerHTML = '<span class="icon spin">↻</span> Refreshing...';
        
        try {
          // Check if we're on a supported page
          const tabs = await new Promise((resolve) => {
            chrome.tabs.query({active: true, currentWindow: true}, (tabs) => resolve(tabs));
          });
          
          if (!tabs || tabs.length === 0) {
            throw new Error('No active tab found');
          }
          
          const tab = tabs[0];
          
          // Check if we're on a page where content extraction is supported
          if (!tab.url || tab.url.startsWith('chrome://') || 
              tab.url.startsWith('chrome-extension://') || 
              tab.url.startsWith('about:')) {
            throw new Error('Cannot extract content from this page type');
          }
          
          // Try to fetch fresh page content
          const freshPageData = await fetchPageContent();
          
          // Validate the returned data
          if (!freshPageData || !freshPageData.url || !freshPageData.content) {
            throw new Error('Received invalid page content');
          }
          
          console.log('[Sidebar] Successfully fetched fresh page data');
          pageData = freshPageData;
          
          // Store in session storage for future use
          chrome.storage.session.set({pageContent: pageData}, () => {
            console.log('[Sidebar] Saved freshly fetched page data to session storage');
          });
          
          // Show success message
          const noticeEl = document.createElement('div');
          noticeEl.className = 'context-notice success';
          noticeEl.innerHTML = `<i>Context updated from <b>${pageData.title}</b></i>`;
          messagesContainer.appendChild(noticeEl);
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
          
          refreshBtn.innerHTML = '<span class="icon">✓</span> Context Updated!';
          setTimeout(() => {
            refreshBtn.disabled = false;
            refreshBtn.innerHTML = '<span class="icon">↻</span> Refresh Page Context';
          }, 2000);
          
        } catch (error) {
          console.error('[Sidebar] Error refreshing context:', error);
          refreshBtn.innerHTML = '<span class="icon">✗</span> Failed to Update';
          
          // Format a user-friendly error message
          let errorMessage = error.message || 'Unknown error';
          
          // Provide more helpful messages for common errors
          if (errorMessage.includes('chrome-extension') || 
              errorMessage.includes('chrome://') || 
              errorMessage.includes('Cannot extract content')) {
            errorMessage = 'Cannot extract content from extension pages or Chrome system pages';
          } else if (errorMessage.includes('Failed to fetch') || 
                    errorMessage.includes('Network error')) {
            errorMessage = 'Network error: Make sure the page has fully loaded';
          } else if (errorMessage.includes('script')) {
            errorMessage = 'Permission error: Cannot access page content';
          }
          
          // Show error message in chat
          const errorEl = document.createElement('div');
          errorEl.className = 'context-notice error';
          errorEl.innerHTML = `<i>Error updating context: ${errorMessage}</i>`;
          messagesContainer.appendChild(errorEl);
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
          
          setTimeout(() => {
            refreshBtn.disabled = false;
            refreshBtn.innerHTML = '<span class="icon">↻</span> Refresh Page Context';
          }, 2000);
        }
      });
    }
    
    // Send message button
    const sendBtnElement = document.getElementById('send-btn');
    if (!sendBtnElement) {
      console.error('[Sidebar] Send button not found');
    } else {
      sendBtnElement.addEventListener('click', function() {
        console.log('[Sidebar] Send button clicked');
        sendUserMessage();
      });
    }
    
    // Enter key in textarea
    const userInputElement = document.getElementById('user-input');
    if (!userInputElement) {
      console.error('[Sidebar] User input element not found');
    } else {
      userInputElement.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          console.log('[Sidebar] Enter key pressed in input');
          e.preventDefault();
          sendUserMessage();
        }
      });
    }
    
    // Fill form button
    const fillFormBtnElement = document.getElementById('fill-form-btn');
    if (!fillFormBtnElement) {
      console.error('[Sidebar] Fill form button not found');
    } else {
      fillFormBtnElement.addEventListener('click', function() {
        console.log('[Sidebar] Fill form button clicked');
        handleFormFill();
      });
    }
    
    console.log('[Sidebar] Event listeners set up successfully');
  } catch (error) {
    console.error('[Sidebar] Error setting up event listeners:', error);
  }
}

// Switch between different panels (chat, form-fill, settings)
function switchToMode(mode) {
  // Update mode buttons
  modeBtns.forEach(btn => {
    btn.classList.remove('active');
    if (btn.id === `mode-${mode}`) {
      btn.classList.add('active');
    }
  });
  
  // Hide all panels
  document.querySelectorAll('.panel').forEach(panel => {
    panel.classList.remove('active');
  });
  
  // Show the selected panel
  switch (mode) {
    case 'chat':
      chatPanel.classList.add('active');
      break;
    case 'form':
      formFillPanel.classList.add('active');
      break;
    case 'settings':
      settingsPanel.classList.add('active');
      break;
  }
}

// Function to fetch page content from the active tab
async function fetchPageContent() {
  console.log('[Sidebar] Attempting to fetch page content from active tab');
  
  try {
    // Get active tab
    const tabs = await new Promise((resolve) => {
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => resolve(tabs));
    });
    
    if (!tabs || tabs.length === 0) {
      console.error('[Sidebar] No active tab found');
      throw new Error('No active tab found');
    }
    
    const tab = tabs[0];
    console.log('[Sidebar] Found active tab:', tab.url);
    
    // Skip if this is a chrome-extension:// URL or chrome:// URL to avoid self-referential context
    if (tab.url && (tab.url.startsWith('chrome-extension://') || tab.url.startsWith('chrome://') || tab.url.startsWith('about:'))) {
      console.warn('[Sidebar] Tab URL is an extension or Chrome URL, skipping content fetch');
      throw new Error('Cannot extract content from Chrome or extension pages');
    }
    
    // Inject content script if not already loaded
    try {
      // First try sending a ping to check if content script is loaded
      await new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tab.id, {action: 'ping'}, response => {
          if (chrome.runtime.lastError) {
            console.log('[Sidebar] Content script not loaded, will inject it');
            reject(new Error('Content script not loaded'));
          } else {
            console.log('[Sidebar] Content script is loaded, continuing');
            resolve();
          }
        });
      }).catch(async () => {
        // If ping fails, inject content script
        console.log('[Sidebar] Injecting content script to tab:', tab.id);
        await chrome.scripting.executeScript({
          target: {tabId: tab.id},
          files: ['content.js']
        });
        console.log('[Sidebar] Content script injected successfully');
        
        // Wait a bit to make sure content script is initialized
        await new Promise(resolve => setTimeout(resolve, 200));
      });
    } catch (injectionError) {
      console.error('[Sidebar] Failed to inject content script:', injectionError);
      throw new Error('Unable to access page content: ' + injectionError.message);
    }
    
    // Send message to content script to extract content
    const response = await new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tab.id, {action: 'extractContent'}, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[Sidebar] Error sending message to content script:', chrome.runtime.lastError);
          reject(new Error('Communication with content script failed'));
        } else {
          resolve(response);
        }
      });
    });
    
    if (!response) {
      throw new Error('No response received from content script');
    }
    
    if (!response.success) {
      throw new Error(response.error || 'Content extraction failed');
    }
    
    if (!response.pageContent) {
      throw new Error('No content received from page');
    }
    
    console.log('[Sidebar] Successfully fetched page content, URL:', 
              response.pageContent.url,
              'Size:', JSON.stringify(response.pageContent).length);
              
    return response.pageContent;
  } catch (error) {
    console.error('[Sidebar] Error fetching page content:', error);
    throw error; // Re-throw the error to be handled by the caller
  }
}

// Send a user message to Ollama
async function sendUserMessage() {
  const message = userInput.value.trim();
  if (!message) return;
  
  // Add user message to chat
  addMessageToChat('user', message);
  
  // Clear input
  userInput.value = '';
  
  // If we don't have page data or it's from the sidebar itself, try to fetch it
  if (!pageData || pageData.url.includes('chrome-extension://')) {
    console.warn('[Sidebar] No valid pageData available, attempting to fetch from active tab');
    const freshPageData = await fetchPageContent();
    
    if (freshPageData && !freshPageData.url.includes('chrome-extension://')) {
      console.log('[Sidebar] Successfully fetched fresh page data from actual webpage');
      pageData = freshPageData;
      
      // Store in session storage for future use
      chrome.storage.session.set({pageContent: pageData}, () => {
        console.log('[Sidebar] Saved freshly fetched page data to session storage');
      });
      
      // Show context notice
      const noticeEl = document.createElement('div');
      noticeEl.className = 'context-notice';
      noticeEl.innerHTML = `<i>Context from <b>${pageData.title}</b> is now available</i>`;
      chatMessages.appendChild(noticeEl);
      chatMessages.scrollTop = chatMessages.scrollHeight;
    } else {
      console.error('[Sidebar] Failed to get valid page content or got sidebar content');
      // We'll send the message without webpage context
      pageData = null;
    }
  }
  
  // Additional validation to prevent using sidebar as context
  if (pageData && pageData.url.includes('chrome-extension://')) {
    console.warn('[Sidebar] Detected sidebar URL in pageData, nullifying to prevent confusion');
    pageData = null;
  }
  
  // Prepare context about the current page
  let context = '';
  let hasValidContext = false;
  
  if (pageData && !pageData.url.includes('chrome-extension://') && !pageData.url.includes('chrome://')) {
    console.log('[Sidebar] Adding page context to prompt, pageData:', pageData);
    context = `URL: ${pageData.url}\nTitle: ${pageData.title}\n`;
    if (pageData.metaDescription) {
      context += `Description: ${pageData.metaDescription}\n`;
    }
    // Truncate content to a reasonable size
    if (pageData.content && pageData.content.length > 0) {
      console.log('[Sidebar] Content length:', pageData.content.length);
      // Make sure we include a significant amount of content for context
      const contentToInclude = pageData.content.substring(0, 4000);
      context += `Content: ${contentToInclude}${pageData.content.length > 4000 ? '...' : ''}\n`;
      console.log('[Sidebar] Added content to context, length:', contentToInclude.length);
      hasValidContext = true;
    } else {
      console.error('[Sidebar] Page content is missing from pageData!');
    }
    
    // Add metadata about the page content
    if (pageData.metaKeywords) {
      context += `Keywords: ${pageData.metaKeywords}\n`;
    }
  } else {
    console.warn('[Sidebar] No valid webpage context available');
  }
  
  // Create prompt for Ollama
  let prompt = message;
  if (hasValidContext && context) {
    prompt = `The following is information about the current webpage:\n${context}\n\nUser question: ${message}`;
  } else {
    // Add a note in the UI that we're operating without webpage context
    const noticeEl = document.createElement('div');
    noticeEl.className = 'context-notice warning';
    noticeEl.innerHTML = '<i>Note: No webpage context available for this question</i>';
    chatMessages.appendChild(noticeEl);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // Use a simple prompt without webpage context
    prompt = `User question: ${message}`;
  }
  

  
  // Add AI thinking message
  const thinkingId = 'thinking-' + Date.now();
  addThinkingMessage(thinkingId);
  
  try {
    // Remove thinking message before starting streaming response
    removeThinkingMessage(thinkingId);
    
    // Send request to Ollama via background script
    // The response will be streamed and displayed incrementally
    const response = await sendToOllama(prompt);
    
    // The message is already in the UI due to streaming
    // Just save to chat history
    chatHistory.push({ role: 'user', content: message });
    chatHistory.push({ role: 'assistant', content: response });
  } catch (error) {
    // Remove thinking message and show error
    removeThinkingMessage(thinkingId);
    addMessageToChat('assistant', `Error: ${error.message}. Please check if Ollama is running.`);
  }
}

// Add a message to the chat UI
function addMessageToChat(role, content, messageId = null) {
  // Create a unique ID if not provided
  const id = messageId || `msg-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  
  // Check if the message already exists (for streaming updates)
  let messageDiv = document.getElementById(id);
  
  // If the message doesn't exist, create it
  if (!messageDiv) {
    messageDiv = document.createElement('div');
    messageDiv.id = id;
    messageDiv.classList.add('message', `${role}-message`);
    
    // Add metadata for assistant messages when they're new
    if (role === 'assistant' && !messageId) {
      // Check if we're using webpage context
      const hasContext = pageData && 
                        !pageData.url.includes('chrome-extension://') && 
                        pageData.content && 
                        pageData.content.length > 0;
                        
      if (hasContext) {
        const metaDiv = document.createElement('div');
        metaDiv.className = 'message-meta';
        metaDiv.innerHTML = `<small>Using context from: ${pageData.title}</small>`;
        messageDiv.appendChild(metaDiv);
      }
    }
    
    chatMessages.appendChild(messageDiv);
  }
  
  // Convert markdown-like text to HTML (simple version)
  const formattedContent = content
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');
  
  messageDiv.innerHTML = formattedContent;
  chatMessages.scrollTop = chatMessages.scrollHeight;
  
  return id;
}

// Add a "thinking" message with animation
function addThinkingMessage(id) {
  const messageDiv = document.createElement('div');
  messageDiv.classList.add('message', 'thinking-message');
  messageDiv.id = id;
  
  // Create animated dots for thinking indicator
  messageDiv.innerHTML = 'Thinking<span class="dots"><span>.</span><span>.</span><span>.</span></span>';
  
  chatMessages.appendChild(messageDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Remove a thinking message
function removeThinkingMessage(id) {
  const thinkingMessage = document.getElementById(id);
  if (thinkingMessage) {
    thinkingMessage.remove();
  }
}

// Setup listener for streaming updates from the background script
function setupStreamListener() {
  if (!window.streamListenerSetup) {
    console.log('[Sidebar] Setting up stream listener');
    
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'streamUpdate') {
        console.log('[Sidebar] Stream update received', {
          responseId: message.responseId,
          textLength: message.text.length,
          done: message.done
        });
        
        // Update the message with the streaming content
        if (window.activeStreamResponses && window.activeStreamResponses[message.responseId]) {
          const { messageId } = window.activeStreamResponses[message.responseId];
          addMessageToChat('assistant', message.text, messageId);
          
          // If the stream is done, clean up the tracking
          if (message.done) {
            console.log('[Sidebar] Stream completed for', message.responseId);
            window.activeStreamResponses[message.responseId].resolve(message.text);
            delete window.activeStreamResponses[message.responseId];
          }
        } else {
          console.warn('[Sidebar] Received stream update for unknown response ID:', message.responseId);
        }
        
        // We must return true to indicate we want to send a response asynchronously
        return true;
      }
    });
    
    window.streamListenerSetup = true;
    window.activeStreamResponses = {};
  }
}

// Send a message to Ollama API via background script
async function sendToOllama(prompt) {
  console.log('[Sidebar] Sending request to Ollama with prompt length:', prompt.length);
  
  // Ensure stream listener is setup
  setupStreamListener();
  
  // Generate a unique response ID for this request
  const responseId = `resp-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  
  return new Promise((resolve, reject) => {
    // Create a temporary assistant message that will be updated by the stream
    const messageId = addMessageToChat('assistant', '');
    
    // Track this stream response
    if (!window.activeStreamResponses) window.activeStreamResponses = {};
    window.activeStreamResponses[responseId] = {
      messageId,
      resolve,
      reject
    };
    
    // Send request to background with streaming info
    chrome.runtime.sendMessage(
      {
        action: 'ollama',
        data: {
          model: ollamaSettings.model,
          prompt: prompt,
          system: ollamaSettings.systemPrompt,
          stream: true,
          streamResponsePort: true,
          responseId: responseId
        }
      },
      function(response) {
        if (chrome.runtime.lastError) {
          console.error('[Sidebar] Runtime error when sending to Ollama:', chrome.runtime.lastError);
          delete window.activeStreamResponses[responseId];
          reject(new Error(chrome.runtime.lastError.message));
        } else if (!response || !response.success) {
          console.error('[Sidebar] API error from Ollama:', response?.error);
          delete window.activeStreamResponses[responseId];
          reject(new Error(response?.error || 'Unknown error'));
        } else {
          console.log('[Sidebar] Initial response received');
          // The actual stream content will be handled by the message listener
          // If streaming fails, resolve with the regular response
          if (!window.activeStreamResponses[responseId]) {
            console.log('[Sidebar] Stream response was already handled');
            resolve(response.data.response);
          }
        }
      }
    );
  });
}

// Add animation style for loading indicators if needed
function addLoadingAnimationStyle() {
  if (!document.getElementById('loading-animation-style')) {
    const style = document.createElement('style');
    style.id = 'loading-animation-style';
    style.textContent = `
      .loading-indicator { display: flex; align-items: center; color: #666; }
      .dots { display: inline-flex; }
      .dots span { animation: dot-pulse 1.5s infinite; animation-fill-mode: both; margin-left: 2px; }
      .dots span:nth-child(2) { animation-delay: 0.2s; }
      .dots span:nth-child(3) { animation-delay: 0.4s; }
      @keyframes dot-pulse {
        0%, 80%, 100% { opacity: 0; }
        40% { opacity: 1; }
      }
    `;
    document.head.appendChild(style);
    console.log('[Sidebar] Added loading animation style');
  }
}

// Populate the forms panel with detected forms
function populateFormsPanel(forms) {
  if (!forms || forms.length === 0) {
    formsList.innerHTML = '<div class="no-forms">No forms detected on this page</div>';
    return;
  }
  
  formsList.innerHTML = '';
  
  forms.forEach((form, index) => {
    const formItem = document.createElement('div');
    formItem.classList.add('form-item');
    formItem.dataset.formIndex = index;
    
    const title = document.createElement('h3');
    title.textContent = `Form ${index + 1}: ${form.id}`;
    
    const inputsList = document.createElement('ul');
    inputsList.classList.add('inputs-list');
    
    form.inputs.forEach(input => {
      const inputItem = document.createElement('li');
      inputItem.textContent = `${input.label || input.name || input.id || 'Unnamed input'} (${input.type})`;
      inputsList.appendChild(inputItem);
    });
    
    formItem.appendChild(title);
    formItem.appendChild(inputsList);
    
    // Add click handler to select this form
    formItem.addEventListener('click', function() {
      document.querySelectorAll('.form-item').forEach(item => item.classList.remove('selected'));
      this.classList.add('selected');
      formData.dataset.selectedForm = this.dataset.formIndex;
    });
    
    formsList.appendChild(formItem);
  });
}

// Handle form filling request
async function handleFormFill() {
  const selectedFormIndex = formData.dataset.selectedForm;
  const userFormData = formData.value.trim();
  
  if (!selectedFormIndex) {
    alert('Please select a form first');
    return;
  }
  
  if (!userFormData) {
    alert('Please enter form data');
    return;
  }
  
  // Get the selected form
  const form = pageData.forms[selectedFormIndex];
  if (!form) return;
  
  try {
    // First try to parse as JSON
    let parsedData;
    try {
      parsedData = JSON.parse(userFormData);
    } catch (e) {
      // If not valid JSON, ask Ollama to interpret the user's description
      const formInfo = JSON.stringify(form);
      const prompt = `I need to fill a form with the following fields:
${formInfo}

The user has provided this description of the data to fill:
"${userFormData}"

Please convert this description into a valid JSON object that matches the form fields. For each field, provide a key-value pair where the key is either the name or id of the input. If a field is not mentioned, leave it out or set it to null.

Respond with ONLY the JSON object and nothing else.`;
      
      const response = await sendToOllama(prompt);
      
      // Try to extract JSON from the response
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) || 
                        response.match(/```\s*([\s\S]*?)\s*```/) ||
                        response.match(/(\{[\s\S]*\})/);
      
      if (jsonMatch && jsonMatch[1]) {
        try {
          parsedData = JSON.parse(jsonMatch[1].trim());
        } catch (e) {
          throw new Error('Could not parse the AI-generated JSON');
        }
      } else {
        throw new Error('AI did not generate valid JSON');
      }
    }
    
    // Generate the form-filling script
    const script = generateFormFillScript(form, parsedData);
    
    // Send to content script for execution
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'executeScript',
        script: script,
        data: parsedData
      }, function(response) {
        if (chrome.runtime.lastError) {
          alert('Error: ' + chrome.runtime.lastError.message);
        } else if (response && response.success) {
          alert('Form filled successfully!');
        } else {
          alert('Error filling form: ' + (response?.error || 'Unknown error'));
        }
      });
    });
  } catch (error) {
    alert('Error: ' + error.message);
  }
}

// Generate a script to fill a form
function generateFormFillScript(form, data) {
  return `
    // Find the form
    let targetForm = document.forms['${form.id}'];
    if (!targetForm && '${form.id}'.startsWith('form-')) {
      // Try to find by index
      const formIndex = parseInt('${form.id}'.replace('form-', ''));
      if (!isNaN(formIndex) && formIndex >= 0 && formIndex < document.forms.length) {
        targetForm = document.forms[formIndex];
      }
    }
    
    if (!targetForm) {
      throw new Error('Form not found');
    }
    
    // Fill the form fields
    Object.keys(data).forEach(key => {
      // Skip null/undefined values
      if (data[key] === null || data[key] === undefined) return;
      
      // Try to find the input by name or id
      let input = targetForm.elements[key] || 
                  targetForm.querySelector(\`[name="\${key}"]\`) || 
                  targetForm.querySelector(\`#\${key}\`);
      
      if (!input) {
        // Try case-insensitive matching for labels
        const labels = Array.from(targetForm.querySelectorAll('label'));
        for (const label of labels) {
          if (label.textContent.toLowerCase().includes(key.toLowerCase())) {
            const inputId = label.getAttribute('for');
            if (inputId) {
              input = targetForm.querySelector(\`#\${inputId}\`);
              if (input) break;
            }
          }
        }
      }
      
      if (input) {
        const value = data[key];
        
        switch (input.type) {
          case 'checkbox':
            input.checked = !!value;
            break;
          case 'radio':
            // Find radio button with matching value
            const radioGroup = targetForm.querySelectorAll(\`[name="\${input.name}"]\`);
            radioGroup.forEach(radio => {
              if (radio.value === value.toString()) {
                radio.checked = true;
              }
            });
            break;
          case 'select-one':
          case 'select-multiple':
            // Handle select dropdowns
            Array.from(input.options).forEach(option => {
              if (option.value === value.toString() || option.text === value.toString()) {
                option.selected = true;
              }
            });
            break;
          default:
            // Text inputs, textareas, etc.
            input.value = value;
            break;
        }
        
        // Trigger change event
        const event = new Event('change', { bubbles: true });
        input.dispatchEvent(event);
        
        // For inputs that need user typing simulation, also trigger input event
        if (input.type === 'text' || input.type === 'textarea' || input.type === 'password' || input.type === 'email') {
          const inputEvent = new Event('input', { bubbles: true });
          input.dispatchEvent(inputEvent);
        }
      }
    });
    
    return true;
  `;
}
