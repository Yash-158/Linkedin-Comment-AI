/**
 * LinkedIn Comment Generator - Popup Script
 * 
 * Handles the user interface for generating comments
 * on LinkedIn posts from the popup window.
 */
document.addEventListener('DOMContentLoaded', function() {
    const generateButton = document.getElementById('generateComment');
    const useCommentButton = document.getElementById('useComment');
    const regenerateButton = document.getElementById('regenerateComment');
    const suggestionInput = document.getElementById('suggestionInput');
    const postTextElement = document.getElementById('postText');
    const commentTextElement = document.getElementById('commentText');
    const statusElement = document.getElementById('status');
    const selectedPostInfo = document.getElementById('selectedPostInfo');

    // UI Elements
    const postContent = document.getElementById('postContent');
    const hintInput = document.getElementById('hintInput');
    const commentBox = document.getElementById('commentBox');
    const regenerateBtn = document.getElementById('regenerateBtn');
    const confirmBtn = document.getElementById('confirmBtn');
    const loading = document.getElementById('loading');
    const error = document.getElementById('error');

    // State variables
    let currentPost = null;
    let currentCaption = null;
    let currentComment = null;

    /**
     * Custom logging utility
     */
    const logger = {
        // Set to false in production
        enabled: false,
        
        log(message, data) {
            if (this.enabled) {
                console.log(`[LinkedIn Comment Generator] ${message}`, data || '');
            }
        },
        
        error(message, error) {
            // Always log errors
            console.error(`[LinkedIn Comment Generator] ${message}`, error || '');
        }
    };

    // Function to update UI with selected post
    function updateUIWithSelectedPost(content, isAutoDetected = false) {
        logger.log('Updating UI with selected post', { content: content.substring(0, 100), isAutoDetected });
        
        // Update the selected post info
        selectedPostInfo.textContent = `${isAutoDetected ? 'Auto-detected' : 'Selected'} post! Content preview: ` + 
            (content.length > 50 ? content.substring(0, 50) + '...' : content);
        selectedPostInfo.style.display = 'block';
        
        // Update post text
        postTextElement.textContent = content;
        
        // Enable buttons since we have a selected post
        generateButton.disabled = false;
        useCommentButton.disabled = false;
        regenerateButton.disabled = false;
    }

    // Function to update status message
    function updateStatus(message, isError = false) {
        statusElement.textContent = message;
        statusElement.className = `status ${isError ? 'error' : 'success'}`;
        setTimeout(() => {
            statusElement.textContent = '';
            statusElement.className = 'status';
        }, 3000);
    }

    /**
     * Update the UI with selected post content
     * @param {string} content - Post content text
     * @param {string} caption - Optional post caption
     */
    function updatePostPreview(content, caption) {
        if (!content) {
            postContent.innerHTML = '<div class="no-post">Select a post to generate a comment</div>';
            return;
        }

        let previewHtml = '';
        if (caption) {
            previewHtml += `<div class="caption">${caption}</div>`;
        }
        previewHtml += `<div class="content">${content.substring(0, 200)}${content.length > 200 ? '...' : ''}</div>`;
        
        postContent.innerHTML = previewHtml;
    }

    /**
     * Show loading state
     */
    function showLoading() {
        loading.style.display = 'block';
        commentBox.style.display = 'none';
        regenerateBtn.disabled = true;
        confirmBtn.disabled = true;
        error.style.display = 'none';
    }

    /**
     * Hide loading state
     */
    function hideLoading() {
        loading.style.display = 'none';
        commentBox.style.display = 'block';
        regenerateBtn.disabled = false;
        confirmBtn.disabled = false;
    }

    /**
     * Show error message
     * @param {string} message - Error message to display
     */
    function showError(message) {
        error.textContent = message;
        error.style.display = 'block';
    }

    /**
     * Generate a comment via the content script
     */
    async function generateComment() {
        if (!currentPost) {
            showError('No post selected');
            return;
        }

        showLoading();

        try {
            // Get the current active tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            // Send message to content script to generate comment
            const hint = hintInput.value.trim();
            
            const response = await chrome.tabs.sendMessage(tab.id, {
                action: 'generateComment',
                content: currentPost,
                caption: currentCaption,
                hint: hint
            });

            if (response.success && response.comment) {
                currentComment = response.comment;
                commentBox.value = currentComment;
            } else {
                showError(response.error || 'Failed to generate comment');
            }
            
            hideLoading();
        } catch (error) {
            logger.error('Error generating comment', error);
            showError('Failed to generate comment. Please try again.');
            hideLoading();
        }
    }

    /**
     * Copy the generated comment to clipboard
     */
    async function copyCommentToClipboard() {
        if (!currentComment) {
            showError('No comment generated yet');
            return;
        }

        try {
            await navigator.clipboard.writeText(currentComment);
            
            // Show success indication
            const originalText = confirmBtn.textContent;
            confirmBtn.textContent = 'Copied!';
            
            setTimeout(() => {
                confirmBtn.textContent = originalText;
            }, 2000);
        } catch (error) {
            logger.error('Error copying to clipboard', error);
            showError('Failed to copy comment. Please try again.');
        }
    }

    // Event listeners
    generateButton.addEventListener('click', () => generateComment());
    useCommentButton.addEventListener('click', copyCommentToClipboard);
    regenerateBtn.addEventListener('click', generateComment);
    confirmBtn.addEventListener('click', copyCommentToClipboard);
    hintInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            generateComment();
        }
    });

    /**
     * Initialize the popup
     * Gets the current post content and generates initial comment
     */
    async function initialize() {
        try {
            // Get the current active tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            // Check if we're on LinkedIn
            if (!tab.url.includes('linkedin.com')) {
                showError('Please navigate to LinkedIn to use this extension');
                return;
            }
            
            // Get the post content
            const response = await chrome.tabs.sendMessage(tab.id, { 
                action: 'getSelectedPost' 
            });
            
            if (response && response.success && response.content) {
                currentPost = response.content;
                currentCaption = response.caption;
                updatePostPreview(currentPost, currentCaption);
                generateComment(); // Auto-generate first comment
            } else {
                updatePostPreview(null, null);
                showError('No LinkedIn post found. Navigate to a post and try again.');
            }
        } catch (error) {
            logger.error('Error initializing popup', error);
            showError('Failed to connect to LinkedIn page. Please refresh and try again.');
        }
    }

    // Start initialization
    initialize();
}); 