// Initialize default settings when extension is installed
chrome.runtime.onInstalled.addListener(function() {
  console.log('[Background] Extension installed/updated, initializing default settings');
  chrome.storage.sync.set({
    ollamaHost: 'http://localhost:11434',
    ollamaModel: 'deepseek-r1:8b',
    systemPrompt: 'You are a helpful AI assistant integrated into a browser extension.'
  }, function() {
    if (chrome.runtime.lastError) {
      console.error('[Background] Error saving default settings:', chrome.runtime.lastError);
    } else {
      console.log('[Background] Default settings saved successfully');
    }
  });
});

// Debug log when background script loads
console.log('[Background] Background script initialized at', new Date().toISOString());

// Track sidebar state for each tab
let sidebarStates = {};

// Handle extension icon click to toggle sidebar
chrome.action.onClicked.addListener(function(tab) {
  console.log('[Background] Extension icon clicked for tab:', tab.id);
  
  // Chrome doesn't provide a direct way to close the sidePanel,
  // we can only open it. The panel has its own close button.
  // Just always open it and track state ourselves.
  
  // Set chat as the default mode when opening from icon click
  console.log('[Background] Setting chat as default mode');
  chrome.storage.session.set({ sidebarMode: 'chat' }, function() {
    if (chrome.runtime.lastError) {
      console.error('[Background] Error setting sidebar mode:', chrome.runtime.lastError);
    } else {
      console.log('[Background] Sidebar mode set to chat');
    }
  });
  
  // Open the sidebar
  console.log('[Background] Opening sidebar for tab:', tab.id);
  chrome.sidePanel.open({tabId: tab.id});
  
  // Update our state tracking
  sidebarStates[tab.id] = true;
});

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  console.log('[Background] Message received:', request.action, request);
  console.log('[Background] Sender:', sender);
  
  if (request.action === 'openSidebar') {
    console.log('[Background] Processing openSidebar request with mode:', request.mode);
    
    // Open the sidebar and set the mode (summarize or chat)
    chrome.storage.session.set({ sidebarMode: request.mode }, function() {
      if (chrome.runtime.lastError) {
        console.error('[Background] Error setting sidebar mode:', chrome.runtime.lastError);
      } else {
        console.log('[Background] Sidebar mode set successfully:', request.mode);
      }
    });
    
    // If we have a pageContent for summarization, store it
    if (request.pageContent) {
      const contentLength = request.pageContent.content ? request.pageContent.content.length : 0;
      console.log('[Background] Storing page content in session storage, content length:', contentLength, 'URL:', request.pageContent.url);
      
      // Log detailed content info for debugging
      console.log('[Background] Page content details:', {
        url: request.pageContent.url,
        title: request.pageContent.title,
        hasMetaDescription: !!request.pageContent.metaDescription,
        contentLength: contentLength,
        formCount: request.pageContent.forms ? request.pageContent.forms.length : 0
      });
      
      // Store the entire pageContent object
      chrome.storage.session.set({ pageContent: request.pageContent }, function() {
        if (chrome.runtime.lastError) {
          console.error('[Background] Error storing page content:', chrome.runtime.lastError);
        } else {
          // Verify the stored content by retrieving it right away
          chrome.storage.session.get(['pageContent'], function(result) {
            if (chrome.runtime.lastError) {
              console.error('[Background] Error verifying stored content:', chrome.runtime.lastError);
            } else if (result.pageContent) {
              const storedContentLength = result.pageContent.content ? result.pageContent.content.length : 0;
              console.log('[Background] Verified stored content length:', storedContentLength);
              if (storedContentLength !== contentLength) {
                console.warn('[Background] Stored content length mismatch! Original:', contentLength, 'Stored:', storedContentLength);
              }
            } else {
              console.warn('[Background] Failed to verify stored content - pageContent not found');
            }
          });
          console.log('[Background] Page content stored successfully');
        }
      });
    } else {
      console.warn('[Background] No page content provided with openSidebar action');
    }
    
    // Check if chrome.sidePanel API is available
    if (!chrome.sidePanel) {
      console.error('[Background] chrome.sidePanel API is not available. This requires Chrome 114+ and the sidePanel permission.');
      sendResponse({success: false, error: 'Side panel API not available'});
      return;
    }
    
    // Open the sidebar
    console.log('[Background] Attempting to open side panel');
    
    // Get current tab ID and open side panel specifically for that tab
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (!tabs || tabs.length === 0) {
        console.error('[Background] No active tab found');
        sendResponse({success: false, error: 'No active tab found'});
        return;
      }
      
      const tabId = tabs[0].id;
      console.log('[Background] Found active tab with ID:', tabId);
      
      try {
        // Open side panel with the tab ID
        console.log('[Background] Opening side panel for tab', tabId);
        chrome.sidePanel.open({tabId: tabId});
        
        // Log confirmation of page content status
        chrome.storage.session.get(['pageContent'], function(result) {
          if (result.pageContent) {
            const contentLength = result.pageContent.content ? result.pageContent.content.length : 0;
            console.log('[Background] Sidebar opened with page content available, length:', contentLength);
          } else {
            console.warn('[Background] Sidebar opened but NO page content is available in storage');
          }
        });
        
        console.log('[Background] Side panel opened successfully for tab', tabId);
        sendResponse({success: true});
      } catch (error) {
        console.error('[Background] Error opening side panel:', error);
        
        try {
          // Last resort - try setting options first, then opening
          console.log('[Background] Trying with setOptions first');
          chrome.sidePanel.setOptions({path: 'sidebar.html'}, function() {
            console.log('[Background] Side panel options set');
            
            // After setting options, open the panel with tab ID
            try {
              chrome.sidePanel.open({tabId: tabId});
              console.log('[Background] Side panel opened after setting options');
              sendResponse({success: true});
            } catch (finalError) {
              console.error('[Background] Failed to open after setOptions:', finalError);
              sendResponse({success: false, error: finalError.message});
            }
          });
        } catch (error3) {
          console.error('[Background] All side panel open methods failed:', error3);
          sendResponse({success: false, error: error3.message});
        }
      }
    });
    
    // Return true to indicate we'll call sendResponse asynchronously
    return true;
    
  } else if (request.action === 'openSettings') {
    console.log('[Background] Opening settings page');
    // Open the settings page
    chrome.tabs.create({url: 'settings.html'}, function(tab) {
      if (chrome.runtime.lastError) {
        console.error('[Background] Error opening settings page:', chrome.runtime.lastError);
        sendResponse({success: false, error: chrome.runtime.lastError.message});
      } else {
        console.log('[Background] Settings page opened successfully:', tab);
        sendResponse({success: true, tab: tab});
      }
    });
    return true; // Keep the message channel open for async response
    
  } else if (request.action === 'ollama') {
    console.log('[Background] Processing Ollama API request');
    // Proxy requests to Ollama API
    handleOllamaRequest(request.data)
      .then(data => {
        console.log('[Background] Ollama API request successful');
        sendResponse({success: true, data: data});
      })
      .catch(error => {
        console.error('[Background] Ollama API request failed:', error);
        sendResponse({success: false, error: error.message});
      });
    return true; // Required to use sendResponse asynchronously
  } else {
    console.warn('[Background] Unknown action received:', request.action);
    sendResponse({success: false, error: 'Unknown action'});
  }
});

// Helper function to check Ollama server health
async function checkOllamaHealth(host) {
  console.log('[Background] Checking Ollama health at:', host);
  try {
    const response = await fetch(`${host}/api/tags`, {
      method: 'GET',
      headers: {'Accept': 'application/json'},
      mode: 'cors'
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('[Background] Ollama server is healthy, available models:', data);
      return {
        healthy: true,
        models: data.models ? data.models.map(m => m.name).join(', ') : 'unknown'
      };
    } else {
      console.error('[Background] Ollama health check failed with status:', response.status);
      return { healthy: false, status: response.status };
    }
  } catch (error) {
    console.error('[Background] Ollama health check error:', error);
    return { healthy: false, error: error.message };
  }
}

// Helper function to interact with Ollama API
async function handleOllamaRequest(requestData) {
  console.log('[Background] Handling Ollama API request:', requestData);
  try {
    // Get Ollama settings
    console.log('[Background] Retrieving Ollama settings from storage');
    const settings = await new Promise(resolve => {
      chrome.storage.sync.get({
        ollamaHost: 'http://localhost:11434',
        ollamaModel: 'deepseek-r1:8b'
      }, function(items) {
        if (chrome.runtime.lastError) {
          console.error('[Background] Error retrieving Ollama settings:', chrome.runtime.lastError);
        } else {
          console.log('[Background] Retrieved Ollama settings:', items);
        }
        resolve(items);
      });
    });
    
    // Check Ollama health first
    const healthCheck = await checkOllamaHealth(settings.ollamaHost);
    console.log('[Background] Ollama health check result:', healthCheck);
    
    if (!healthCheck.healthy) {
      throw new Error(`Ollama server health check failed: ${healthCheck.error || 'Server unavailable'}. Make sure Ollama is running.`);
    }
    
    // Set the model from our settings if not specified
    if (!requestData.model) {
      requestData.model = settings.ollamaModel;
      console.log('[Background] Using model from settings:', requestData.model);
    }
    
    // Validate Ollama host URL
    if (!settings.ollamaHost) {
      console.error('[Background] Ollama host URL is empty');
      throw new Error('Ollama host URL is not configured');
    }
    
    // Check if we should use streaming mode
    const useStreaming = requestData.stream === true;
    console.log('[Background] Using streaming mode:', useStreaming);
    
    // Prepare request data
    let apiEndpoint = '/api/generate';
    let apiData = {
      model: requestData.model,
      prompt: requestData.prompt || (requestData.messages ? requestData.messages[requestData.messages.length - 1].content : ''),
      system: requestData.system || 'You are a helpful AI assistant integrated into a browser extension.',
      stream: useStreaming
    };

    console.log('[Background] Using API request format:', apiData);

    const apiUrl = `${settings.ollamaHost}${apiEndpoint}`;
    console.log('[Background] Making request to Ollama API:', apiUrl);
    
    // Make request to Ollama API
    try {
      console.log('[Background] Sending request to Ollama:', JSON.stringify(apiData));
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        mode: 'cors',
        credentials: 'omit',
        body: JSON.stringify(apiData)
      });
      
      console.log('[Background] Ollama API response status:', response.status);
      // Log response headers to check for CORS issues
console.log('[Background] Response headers:', {
  'Access-Control-Allow-Origin': response.headers.get('Access-Control-Allow-Origin'),
  'Access-Control-Allow-Methods': response.headers.get('Access-Control-Allow-Methods'),
  'Access-Control-Allow-Headers': response.headers.get('Access-Control-Allow-Headers')
});
      if (!response.ok) {
        let errorMessage = `Ollama API error: ${response.status}`;
        try {
          const errorText = await response.text();
          console.error('[Background] Ollama API error response:', errorText);
          errorMessage += ` ${errorText}`;
        } catch (e) {
          console.error('[Background] Could not read error response text');
        }
        
        if (response.status === 403) {
          errorMessage = `Ollama API access forbidden (403). Possible causes:\n` +
                        `1. The model '${apiData.model}' may not be installed\n` +
                        `2. CORS restrictions may be preventing access\n` +
                        `3. Ollama may need to be restarted\n` +
                        `Try running 'ollama pull ${apiData.model}' in your terminal`;
        } else if (response.status === 404) {
          errorMessage = `Model not found. Please run 'ollama pull ${apiData.model}' in your terminal`;
        }
        
        throw new Error(errorMessage);
      }
      
      // Handle streaming response
      if (useStreaming) {
        console.log('[Background] Processing streaming response');
        
        // Check if we have a port to communicate with the sender
        const hasResponsePort = requestData.streamResponsePort;
        if (hasResponsePort) {
          console.log('[Background] Stream will use direct port communication');
        } else {
          console.log('[Background] Stream using regular response');
        }
        
        const reader = response.body.getReader();
        let fullText = '';
        let lastUpdateTime = Date.now();
        const UPDATE_INTERVAL_MS = 100; // Throttle updates to avoid overwhelming the UI
        
        // Process stream in chunks
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          // Convert bytes to text
          const chunk = new TextDecoder().decode(value);
          console.log('[Background] Stream chunk received:', chunk.length, 'bytes');
          
          // Split by newlines to get JSON objects
          const lines = chunk.split('\n').filter(line => line.trim() !== '');
          let newTextAdded = false;
          
          for (const line of lines) {
            try {
              const data = JSON.parse(line);
              if (data.response) {
                fullText += data.response;
                newTextAdded = true;
              }
            } catch (e) {
              console.error('[Background] Error parsing JSON from stream:', e, line);
            }
          }
          
          // Send incremental updates to UI if text was added and enough time has passed
          const now = Date.now();
          if (newTextAdded && (now - lastUpdateTime > UPDATE_INTERVAL_MS) && hasResponsePort) {
            console.log('[Background] Sending incremental update, length:', fullText.length);
            try {
              // Use runtime.sendMessage instead of tabs.sendMessage for sidepanel
              chrome.runtime.sendMessage({
                action: 'streamUpdate',
                responseId: requestData.responseId,
                text: fullText,
                done: false
              }).catch(err => {
                // This is expected sometimes if the sidebar isn't open
                console.log('[Background] Sidebar might not be ready:', err.message);
              });
              lastUpdateTime = now;
            } catch (err) {
              console.error('[Background] Error sending incremental update:', err);
            }
          }
        }
        
        // Send final completed message
        if (hasResponsePort) {
          console.log('[Background] Sending final stream update, complete');
          try {
            // Use runtime.sendMessage for sidepanel communication
            chrome.runtime.sendMessage({
              action: 'streamUpdate',
              responseId: requestData.responseId,
              text: fullText,
              done: true
            }).catch(err => {
              // This is expected sometimes if the sidebar isn't open
              console.log('[Background] Sidebar might not be ready for final update:', err.message);
            });
          } catch (err) {
            console.error('[Background] Error sending final update:', err);
          }
        }
        
        console.log('[Background] Stream completed, full response length:', fullText.length);
        return { response: fullText };
      } else {
        // Handle regular response
        const responseData = await response.json();
        console.log('[Background] Ollama API response received successfully');
        return responseData;
      }
    } catch (fetchError) {
      console.error('[Background] Fetch error:', fetchError);
      // Check if it's a network error (likely Ollama not running)
      if (fetchError.message.includes('Failed to fetch') || 
          fetchError.message.includes('NetworkError')) {
        throw new Error(`Cannot connect to Ollama at ${settings.ollamaHost}. Is Ollama running?`);
      }
      throw fetchError;
    }
  } catch (error) {
    console.error('[Background] Ollama request failed:', error);
    throw error;
  }
}
