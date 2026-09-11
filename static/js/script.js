/**
 * ============================================
 * EDIFY CHATBOT - ADVANCED JAVASCRIPT v4.0
 * Developed by: Sohani Iftikhar ✨
 * Full-featured chatbot with theme toggle,
 * chat history, file upload, and MCQ display
 * ============================================
 */

// ============================================
// CONSTANTS & CONFIGURATION
// ============================================

const CONFIG = {
    MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
    ALLOWED_EXTENSIONS: ['.pdf', '.docx', '.txt', '.md', '.rtf'],
    MAX_HISTORY: 100,
    API_TIMEOUT: 60000, // 60 seconds
    TYPING_DELAY: 800, // ms before showing typing
    STORAGE_KEY: 'edify_chat_history',
    THEME_KEY: 'edify_theme',
    MCQ_LABELS: ['A', 'B', 'C', 'D', 'E', 'F'],
};

// ============================================
// DOM CACHE
// ============================================

const DOM = {
    messagesContainer: document.getElementById('messagesContainer'),
    userInput: document.getElementById('userInput'),
    sendBtn: document.getElementById('sendBtn'),
    fileInput: document.getElementById('fileInput'),
    fileName: document.getElementById('fileName'),
    uploadProgress: document.getElementById('uploadProgress'),
    progressBar: document.querySelector('.progress-bar'),
    uploadStatus: document.getElementById('uploadStatus'),
    themeToggle: document.getElementById('themeToggle'),
    clearChatBtn: document.getElementById('clearChatBtn'),
    numQuestions: document.getElementById('numQuestions'),
    appWrapper: document.getElementById('appWrapper'),
};

// ============================================
// STATE MANAGEMENT
// ============================================

class State {
    constructor() {
        this.isProcessing = false;
        this.uploadedFile = null;
        this.conversationHistory = [];
        this.currentTheme = 'dark';
        this.isTyping = false;
        this.abortController = null;
    }

    reset() {
        this.isProcessing = false;
        this.uploadedFile = null;
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
    }

    addMessage(message) {
        this.conversationHistory.push(message);
        if (this.conversationHistory.length > CONFIG.MAX_HISTORY) {
            this.conversationHistory = this.conversationHistory.slice(-CONFIG.MAX_HISTORY);
        }
        this.saveHistory();
    }

    saveHistory() {
        try {
            localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(this.conversationHistory));
        } catch (e) {
            console.warn('Could not save history:', e);
        }
    }

    loadHistory() {
        try {
            const stored = localStorage.getItem(CONFIG.STORAGE_KEY);
            if (stored) {
                const history = JSON.parse(stored);
                if (Array.isArray(history) && history.length > 0) {
                    this.conversationHistory = history;
                    return true;
                }
            }
        } catch (e) {
            console.warn('Could not load history:', e);
        }
        return false;
    }

    clearHistory() {
        this.conversationHistory = [];
        localStorage.removeItem(CONFIG.STORAGE_KEY);
    }

    loadTheme() {
        const saved = localStorage.getItem(CONFIG.THEME_KEY);
        if (saved === 'light') {
            this.currentTheme = 'light';
            document.body.classList.add('light-mode');
            document.body.classList.remove('dark-mode');
        } else {
            this.currentTheme = 'dark';
            document.body.classList.add('dark-mode');
            document.body.classList.remove('light-mode');
        }
        this.updateThemeToggle();
    }

    toggleTheme() {
        const isLight = document.body.classList.contains('light-mode');
        if (isLight) {
            document.body.classList.remove('light-mode');
            document.body.classList.add('dark-mode');
            this.currentTheme = 'dark';
        } else {
            document.body.classList.remove('dark-mode');
            document.body.classList.add('light-mode');
            this.currentTheme = 'light';
        }
        localStorage.setItem(CONFIG.THEME_KEY, this.currentTheme);
        this.updateThemeToggle();
    }

    updateThemeToggle() {
        if (DOM.themeToggle) {
            const isLight = document.body.classList.contains('light-mode');
            DOM.themeToggle.setAttribute('aria-label', isLight ? 'Switch to dark mode' : 'Switch to light mode');
        }
    }
}

// Initialize state
const state = new State();

// ============================================
// MESSAGE RENDERER
// ============================================

class MessageRenderer {
    static createMessageElement(message) {
        const isUser = message.type === 'user';
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${isUser ? 'user-message' : 'bot-message'}`;
        msgDiv.setAttribute('role', 'article');
        msgDiv.setAttribute('aria-label', `${isUser ? 'User' : 'Edify'} message`);

        // Avatar
        const avatar = this.createAvatar(isUser);
        msgDiv.appendChild(avatar);

        // Bubble
        const bubble = this.createBubble(message);
        msgDiv.appendChild(bubble);

        // Animation delay for smooth entry
        msgDiv.style.animationDelay = '0.1s';

        return msgDiv;
    }

    static createAvatar(isUser) {
        const avatarDiv = document.createElement('div');
        avatarDiv.className = `avatar ${isUser ? 'user-avatar' : 'bot-avatar'}`;
        avatarDiv.setAttribute('aria-hidden', 'true');
        
        const icon = document.createElement('i');
        icon.className = isUser ? 'fas fa-user' : 'fas fa-robot';
        avatarDiv.appendChild(icon);
        
        return avatarDiv;
    }

    static createBubble(message) {
        const bubbleDiv = document.createElement('div');
        bubbleDiv.className = `bubble ${message.type === 'user' ? 'user-bubble' : 'bot-bubble'}`;

        // Message content
        const content = document.createElement('div');
        content.className = 'bubble-content';
        content.innerHTML = message.text;
        bubbleDiv.appendChild(content);

        // File info if present
        if (message.fileInfo) {
            const badge = this.createFileBadge(message.fileInfo);
            bubbleDiv.appendChild(badge);
        }

        // Footer with timestamp
        const footer = this.createFooter(message.timestamp, message.isError);
        bubbleDiv.appendChild(footer);

        // Error styling
        if (message.isError) {
            bubbleDiv.classList.add('error-bubble');
        }

        return bubbleDiv;
    }

    static createFileBadge(fileInfo) {
        const badge = document.createElement('div');
        badge.className = 'file-badge';
        badge.innerHTML = `<i class="fas fa-paperclip"></i> ${this.escapeHtml(fileInfo)}`;
        return badge;
    }

    static createFooter(timestamp, isError) {
        const footer = document.createElement('div');
        footer.className = 'bubble-footer';

        const timeSpan = document.createElement('span');
        timeSpan.className = 'timestamp';
        const date = new Date(timestamp);
        timeSpan.textContent = date.toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        footer.appendChild(timeSpan);

        const dot = document.createElement('span');
        dot.className = 'bubble-dot';
        dot.textContent = '•';
        footer.appendChild(dot);

        const status = document.createElement('span');
        status.className = 'bubble-status';
        status.textContent = isError ? 'error' : 'delivered';
        footer.appendChild(status);

        return footer;
    }

    static escapeHtml(html) {
        if (!html) return '';
        const div = document.createElement('div');
        div.textContent = html;
        return div.innerHTML;
    }

    static renderMessage(message) {
        const element = this.createMessageElement(message);
        DOM.messagesContainer.appendChild(element);
        this.scrollToBottom();
        return element;
    }

    static scrollToBottom() {
        if (DOM.messagesContainer) {
            requestAnimationFrame(() => {
                DOM.messagesContainer.scrollTop = DOM.messagesContainer.scrollHeight;
            });
        }
    }
}

// ============================================
// TYPING INDICATOR
// ============================================

class TypingIndicator {
    static show() {
        this.hide();
        
        const typingDiv = document.createElement('div');
        typingDiv.className = 'message bot-message typing-indicator-container';
        typingDiv.id = 'typingIndicator';
        typingDiv.setAttribute('role', 'status');
        typingDiv.setAttribute('aria-label', 'Edify is typing...');

        const avatar = document.createElement('div');
        avatar.className = 'avatar bot-avatar';
        avatar.innerHTML = '<i class="fas fa-robot"></i>';
        
        const bubble = document.createElement('div');
        bubble.className = 'bubble bot-bubble typing-bubble';
        
        const dots = document.createElement('div');
        dots.className = 'typing-dots';
        dots.innerHTML = `
            <span class="typing-dot"></span>
            <span class="typing-dot"></span>
            <span class="typing-dot"></span>
        `;
        
        const label = document.createElement('span');
        label.className = 'typing-label';
        label.textContent = 'Edify is thinking...';
        
        bubble.appendChild(dots);
        bubble.appendChild(label);
        typingDiv.appendChild(avatar);
        typingDiv.appendChild(bubble);
        
        DOM.messagesContainer.appendChild(typingDiv);
        this.scrollToBottom();
    }

    static hide() {
        const indicator = document.getElementById('typingIndicator');
        if (indicator) {
            indicator.remove();
        }
    }

    static scrollToBottom() {
        if (DOM.messagesContainer) {
            DOM.messagesContainer.scrollTop = DOM.messagesContainer.scrollHeight;
        }
    }
}

// ============================================
// MCQ DISPLAY
// ============================================

class MCQDisplay {
    static render(mcqs, fileName) {
        if (!mcqs || mcqs.length === 0) {
            ChatManager.addBotMessage('No MCQs were generated. Please try with a different file.', { isError: true });
            return;
        }

        // Header message
        ChatManager.addBotMessage(
            `📚 Generated <strong>${mcqs.length}</strong> MCQ${mcqs.length > 1 ? 's' : ''} from "${fileName}":`,
            { fileInfo: fileName }
        );

        // Render each MCQ
        mcqs.forEach((mcq, index) => {
            const html = this.formatMCQ(mcq, index);
            ChatManager.addBotMessage(html);
        });

        // Summary footer
        const summary = this.createSummary(mcqs.length);
        ChatManager.addBotMessage(summary);
    }

    static formatMCQ(mcq, index) {
        const labels = CONFIG.MCQ_LABELS;
        let html = `
            <div class="mcq-container">
                <div class="mcq-question">
                    <span class="mcq-number">Q${index + 1}.</span>
                    ${this.escapeHtml(mcq.question)}
                </div>
                <div class="mcq-options">
        `;

        mcq.options.forEach((option, optIndex) => {
            const isCorrect = option === mcq.correct_answer;
            html += `
                <div class="mcq-option ${isCorrect ? 'mcq-option-correct' : ''}">
                    <span class="mcq-option-label"><strong>${labels[optIndex]}.</strong></span>
                    ${this.escapeHtml(option)}
                    ${isCorrect ? ' <span class="mcq-correct-icon">✅</span>' : ''}
                </div>
            `;
        });

        html += `</div>`;

        if (mcq.explanation) {
            html += `
                <div class="mcq-explanation">
                    💡 ${this.escapeHtml(mcq.explanation)}
                </div>
            `;
        }

        html += `</div>`;
        return html;
    }

    static createSummary(count) {
        const suggestions = count < 10 
            ? '• Try uploading a longer file for more questions' 
            : '';
        
        return `
            <div class="mcq-summary">
                <span>📝 ${count} questions generated</span>
                ${suggestions ? `<span class="mcq-suggestion">${suggestions}</span>` : ''}
            </div>
        `;
    }

    static escapeHtml(html) {
        if (!html) return '';
        const div = document.createElement('div');
        div.textContent = html;
        return div.innerHTML;
    }
}

// ============================================
// CHAT MANAGER
// ============================================

class ChatManager {
    static addUserMessage(text) {
        const message = {
            type: 'user',
            text: text,
            timestamp: new Date().toISOString(),
            fileInfo: null,
            isError: false
        };
        state.addMessage(message);
        MessageRenderer.renderMessage(message);
    }

    static addBotMessage(text, options = {}) {
        const message = {
            type: 'bot',
            text: text,
            timestamp: new Date().toISOString(),
            fileInfo: options.fileInfo || null,
            isError: options.isError || false
        };
        state.addMessage(message);
        MessageRenderer.renderMessage(message);
    }

    static async sendMessage() {
        const text = DOM.userInput.value.trim();
        if (!text || state.isProcessing) return;

        // Clear input
        DOM.userInput.value = '';
        DOM.userInput.focus();

        // Add user message
        this.addUserMessage(text);

        // Set processing state
        state.isProcessing = true;
        DOM.sendBtn.disabled = true;
        DOM.sendBtn.classList.add('processing');

        // Show typing indicator with delay
        const typingTimeout = setTimeout(() => {
            TypingIndicator.show();
        }, CONFIG.TYPING_DELAY);

        try {
            const response = await this.fetchChatResponse(text);
            clearTimeout(typingTimeout);
            TypingIndicator.hide();

            if (response.mcqs && response.mcqs.length > 0) {
                MCQDisplay.render(response.mcqs, 'generated');
            } else if (response.response) {
                this.addBotMessage(response.response);
            } else {
                this.addBotMessage("I'm not sure how to respond to that. Try asking about MCQs or uploading a file!");
            }

        } catch (error) {
            clearTimeout(typingTimeout);
            TypingIndicator.hide();
            this.handleError(error);
        } finally {
            state.isProcessing = false;
            DOM.sendBtn.disabled = false;
            DOM.sendBtn.classList.remove('processing');
        }
    }

    static async fetchChatResponse(text) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), CONFIG.API_TIMEOUT);

        try {
            const response = await fetch('/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: text,
                    history: state.conversationHistory.slice(-10)
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            const responseText = await response.text();
            let data;
            
            try {
                data = JSON.parse(responseText);
            } catch (e) {
                throw new Error('Server returned invalid response');
            }

            if (!response.ok) {
                throw new Error(data.error || `Server error: ${response.status}`);
            }

            if (data.success === false) {
                throw new Error(data.error || 'Chat failed');
            }

            return data;

        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('Request timed out. Please try again.');
            }
            throw error;
        }
    }

    static handleError(error) {
        console.error('Chat error:', error);
        
        let errorMsg = error.message;
        if (error.message.includes('Failed to fetch')) {
            errorMsg = 'Cannot connect to server. Please check if the backend is running on port 5000.';
        } else if (error.message.includes('timed out')) {
            errorMsg = 'Request timed out. Please try again with a shorter message.';
        }
        
        this.addBotMessage(`❌ ${errorMsg}`, { isError: true });
    }

    static clearHistory() {
        if (!confirm('Are you sure you want to clear the chat history?')) return;
        
        state.clearHistory();
        DOM.messagesContainer.innerHTML = '';
        
        // Show welcome message
        this.addBotMessage('👋 Hello! I\'m <strong>Edify</strong>. Upload a PDF, Word, or text file, and I\'ll generate high‑quality MCQs instantly.');
    }

    static loadHistory() {
        const hasHistory = state.loadHistory();
        if (hasHistory) {
            // Clear welcome message
            DOM.messagesContainer.innerHTML = '';
            // Render all history
            state.conversationHistory.forEach(msg => {
                MessageRenderer.renderMessage(msg);
            });
            return true;
        }
        return false;
    }
}

// ============================================
// FILE UPLOAD MANAGER
// ============================================

class FileUploadManager {
    static validateFile(file) {
        // Check extension
        const fileExt = '.' + file.name.split('.').pop().toLowerCase();
        if (!CONFIG.ALLOWED_EXTENSIONS.includes(fileExt)) {
            ChatManager.addBotMessage(
                `⚠️ Please upload a supported file type: ${CONFIG.ALLOWED_EXTENSIONS.join(', ')}`,
                { isError: true }
            );
            return false;
        }

        // Check size
        if (file.size > CONFIG.MAX_FILE_SIZE) {
            ChatManager.addBotMessage(
                `⚠️ File size exceeds ${CONFIG.MAX_FILE_SIZE / (1024*1024)}MB limit.`,
                { isError: true }
            );
            return false;
        }

        return true;
    }

    static async handleFile(file) {
        if (!this.validateFile(file)) {
            DOM.fileInput.value = '';
            DOM.fileName.textContent = 'no file selected';
            return;
        }

        DOM.fileName.textContent = file.name;
        state.uploadedFile = file;
        
        // Get question count
        const numQuestions = this.getQuestionCount();
        
        // Upload
        await this.uploadToServer(file, numQuestions);
    }

    static getQuestionCount() {
        if (!DOM.numQuestions) return 10;
        const val = parseInt(DOM.numQuestions.value);
        if (isNaN(val) || val < 3) return 10;
        if (val > 20) return 20;
        return val;
    }

    static async uploadToServer(file, numQuestions) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('num_questions', numQuestions);

        // Show progress
        this.showProgress();

        try {
            // User message
            ChatManager.addUserMessage(`📎 Uploaded: ${file.name} (${this.formatFileSize(file.size)})`);
            
            // Typing indicator
            const typingTimeout = setTimeout(() => {
                TypingIndicator.show();
            }, CONFIG.TYPING_DELAY);

            // Upload
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), CONFIG.API_TIMEOUT);

            const response = await fetch('/upload', {
                method: 'POST',
                body: formData,
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            clearTimeout(typingTimeout);
            TypingIndicator.hide();

            // Complete progress
            this.completeProgress();

            // Parse response
            const responseText = await response.text();
            let data;
            
            try {
                data = JSON.parse(responseText);
            } catch (e) {
                throw new Error('Server returned invalid response');
            }

            if (!response.ok) {
                throw new Error(data.error || `Server error: ${response.status}`);
            }

            if (data.success === false) {
                throw new Error(data.error || 'Upload failed');
            }

            // Display results
            if (data.mcqs && data.mcqs.length > 0) {
                MCQDisplay.render(data.mcqs, file.name);
                
                if (data.total_questions_requested && data.total_questions_requested > data.mcqs.length) {
                    ChatManager.addBotMessage(
                        `ℹ️ Generated ${data.mcqs.length} valid MCQs out of ${data.total_questions_requested} requested.`,
                        { fileInfo: file.name }
                    );
                }
            } else if (data.message) {
                ChatManager.addBotMessage(data.message, { fileInfo: file.name });
            } else {
                ChatManager.addBotMessage(
                    `✅ File "${file.name}" processed successfully!`,
                    { fileInfo: file.name }
                );
            }

        } catch (error) {
            TypingIndicator.hide();
            this.hideProgress();
            this.handleUploadError(error);
        }
    }

    static showProgress() {
        if (DOM.uploadProgress) {
            DOM.uploadProgress.classList.add('active');
            if (DOM.progressBar) {
                DOM.progressBar.style.width = '0%';
                // Animate progress
                let progress = 0;
                const interval = setInterval(() => {
                    progress += 2;
                    if (progress >= 90) {
                        clearInterval(interval);
                    }
                    DOM.progressBar.style.width = progress + '%';
                }, 100);
                DOM.uploadProgress.dataset.interval = interval;
            }
        }
    }

    static completeProgress() {
        if (DOM.uploadProgress && DOM.progressBar) {
            DOM.progressBar.style.width = '100%';
            setTimeout(() => {
                this.hideProgress();
            }, 500);
        }
    }

    static hideProgress() {
        if (DOM.uploadProgress) {
            DOM.uploadProgress.classList.remove('active');
            if (DOM.progressBar) {
                DOM.progressBar.style.width = '0%';
            }
            if (DOM.uploadProgress.dataset.interval) {
                clearInterval(parseInt(DOM.uploadProgress.dataset.interval));
            }
        }
    }

    static handleUploadError(error) {
        console.error('Upload error:', error);
        
        let errorMsg = error.message;
        if (error.name === 'AbortError') {
            errorMsg = 'Request timed out. Please try again with a smaller file or fewer questions.';
        } else if (error.message.includes('Failed to fetch')) {
            errorMsg = 'Cannot connect to server. Please check if the backend is running on port 5000.';
        } else if (error.message.includes('500')) {
            errorMsg = 'Server error. Please check the server logs for details.';
        }
        
        ChatManager.addBotMessage(`❌ ${errorMsg}`, { isError: true });
        DOM.fileName.textContent = 'upload failed';
        DOM.fileInput.value = '';
    }

    static formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

// ============================================
// EVENT HANDLERS
// ============================================

// File input
DOM.fileInput.addEventListener('change', function(e) {
    const file = this.files[0];
    if (file) {
        FileUploadManager.handleFile(file);
    }
});

// Send message
DOM.sendBtn.addEventListener('click', function(e) {
    e.preventDefault();
    ChatManager.sendMessage();
});

// Enter key
DOM.userInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        ChatManager.sendMessage();
    }
});

// Theme toggle
if (DOM.themeToggle) {
    DOM.themeToggle.addEventListener('click', () => {
        state.toggleTheme();
    });
}

// Clear chat
if (DOM.clearChatBtn) {
    DOM.clearChatBtn.addEventListener('click', () => {
        ChatManager.clearHistory();
    });
}

// Drag and drop file upload
DOM.messagesContainer.addEventListener('dragover', (e) => {
    e.preventDefault();
    DOM.messagesContainer.classList.add('drag-over');
});

DOM.messagesContainer.addEventListener('dragleave', (e) => {
    e.preventDefault();
    DOM.messagesContainer.classList.remove('drag-over');
});

DOM.messagesContainer.addEventListener('drop', (e) => {
    e.preventDefault();
    DOM.messagesContainer.classList.remove('drag-over');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        const file = files[0];
        DOM.fileInput.files = files;
        DOM.fileInput.dispatchEvent(new Event('change'));
    }
});

// ============================================
// KEYBOARD SHORTCUTS
// ============================================

document.addEventListener('keydown', function(e) {
    // Ctrl+Shift+U - Upload
    if (e.ctrlKey && e.shiftKey && e.key === 'U') {
        e.preventDefault();
        DOM.fileInput.click();
    }
    
    // Ctrl+Shift+C - Clear chat
    if (e.ctrlKey && e.shiftKey && e.key === 'C') {
        e.preventDefault();
        ChatManager.clearHistory();
    }
    
    // Ctrl+Shift+T - Toggle theme
    if (e.ctrlKey && e.shiftKey && e.key === 'T') {
        e.preventDefault();
        state.toggleTheme();
    }
    
    // Escape - Clear input
    if (e.key === 'Escape' && DOM.userInput.value) {
        DOM.userInput.value = '';
        DOM.userInput.blur();
    }
});

// ============================================
// INITIALIZATION
// ============================================

function initialize() {
    console.log('🔮 Edify Chatbot v4.0 - Developed by Sohani Iftikhar ✨');
    console.log('📌 Keyboard Shortcuts:');
    console.log('   Ctrl+Shift+C = Clear chat');
    console.log('   Ctrl+Shift+U = Upload file');
    console.log('   Ctrl+Shift+T = Toggle theme');
    console.log('   Escape = Clear input');
    console.log('📌 Debug: window.Edify for API access');

    // Load theme
    state.loadTheme();

    // Load history or show welcome
    const hasHistory = ChatManager.loadHistory();
    if (!hasHistory) {
        ChatManager.addBotMessage('👋 Hello! I\'m <strong>Edify</strong>. Upload a PDF, Word, or text file, and I\'ll generate high‑quality MCQs instantly.');
    }

    // Focus input
    DOM.userInput.focus();

    // Add typing styles if not present
    if (!document.getElementById('edifyStyles')) {
        const style = document.createElement('style');
        style.id = 'edifyStyles';
        style.textContent = `
            /* Typing indicator */
            .typing-dots {
                display: flex;
                gap: 6px;
                align-items: center;
                padding: 4px 0;
            }
            .typing-dot {
                display: inline-block;
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: #a78bfa;
                animation: typingDot 1.4s infinite ease-in-out both;
            }
            .typing-dot:nth-child(1) { animation-delay: -0.32s; }
            .typing-dot:nth-child(2) { animation-delay: -0.16s; }
            .typing-dot:nth-child(3) { animation-delay: 0s; }
            
            @keyframes typingDot {
                0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
                40% { transform: scale(1); opacity: 1; }
            }
            
            .typing-label {
                margin-left: 8px;
                font-size: 0.8rem;
                color: #9ca3af;
            }
            
            .typing-bubble {
                display: flex;
                align-items: center;
                gap: 4px;
                padding: 0.8rem 1.5rem !important;
            }
            
            /* MCQ Styles */
            .mcq-container {
                margin: 12px 0;
                padding: 12px;
                background: rgba(167,139,250,0.05);
                border-radius: 8px;
                border-left: 3px solid #a78bfa;
            }
            .mcq-question {
                font-weight: 600;
                margin-bottom: 8px;
            }
            .mcq-number {
                color: #a78bfa;
                margin-right: 6px;
            }
            .mcq-options {
                margin: 4px 0 4px 16px;
                font-size: 0.9rem;
            }
            .mcq-option {
                margin: 4px 0;
                padding: 4px 8px;
                border-radius: 4px;
            }
            .mcq-option-correct {
                background: rgba(74, 222, 128, 0.1);
                color: #4ade80;
            }
            .mcq-correct-icon {
                color: #4ade80;
            }
            .mcq-explanation {
                margin-top: 8px;
                padding-top: 8px;
                border-top: 1px solid rgba(255,255,255,0.05);
                font-size: 0.8rem;
                color: rgba(255,255,255,0.5);
            }
            .mcq-summary {
                margin-top: 8px;
                padding: 12px;
                background: rgba(167,139,250,0.03);
                border-radius: 8px;
                text-align: center;
                font-size: 0.8rem;
                color: rgba(255,255,255,0.4);
            }
            .mcq-suggestion {
                display: block;
                margin-top: 4px;
            }
            
            /* File badge */
            .file-badge {
                margin-top: 8px;
                font-size: 0.7rem;
                color: rgba(167,139,250,0.6);
                background: rgba(167,139,250,0.05);
                padding: 4px 12px;
                border-radius: 20px;
                display: inline-block;
                border: 1px solid rgba(167,139,250,0.05);
            }
            
            /* Error bubble */
            .error-bubble {
                border-color: rgba(239, 68, 68, 0.3) !important;
                background: rgba(239, 68, 68, 0.05) !important;
            }
            
            /* Light mode overrides */
            body.light-mode .mcq-container {
                background: rgba(129, 140, 248, 0.05);
                border-left-color: #818cf8;
            }
            body.light-mode .mcq-number {
                color: #818cf8;
            }
            body.light-mode .mcq-option-correct {
                background: rgba(34, 197, 94, 0.1);
                color: #22c55e;
            }
            body.light-mode .mcq-explanation {
                border-top-color: rgba(0,0,0,0.05);
                color: rgba(0,0,0,0.5);
            }
            body.light-mode .mcq-summary {
                background: rgba(129, 140, 248, 0.03);
                color: rgba(0,0,0,0.4);
            }
            body.light-mode .file-badge {
                color: rgba(129, 140, 248, 0.7);
                background: rgba(129, 140, 248, 0.05);
                border-color: rgba(129, 140, 248, 0.1);
            }
            body.light-mode .typing-dot {
                background: #818cf8;
            }
            body.light-mode .typing-label {
                color: #6b7280;
            }
            body.light-mode .error-bubble {
                border-color: rgba(239, 68, 68, 0.3) !important;
                background: rgba(239, 68, 68, 0.05) !important;
            }
            
            /* Drag and drop */
            .drag-over {
                border: 2px dashed rgba(129, 140, 248, 0.3) !important;
                background: rgba(129, 140, 248, 0.02) !important;
            }
            
            /* Send button processing state */
            #sendBtn.processing {
                opacity: 0.5;
                pointer-events: none;
            }
        `;
        document.head.appendChild(style);
    }
}

// ============================================
// EXPOSE FOR DEBUGGING
// ============================================

window.Edify = {
    state: state,
    ChatManager: ChatManager,
    FileUploadManager: FileUploadManager,
    MessageRenderer: MessageRenderer,
    TypingIndicator: TypingIndicator,
    MCQDisplay: MCQDisplay,
    DOM: DOM,
    CONFIG: CONFIG,
    getVersion: () => '4.0',
    getTheme: () => state.currentTheme,
    getHistory: () => state.conversationHistory,
    getStatus: () => ({
        isProcessing: state.isProcessing,
        uploadedFile: state.uploadedFile,
        messageCount: state.conversationHistory.length
    })
};

// ============================================
// START APPLICATION
// ============================================

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}