document.addEventListener('DOMContentLoaded', function() {
  console.log('[Popup] DOM loaded');
  
  const summarizeBtn = document.getElementById('summarize-btn');
  const openSidebarBtn = document.getElementById('open-sidebar-btn');
  const settingsBtn = document.getElementById('settings-btn');
  const statusMessage = document.getElementById('status-message');

  if (!summarizeBtn || !openSidebarBtn || !settingsBtn || !statusMessage) {
    console.error('[Popup] Failed to find one or more UI elements!', {
      summarizeBtn: !!summarizeBtn,
      openSidebarBtn: !!openSidebarBtn,
      settingsBtn: !!settingsBtn,
      statusMessage: !!statusMessage
    });
  } else {
    console.log('[Popup] All UI elements found successfully');
  }

  // Get Ollama API settings from storage
  chrome.storage.sync.get({
    ollamaHost: 'http://localhost:11434',
    ollamaModel: 'deepseek-r1:8b'
  }, function(items) {
    // Make Ollama settings available in popup scope
    window.ollamaSettings = items;
    console.log('[Popup] Loaded settings from storage:', items);
  });

  // Summarize the current page
  summarizeBtn.addEventListener('click', function() {
    console.log('[Popup] Summarize button clicked');
    statusMessage.textContent = 'Summarizing page...';
    
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (!tabs || tabs.length === 0) {
        console.error('[Popup] No active tab found');
        statusMessage.textContent = 'Error: No active tab.';
        return;
      }
      
      console.log('[Popup] Sending summarize message to tab:', tabs[0].id);
      chrome.tabs.sendMessage(tabs[0].id, {action: 'summarize'}, function(response) {
        if (chrome.runtime.lastError) {
          console.error('[Popup] Error sending message to content script:', chrome.runtime.lastError);
          statusMessage.textContent = 'Error: Could not access page content. ' + chrome.runtime.lastError.message;
          return;
        }
        
        if (!response) {
          console.error('[Popup] No response from content script');
          statusMessage.textContent = 'Error: No response from page content script.';
          return;
        }
        
        console.log('[Popup] Received response from content script:', response);
        console.log('[Popup] Opening sidebar with summary mode');
        
        // Open the sidebar with the summary
        chrome.runtime.sendMessage({
          action: 'openSidebar',
          mode: 'summarize'
        }, function(response) {
          if (chrome.runtime.lastError) {
            console.error('[Popup] Error opening sidebar:', chrome.runtime.lastError);
          } else {
            console.log('[Popup] Sidebar opened successfully:', response);
          }
        });
        
        window.close();
      });
    });
  });

  // Open the AI chat sidebar
  openSidebarBtn.addEventListener('click', function() {
    console.log('[Popup] Open AI Chat button clicked');
    statusMessage.textContent = 'Opening AI Chat...';
    
    // Get the current tab and extract content first
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (!tabs || tabs.length === 0) {
        console.error('[Popup] No active tab found');
        statusMessage.textContent = 'Error: No active tab.';
        return;
      }
      
      const activeTab = tabs[0];
      
      // Skip content extraction for chrome:// and extension:// URLs or about: pages
      if (activeTab.url.startsWith('chrome://') || 
          activeTab.url.startsWith('chrome-extension://') ||
          activeTab.url.startsWith('about:')) {
        console.log('[Popup] Skipping content extraction for special URL:', activeTab.url);
        
        // Open sidebar without content
        chrome.runtime.sendMessage({
          action: 'openSidebar',
          mode: 'chat'
        }, response => {
          if (chrome.runtime.lastError) {
            console.error('[Popup] Error opening sidebar:', chrome.runtime.lastError);
          } else {
            console.log('[Popup] Sidebar opened successfully without page content');
            window.close();
          }
        });
        return;
      }
      
      console.log('[Popup] Extracting content from tab:', activeTab.id);
      
      // First, check if we need to inject the content script
      const injectContentScript = () => {
        console.log('[Popup] Injecting content script to tab:', activeTab.id);
        statusMessage.textContent = 'Preparing content extraction...';
        
        chrome.scripting.executeScript({
          target: {tabId: activeTab.id},
          files: ['content.js']
        }, () => {
          if (chrome.runtime.lastError) {
            console.error('[Popup] Error injecting content script:', chrome.runtime.lastError);
            statusMessage.textContent = 'Error: Could not access page content. Opening sidebar without context...';
            
            // Still open sidebar without content
            setTimeout(() => {
              chrome.runtime.sendMessage({
                action: 'openSidebar',
                mode: 'chat'
              }, () => { window.close(); });
            }, 1000);
            return;
          }
          
          console.log('[Popup] Content script injected successfully, now extracting content');
          extractContentAndOpenSidebar();
        });
      };
      
      // Try to message the content script - if it fails, we'll inject it
      chrome.tabs.sendMessage(activeTab.id, {action: 'ping'}, function(pingResponse) {
        if (chrome.runtime.lastError) {
          console.log('[Popup] Content script not loaded yet, injecting it');
          injectContentScript();
        } else {
          console.log('[Popup] Content script already loaded, proceeding with extraction');
          extractContentAndOpenSidebar();
        }
      });
      
      // Function to extract content and open sidebar
      const extractContentAndOpenSidebar = () => {
        // Extract the webpage content
        chrome.tabs.sendMessage(activeTab.id, {action: 'extractContent'}, function(response) {
          if (chrome.runtime.lastError) {
            console.error('[Popup] Error sending message to content script:', chrome.runtime.lastError);
            statusMessage.textContent = 'Error getting page content. Opening sidebar without context...';
            
            // Still open the sidebar even if content extraction fails
            setTimeout(() => {
              chrome.runtime.sendMessage({
                action: 'openSidebar',
                mode: 'chat'
              }, () => {
                window.close();
              });
            }, 1000);
            return;
          }
          
          if (!response || !response.success) {
            console.error('[Popup] Content extraction failed or returned invalid response:', response);
            statusMessage.textContent = 'Content extraction failed. Opening sidebar without context...';
            
            // Still open the sidebar even if content extraction fails
            setTimeout(() => {
              chrome.runtime.sendMessage({
                action: 'openSidebar',
                mode: 'chat'
              }, () => {
                window.close();
              });
            }, 1000);
            return;
          }
          
          console.log('[Popup] Successfully extracted page content, size:', 
                    JSON.stringify(response.pageContent).length);
          
          // Open the sidebar with the extracted content
          chrome.runtime.sendMessage({
            action: 'openSidebar',
            mode: 'chat',
            pageContent: response.pageContent
          }, function(response) {
            if (chrome.runtime.lastError) {
              console.error('[Popup] Error opening sidebar:', chrome.runtime.lastError);
              statusMessage.textContent = 'Error opening sidebar: ' + chrome.runtime.lastError.message;
            } else {
              console.log('[Popup] Sidebar open request sent with page content:', response);
              window.close();
            }
          });
        });
      };
    });
  });

  // Open settings page
  settingsBtn.addEventListener('click', function() {
    console.log('[Popup] Settings button clicked');
    
    chrome.runtime.sendMessage({action: 'openSettings'}, function(response) {
      if (chrome.runtime.lastError) {
        console.error('[Popup] Error opening settings:', chrome.runtime.lastError);
        statusMessage.textContent = 'Error opening settings: ' + chrome.runtime.lastError.message;
      } else {
        console.log('[Popup] Settings page opened successfully:', response);
        window.close();
      }
    });
  });
  
  console.log('[Popup] Initialization complete');
});
