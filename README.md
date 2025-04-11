# Ollama Web Assistant Chrome Extension

A Chrome extension that integrates with Ollama to provide AI assistance directly in your browser. This extension can summarize webpages, answer questions about page content, and help fill out forms automatically.

## Features

- **Page Summarization**: Get quick summaries of any webpage you're viewing
- **AI Chat**: Chat with Ollama about the current webpage or any topic
- **Form Filling**: Automatically fill out forms on websites using AI assistance
- **Side Panel Integration**: Access all features from Chrome's side panel without leaving the webpage

## Requirements

- [Ollama](https://ollama.com/) installed and running on your computer
- Chrome browser (version 88 or newer)

## Installation

1. Download and extract this extension
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" using the toggle in the top-right corner
4. Click "Load unpacked" and select the extracted extension folder
5. The extension icon should now appear in your Chrome toolbar

## Setup

1. Make sure Ollama is installed and running on your computer
2. By default, the extension connects to Ollama at `http://localhost:11434`
3. Click the extension icon and then the "Settings" button to configure:
   - Ollama Host URL (default: http://localhost:11434)
   - Model to use (default: deepseek-r1:8b)
   - System prompt for the AI

## Usage

### Summarize Webpage
1. Navigate to any webpage you want to summarize
2. Click the extension icon in the toolbar
3. Click "Summarize Page"
4. The side panel will open with a summary and key points from the page

### Chat with AI
1. Click the extension icon in the toolbar
2. Click "Open AI Chat"
3. The side panel will open with a chat interface
4. Type your questions about the webpage or any other topic

### Fill Forms
1. Navigate to a webpage with forms
2. Open the side panel using the extension
3. Click the "Form Fill" tab
4. Select the form you want to fill
5. Enter data description or JSON data
6. Click "Fill Form" to automatically complete the form

## How It Works

1. The extension extracts content from webpages you visit
2. It uses Ollama's local AI models to process and understand the content
3. All processing happens locally on your machine for privacy

## Troubleshooting

- **Extension not connecting to Ollama**: Make sure Ollama is running on your computer and the host URL is correctly set in the extension settings
- **AI responses are slow**: Try using a smaller model in the settings
- **Form filling not working**: Some websites use complex JavaScript forms that may not be fully compatible with the form filling feature

## Privacy

All processing is done locally on your machine. Your data doesn't leave your computer as Ollama runs locally.
