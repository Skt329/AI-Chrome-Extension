document.addEventListener('DOMContentLoaded', function() {
  // DOM elements
  const ollamaHostInput = document.getElementById('ollama-host');
  const ollamaModelInput = document.getElementById('ollama-model');
  const systemPromptInput = document.getElementById('system-prompt');
  const testConnectionBtn = document.getElementById('test-connection-btn');
  const connectionStatus = document.getElementById('connection-status');
  const saveBtn = document.getElementById('save-btn');
  const resetBtn = document.getElementById('reset-btn');
  
  // Default settings
  const defaultSettings = {
    ollamaHost: 'http://localhost:11434',
    ollamaModel: 'deepseek-r1:8b',
    systemPrompt: 'You are a helpful AI assistant integrated into a browser extension.'
  };
  
  // Load saved settings
  loadSettings();
  
  // Event listeners
  testConnectionBtn.addEventListener('click', testConnection);
  saveBtn.addEventListener('click', saveSettings);
  resetBtn.addEventListener('click', resetSettings);
  
  // Load settings from storage
  function loadSettings() {
    chrome.storage.sync.get(defaultSettings, function(items) {
      ollamaHostInput.value = items.ollamaHost;
      ollamaModelInput.value = items.ollamaModel;
      systemPromptInput.value = items.systemPrompt;
    });
  }
  
  // Save settings to storage
  function saveSettings() {
    const settings = {
      ollamaHost: ollamaHostInput.value.trim(),
      ollamaModel: ollamaModelInput.value.trim(),
      systemPrompt: systemPromptInput.value.trim()
    };
    
    // Validate URL
    if (!settings.ollamaHost.startsWith('http://') && !settings.ollamaHost.startsWith('https://')) {
      alert('Ollama Host URL must start with http:// or https://');
      return;
    }
    
    // Remove trailing slash if present
    if (settings.ollamaHost.endsWith('/')) {
      settings.ollamaHost = settings.ollamaHost.slice(0, -1);
    }
    
    // Validate model name
    if (!settings.ollamaModel) {
      alert('Model name cannot be empty');
      return;
    }
    
    chrome.storage.sync.set(settings, function() {
      const status = document.createElement('div');
      status.textContent = 'Settings saved!';
      status.style.color = '#34a853';
      status.style.padding = '10px';
      status.style.textAlign = 'center';
      status.style.marginTop = '10px';
      
      const actions = document.querySelector('.actions');
      actions.appendChild(status);
      
      setTimeout(function() {
        status.remove();
      }, 2000);
    });
  }
  
  // Reset settings to defaults
  function resetSettings() {
    if (confirm('Reset all settings to default values?')) {
      ollamaHostInput.value = defaultSettings.ollamaHost;
      ollamaModelInput.value = defaultSettings.ollamaModel;
      systemPromptInput.value = defaultSettings.systemPrompt;
      
      saveSettings();
    }
  }
  
  // Test connection to Ollama
  async function testConnection() {
    const host = ollamaHostInput.value.trim();
    const model = ollamaModelInput.value.trim();
    
    if (!host) {
      alert('Please enter Ollama Host URL');
      return;
    }
    
    connectionStatus.textContent = 'Testing connection...';
    connectionStatus.className = '';
    
    try {
      // First, check if Ollama API is available
      const response = await fetch(`${host}/api/tags`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Status code: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Check if the specified model is available
      const modelExists = data.models && data.models.some(m => m.name === model);
      
      if (modelExists) {
        connectionStatus.textContent = `Connected successfully! Model '${model}' is available.`;
        connectionStatus.className = 'success';
      } else {
        // Model not found, but API is working
        connectionStatus.textContent = `Connected to Ollama, but model '${model}' was not found. Available models: ${data.models ? data.models.map(m => m.name).join(', ') : 'none'}`;
        connectionStatus.className = 'error';
      }
    } catch (error) {
      console.error('Connection test failed:', error);
      connectionStatus.textContent = `Connection failed: ${error.message}. Make sure Ollama is running.`;
      connectionStatus.className = 'error';
    }
  }
});
