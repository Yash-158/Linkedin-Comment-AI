/**
 * LinkedIn Comment Generator
 * Debug logging utility with production-ready configuration
 */
const debug = {
    // Control whether logs should be shown (defaults to false in production)
    enabled: false,
    // Control whether debug mode is active
    isDebugMode: false,

    /**
     * Log informational messages if debugging is enabled
     * @param {string} message - Message to log
     * @param {any} data - Optional data to include
     */
    log: (message, data = null) => {
        if (!debug.enabled && !debug.isDebugMode) return;
        console.log(`[LinkedIn Comment Generator] ${message}`, data || '');
    },

    /**
     * Log error messages (these will always show in console)
     * @param {string} message - Error message
     * @param {Error} error - Optional error object
     */
    error: (message, error = null) => {
        console.error(`[LinkedIn Comment Generator] ${message}`, error || '');
    },

    /**
     * Show visual feedback element (only in debug mode)
     * @param {string} message - Message to display
     * @param {HTMLElement} element - Optional element to highlight
     * @param {string} type - Message type (info, error, success, warning)
     */
    showVisualFeedback: (message, element = null, type = 'info') => {
        if (!debug.isDebugMode) return;

        // Create visual feedback element
        const feedback = document.createElement('div');
        feedback.className = 'lcg-debug-feedback';
        feedback.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            padding: 10px 15px;
            border-radius: 5px;
            z-index: 9999;
            max-width: 400px;
            font-size: 14px;
            font-family: Arial, sans-serif;
            box-shadow: 0 3px 10px rgba(0,0,0,0.2);
            transition: all 0.3s ease;
        `;

        // Set style based on message type
        switch (type) {
            case 'error':
                feedback.style.backgroundColor = '#f44336';
                feedback.style.color = 'white';
                break;
            case 'success':
                feedback.style.backgroundColor = '#4CAF50';
                feedback.style.color = 'white';
                break;
            case 'warning':
                feedback.style.backgroundColor = '#FF9800';
                feedback.style.color = 'white';
                break;
            default:
                feedback.style.backgroundColor = '#2196F3';
                feedback.style.color = 'white';
        }

        feedback.textContent = message;

        // Highlight the element if provided
        if (element && element instanceof HTMLElement) {
            const originalOutline = element.style.outline;
            const originalZIndex = element.style.zIndex;

            element.style.outline = type === 'error' ? '3px solid #f44336' : '3px solid #2196F3';
            element.style.zIndex = '10000';

            // Restore original styles after a delay
            setTimeout(() => {
                element.style.outline = originalOutline;
                element.style.zIndex = originalZIndex;
            }, 5000);
        }

        // Add feedback to page
        document.body.appendChild(feedback);

        // Remove after 5 seconds
        setTimeout(() => {
            feedback.style.opacity = '0';
            setTimeout(() => feedback.remove(), 300);
        }, 5000);
    },

    /**
     * Toggle debug mode on/off with keyboard shortcut
     * @returns {boolean} New debug mode state
     */
    toggleDebugMode: () => {
        debug.isDebugMode = !debug.isDebugMode;
        debug.enabled = debug.isDebugMode;

        if (debug.isDebugMode) {
            debug.showVisualFeedback('Debug mode activated! Press Ctrl+Shift+D to deactivate', null, 'success');
        }

        return debug.isDebugMode;
    }
};

/**
 * API configuration for comment generation service
 */
const API_CONFIG = {
    /**
     * API endpoint for generating comments
     * This should be updated to your production endpoint
     */
    // URL: 'https://n8n.srv894857.hstgr.cloud/webhook/linkedin-comment',
    URL: 'https://n8nautoflow.app/webhook/linkedin-comment',
    // URL: 'https://n8n.srv894857.hstgr.cloud/webhook-test/linkedin-comment',

    /**
     * Maximum number of retries for API calls
     */
    MAX_RETRIES: 2,

    /**
     * Default timeout for API calls in milliseconds
     */
    TIMEOUT_MS: 10000
};

/**
 * Generates a comment by calling the API with post content, hint, and tone
 * 
 * @param {string} content - The content of the post to generate a comment for
 * @param {string} hint - Optional hint to guide comment generation
 * @param {string} tone - Optional tone for the comment (professional, friendly, etc.)
 * @returns {Promise<string>} The generated comment
 * @throws {Error} If API call fails or response is invalid
 */
async function generateCommentAPI(content, hint, tone) {
    if (!API_CONFIG.URL) {
        throw new Error('API endpoint not configured in code.');
    }

    // Get user info from LinkedIn
    const userInfo = await getUserInfo();

    // Get post ID more reliably
    let postId = 'unknown';
    try {
        // Try to find the post element in various ways
        const postElement = document.querySelector('.feed-shared-update-v2, .occludable-update, [data-urn]') ||
            document.activeElement?.closest('.feed-shared-update-v2, .occludable-update, [data-urn]');

        if (postElement) {
            // Try different ways to get the post ID
            postId = postElement.getAttribute('data-urn') ||
                postElement.getAttribute('data-id') ||
                postElement.id ||
                'unknown';
        }
    } catch (error) {
        debug.error('Error getting post ID', error);
    }

    // Create unique_id by combining profile URL and post ID
    const uniqueId = userInfo.profileUrl ?
        `${userInfo.profileUrl}_${postId}` :
        `${userInfo.id || 'unknown'}_${postId}`;

    // Prepare the request payload
    const payload = {
        hint: hint || "",
        caption: content,
        tone: tone || "professional",
        unique_id: uniqueId,
        user_info: {
            id: userInfo.id || 'unknown',
            email: userInfo.email || 'unknown',
            name: userInfo.name || 'unknown',
            profile_url: userInfo.profileUrl || 'unknown'
        }
    };

    debug.log('Sending payload to API', payload);

    const requestOptions = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    };

    try {
        let retries = 0;
        let response;

        // Retry logic with exponential backoff
        while (retries <= API_CONFIG.MAX_RETRIES) {
            try {
                debug.log(`API call attempt ${retries + 1}/${API_CONFIG.MAX_RETRIES + 1}`);

                // Use AbortController to implement timeout
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.TIMEOUT_MS);

                response = await fetch(API_CONFIG.URL, {
                    ...requestOptions,
                    signal: controller.signal
                });

                clearTimeout(timeoutId);
                break;
            } catch (error) {
                retries++;
                if (retries > API_CONFIG.MAX_RETRIES) {
                    throw error.name === 'AbortError'
                        ? new Error('API request timed out')
                        : error;
                }
                // Wait before retrying (exponential backoff)
                await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retries)));
            }
        }

        if (!response.ok) {
            let errorMessage = `API error: ${response.status}`;
            try {
                const errorData = await response.json();
                errorMessage += ` - ${JSON.stringify(errorData)}`;
            } catch (e) {
                // If we can't parse JSON, just use status text
                errorMessage += ` - ${response.statusText}`;
            }
            throw new Error(errorMessage);
        }

        const data = await response.json();

        if (!data.comment) {
            throw new Error('API response missing comment field');
        }

        return data.comment;
    } catch (error) {
        debug.error('Error calling comment generation API', error);
        throw error;
    }
}

/**
 * Retrieves information about the currently logged-in LinkedIn user
 * 
 * @returns {Promise<Object>} User information including id, name, email, and profileUrl
 */
async function getUserInfo() {
    try {
        const userInfo = {
            id: null,
            email: null,
            name: null,
            profileUrl: null
        };

        // Method 1: Get from global nav element (works on all LinkedIn pages including feed)
        const globalNav = document.getElementById('global-nav');
        if (globalNav) {
            // Try to find the profile nav item
            const profileNavItem = globalNav.querySelector('a[href*="/in/"], a[data-control-name="identity_profile_photo"]');
            if (profileNavItem) {
                userInfo.profileUrl = profileNavItem.href;
                if (userInfo.profileUrl) {
                    const idMatch = userInfo.profileUrl.match(/\/in\/([^\/]+)/);
                    if (idMatch) {
                        userInfo.id = idMatch[1];
                    }
                }
            }
        }

        // Method 2: Get from the Me dropdown menu
        if (!userInfo.profileUrl) {
            const meMenu = document.querySelector('button[aria-label="Me"], button[data-control-name="nav.settings_dropdown"]');
            if (meMenu) {
                // Click to open the menu
                meMenu.click();
                // Wait a bit for the menu to open
                await new Promise(resolve => setTimeout(resolve, 300));

                // Look for profile link in the dropdown
                const profileLink = document.querySelector('a[href*="/in/"][data-control-name="identity_profile_photo"], div[data-control-name="identity_welcome_message"] a');
                if (profileLink) {
                    userInfo.profileUrl = profileLink.href;
                    if (userInfo.profileUrl) {
                        const idMatch = userInfo.profileUrl.match(/\/in\/([^\/]+)/);
                        if (idMatch) {
                            userInfo.id = idMatch[1];
                        }
                    }
                }

                // Close the menu by clicking outside
                document.body.click();
            }
        }

        // Method 3: Get from the feed identity module
        if (!userInfo.profileUrl || !userInfo.name) {
            const feedIdentity = document.querySelector('.feed-identity-module');
            if (feedIdentity) {
                const profileLink = feedIdentity.querySelector('a[href*="/in/"]');
                if (profileLink) {
                    userInfo.profileUrl = profileLink.href;
                    if (!userInfo.name) {
                        userInfo.name = profileLink.textContent.trim();
                    }

                    if (userInfo.profileUrl && !userInfo.id) {
                        const idMatch = userInfo.profileUrl.match(/\/in\/([^\/]+)/);
                        if (idMatch) {
                            userInfo.id = idMatch[1];
                        }
                    }
                }
            }
        }

        // Method 4: Get from data attributes in the DOM
        if (!userInfo.id) {
            // LinkedIn often stores member ID in data attributes
            const memberElements = document.querySelectorAll('[data-urn*="urn:li:member:"], [data-entity-urn*="urn:li:member:"]');
            for (const element of memberElements) {
                const urn = element.getAttribute('data-urn') || element.getAttribute('data-entity-urn');
                if (urn) {
                    const match = urn.match(/urn:li:member:(\d+)/);
                    if (match) {
                        userInfo.id = match[1];
                        break;
                    }
                }
            }
        }

        // Method 5: Get name from profile sections if available
        if (!userInfo.name) {
            const nameSelectors = [
                '.profile-rail-card__actor-link',
                '.feed-identity-module__actor-link',
                '.identity-headline',
                '.profile-card-one-to-one__profile-link',
                '.profile-rail-card__name',
                '.identity-name'
            ];

            for (const selector of nameSelectors) {
                const nameElement = document.querySelector(selector);
                if (nameElement) {
                    userInfo.name = nameElement.textContent.trim();
                    break;
                }
            }
        }

        // Method 6: Try to get from meta tags
        if (!userInfo.id || !userInfo.name) {
            const metaTags = document.querySelectorAll('meta');
            for (const meta of metaTags) {
                const content = meta.getAttribute('content');
                if (!content) continue;

                // Look for profile info in meta tags
                if (meta.getAttribute('name') === 'profile:first_name' || meta.getAttribute('property') === 'profile:first_name') {
                    userInfo.name = (userInfo.name || '') + ' ' + content;
                }
                if (meta.getAttribute('name') === 'profile:last_name' || meta.getAttribute('property') === 'profile:last_name') {
                    userInfo.name = (userInfo.name || '') + ' ' + content;
                }
            }

            if (userInfo.name) {
                userInfo.name = userInfo.name.trim();
            }
        }

        // Method 7: Check local storage for any saved user info
        if (!userInfo.id || !userInfo.profileUrl) {
            try {
                const localStorageData = JSON.parse(localStorage.getItem('linkedin-comment-generator-user-info'));
                if (localStorageData) {
                    if (!userInfo.id && localStorageData.id) {
                        userInfo.id = localStorageData.id;
                    }
                    if (!userInfo.profileUrl && localStorageData.profileUrl) {
                        userInfo.profileUrl = localStorageData.profileUrl;
                    }
                    if (!userInfo.name && localStorageData.name) {
                        userInfo.name = localStorageData.name;
                    }
                }
            } catch (e) {
                debug.log('Error reading from localStorage', e);
            }
        }

        // If we still don't have a profile URL, try to construct it from the ID
        if (!userInfo.profileUrl && userInfo.id) {
            userInfo.profileUrl = `https://www.linkedin.com/in/${userInfo.id}/`;
        }

        // Save the user info we found to localStorage for future use
        if (userInfo.id || userInfo.profileUrl) {
            try {
                localStorage.setItem('linkedin-comment-generator-user-info', JSON.stringify(userInfo));
            } catch (e) {
                debug.log('Error saving to localStorage', e);
            }
        }

        // Generate a stable ID if we don't have one yet
        if (!userInfo.id) {
            // Use a hash of the navigator properties to create a device fingerprint
            const deviceInfo = `${navigator.userAgent}|${navigator.language}|${navigator.platform}|${screen.width}x${screen.height}`;
            const deviceHash = Array.from(deviceInfo).reduce((hash, char) =>
                ((hash << 5) - hash) + char.charCodeAt(0), 0).toString(36).replace('-', '');

            userInfo.id = `user_${deviceHash}`;
        }

        debug.log('Retrieved user info', userInfo);
        return userInfo;
    } catch (error) {
        debug.error('Error getting user info', error);
        // Return fallback user info with a random ID
        return {
            id: `user_${Math.random().toString(36).substring(2, 15)}`,
            email: 'unknown',
            name: 'unknown',
            profileUrl: null
        };
    }
}

/**
 * Post a comment to LinkedIn
 * @param {HTMLElement} post - The post element
 * @param {string} commentText - The comment text to post
 * @returns {Promise<boolean>} Success status
 */
async function postCommentToLinkedIn(post, commentText) {
    try {
        debug.log('Attempting to post comment to LinkedIn', { commentText });

        // Step 1: Find and click the comment button to ensure comment box is visible
        const commentButton = post.querySelector('button[aria-label*="comment" i], button.comment-button, [aria-label*="Comment" i][role="button"], [data-control-name="comment"]');

        if (commentButton && !commentButton.disabled) {
            debug.log('Clicking comment button to open comment box');
            commentButton.click();
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Step 2: Find the comment box
        const commentBoxSelectors = [
            '.ql-editor[contenteditable="true"]',
            'div[data-placeholder="Add a comment…"]',
            '.comments-comment-texteditor div[contenteditable="true"]',
            '.comments-comment-box__form div[contenteditable="true"]',
            'div[role="textbox"][contenteditable="true"]'
        ];

        let commentBox = null;
        for (const selector of commentBoxSelectors) {
            const boxes = post.querySelectorAll(selector);
            for (const box of boxes) {
                // Check if the box is visible and part of a comment form
                if (box.offsetParent !== null && box.isContentEditable) {
                    commentBox = box;
                    break;
                }
            }
            if (commentBox) break;
        }

        if (!commentBox) {
            throw new Error('Could not find comment box. Please open the comment section manually.');
        }

        debug.log('Found comment box', commentBox);

        // Step 3: Focus and clear the comment box
        commentBox.focus();
        await new Promise(resolve => setTimeout(resolve, 300));

        // Clear any existing content
        commentBox.innerHTML = '';

        // Step 4: Insert the comment text in a way LinkedIn recognizes
        // Create a paragraph element with the text
        const paragraph = document.createElement('p');
        paragraph.textContent = commentText;
        commentBox.appendChild(paragraph);

        // Step 5: Trigger all necessary events for LinkedIn to recognize the input
        const events = [
            new Event('focus', { bubbles: true }),
            new Event('input', { bubbles: true }),
            new Event('change', { bubbles: true }),
            new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'a' }),
            new KeyboardEvent('keypress', { bubbles: true, cancelable: true, key: 'a' }),
            new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: 'a' }),
            new Event('blur', { bubbles: true })
        ];

        events.forEach(event => commentBox.dispatchEvent(event));

        // Focus again to ensure LinkedIn's state is updated
        commentBox.focus();
        await new Promise(resolve => setTimeout(resolve, 800));

        // Step 6: Find and click the post button
        const postButtonSelectors = [
            'button.comments-comment-box__submit-button--cr',
            'button.comments-comment-box__submit-button',
            'form.comments-comment-box__form button[type="submit"]',
            'button[aria-label*="Post" i]',
            'button.artdeco-button--primary[type="submit"]'
        ];

        let postButton = null;

        // Look for post button in the comment form area
        const commentForm = commentBox.closest('form, .comments-comment-box, .comments-comment-box__form');
        if (commentForm) {
            for (const selector of postButtonSelectors) {
                const button = commentForm.querySelector(selector);
                if (button && !button.disabled && button.offsetParent !== null) {
                    postButton = button;
                    break;
                }
            }
        }

        // If not found in form, search in the entire post
        if (!postButton) {
            for (const selector of postButtonSelectors) {
                const buttons = post.querySelectorAll(selector);
                for (const button of buttons) {
                    if (!button.disabled && button.offsetParent !== null) {
                        // Check if this button is near our comment box
                        const buttonRect = button.getBoundingClientRect();
                        const boxRect = commentBox.getBoundingClientRect();
                        const distance = Math.abs(buttonRect.top - boxRect.top);

                        if (distance < 200) { // Within 200px vertically
                            postButton = button;
                            break;
                        }
                    }
                }
                if (postButton) break;
            }
        }

        if (!postButton) {
            throw new Error('Could not find the Post button. The button might be disabled or hidden.');
        }

        debug.log('Found post button, clicking...', postButton);

        // Step 7: Click the post button
        await new Promise(resolve => setTimeout(resolve, 500));
        postButton.click();

        // Step 8: Wait a bit to ensure the comment is posted
        await new Promise(resolve => setTimeout(resolve, 1500));

        debug.log('Comment posted successfully');
        return true;
    } catch (error) {
        debug.error('Error posting comment to LinkedIn', error);
        throw error;
    }
}
// Fallback local comment generation
function generateCommentLocally(postContent, hint) {
    const templates = [
        "This is a great point about {content}! {hint_text}I've found that engaging with these ideas can lead to valuable insights.",
        "Really appreciate you sharing this perspective on {content}. {hint_text}It's given me something to think about.",
        "Interesting take on {content}! {hint_text}Thanks for sharing these thoughts with the community.",
        "I found this quite insightful, especially regarding {content}. {hint_text}Looking forward to more of your content on this topic.",
        "Thanks for highlighting these points about {content}. {hint_text}It's an important conversation to have."
    ];

    // Select a random template
    const template = templates[Math.floor(Math.random() * templates.length)];

    // Prepare a shortened version of the content
    const shortContent = postContent.length > 30
        ? postContent.substring(0, 30) + "..."
        : postContent;

    // Format the hint text if present
    const hintText = hint ? `(${hint}) ` : '';

    // Generate the comment using the template
    return template
        .replace('{content}', shortContent)
        .replace('{hint_text}', hintText);
}

// Track which posts have been processed and the active comment UI
let processedPostIds = new Set();
let activeCommentUI = null;

// Function to get a unique ID for a post
function getPostId(post) {
    // Try to get data-urn attribute which is typically unique for posts
    const urn = post.getAttribute('data-urn');
    if (urn) return `urn-${urn}`;

    // If no urn, try to find an id attribute
    const id = post.id;
    if (id) return `id-${id}`;

    // Try to find any unique content
    const uniqueText = extractPostContent(post).slice(0, 40).replace(/\s+/g, '-');
    if (uniqueText && uniqueText !== 'LinkedIn-post') {
        return `content-${uniqueText}`;
    }

    // As a fallback, use a combination of classList and position in document
    const postIndex = Array.from(document.querySelectorAll('.feed-shared-update-v2, .occludable-update')).indexOf(post);
    return `post-${post.classList.toString()}-${postIndex}`;
}

// Check if a post has meaningful content/caption
function hasContent(post) {
    // Look for text content with minimum length
    const minContentLength = 20;

    // Try to find text in common LinkedIn post content areas
    const contentSelectors = [
        '.feed-shared-update-v2__description-wrapper',
        '.feed-shared-text__text-view',
        '.update-components-text',
        '.feed-shared-inline-show-more-text',
        '.feed-shared-text-view',
        '.feed-shared-actor__description',
        '.update-components-actor__description',
        '.update-components-article__title',
        '.update-components-article__description',
        '.feed-shared-external-video__description',
        '.feed-shared-update-v2__commentary'
    ];

    for (const selector of contentSelectors) {
        const elements = post.querySelectorAll(selector);
        for (const element of elements) {
            const text = element.textContent.trim();
            if (text.length >= minContentLength) {
                return true;
            }
        }
    }

    // Also check for posts with images or videos
    const mediaSelectors = [
        'img.feed-shared-image',
        '.feed-shared-image__container',
        '.feed-shared-linkedin-video',
        '.feed-shared-external-video',
        '.feed-shared-mini-article',
        '.feed-shared-article__preview-image'
    ];

    for (const selector of mediaSelectors) {
        if (post.querySelector(selector)) {
            return true;
        }
    }

    return false;
}

// Simple function to extract content from a post
function extractPostContent(post) {
    debug.log('Extracting content from post', post);

    // Try to find the main post content using more specific LinkedIn selectors first
    const contentSelectors = [
        '.feed-shared-update-v2__description-wrapper',
        '.feed-shared-text__text-view',
        '.update-components-text',
        '.feed-shared-inline-show-more-text',
        '.feed-shared-text-view',
        '.feed-shared-update-v2__commentary',
        '.update-components-article__title',
        '.update-components-article__description',
        '.feed-shared-external-video__description'
    ];

    // Try each selector to find content
    for (const selector of contentSelectors) {
        const elements = post.querySelectorAll(selector);
        for (const element of elements) {
            const text = element.textContent.trim();
            if (text.length > 10) {
                debug.log('Found post content using selector', { selector, text });
                return text;
            }
        }
    }

    // Fallback: Look for any text content with reasonable length
    debug.log('Falling back to generic content extraction');
    const textElements = post.querySelectorAll('span, p, div');
    let content = '';

    for (const element of textElements) {
        const text = element.textContent.trim();
        if (text.length > 30) {
            content = text;
            debug.log('Found content through fallback method', content);
            break;
        }
    }

    if (!content) {
        debug.log('No suitable content found in post, using default text');
        return 'LinkedIn post';
    }

    return content;
}

// Check if a post is commentable (has comment functionality)
function isCommentable(post) {
    // Check for the presence of a comment button
    const commentButtonSelectors = [
        'button[aria-label*="comment" i]',
        'button.comment-button',
        '[aria-label*="Comment" i][role="button"]',
        '.comment-button',
        '[data-control-name="comment"]'
    ];

    for (const selector of commentButtonSelectors) {
        if (post.querySelector(selector)) {
            return true;
        }
    }

    // Check for the presence of a comment section
    const commentSectionSelectors = [
        '.comments-comment-box',
        '.comments-comment-texteditor',
        '.feed-shared-comment-box'
    ];

    for (const selector of commentSectionSelectors) {
        if (post.querySelector(selector)) {
            return true;
        }
    }

    return false;
}

// Create a comment UI that appears when the generate button is clicked
function createCommentUI(post, generateButton) {
    const container = document.createElement('div');
    container.className = 'linkedin-comment-generator-ui';
    container.style.cssText = `
        padding: 24px;
        background: #ffffff;
        border: 1px solid #e5e5e5;
        border-radius: 8px;
        margin: 16px 8px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.08);
        transition: all 0.3s ease;
        position: relative;
    `;

    // Create the UI elements
    const heading = document.createElement('h3');
    heading.textContent = 'Generate Comment';
    heading.style.cssText = `
        margin: 0 0 20px 0;
        font-size: 17px;
        color: #1a1a1a;
        font-weight: 600;
        letter-spacing: -0.3px;
    `;

    const hintInput = document.createElement('input');
    hintInput.type = 'text';
    hintInput.placeholder = 'Add feedback to refine the comment (optional)';
    hintInput.style.cssText = `
        display: none;
        width: 100%;
        padding: 11px 14px;
        border: 1px solid #d0d0d0;
        border-radius: 6px;
        margin-bottom: 16px;
        font-size: 13.5px;
        box-sizing: border-box;
        transition: border-color 0.2s ease, box-shadow 0.2s ease;
        outline: none;
        font-weight: 400;
        color: #333;
        line-height: 1.4;
    `;

    hintInput.addEventListener('focus', () => {
        hintInput.style.borderColor = '#0a66c2';
        hintInput.style.boxShadow = '0 0 0 2px rgba(10, 102, 194, 0.1)';
    });

    hintInput.addEventListener('blur', () => {
        hintInput.style.borderColor = '#d0d0d0';
        hintInput.style.boxShadow = 'none';
    });

    // Add tone dropdown
    const toneContainer = document.createElement('div');
    toneContainer.className = 'linkedin-comment-generator-tone-container';
    toneContainer.style.cssText = `
        margin-bottom: 16px;
        position: relative;
        width: 100%;
    `;

    const toneLabel = document.createElement('label');
    toneLabel.textContent = 'Select Tone';
    toneLabel.style.cssText = `
        display: block;
        margin-bottom: 8px;
        font-size: 13px;
        color: #666;
        font-weight: 500;
        letter-spacing: 0.3px;
    `;

    // Custom dropdown container
    const customDropdown = document.createElement('div');
    customDropdown.className = 'custom-dropdown';
    customDropdown.style.cssText = `
        position: relative;
        width: 100%;
    `;

    // Hidden native select element for form submission
    const toneSelect = document.createElement('select');
    toneSelect.className = 'linkedin-comment-generator-tone-select';
    toneSelect.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        opacity: 0;
        cursor: pointer;
        z-index: 1;
    `;

    // Custom display element
    const customDropdownDisplay = document.createElement('div');
    customDropdownDisplay.className = 'custom-dropdown-display';
    customDropdownDisplay.style.cssText = `
        padding: 11px 14px;
        border: 1px solid #d0d0d0;
        border-radius: 6px;
        font-size: 14px;
        background-color: #ffffff;
        font-weight: 500;
        color: #333;
        line-height: 1.4;
        display: flex;
        justify-content: space-between;
        align-items: center;
        cursor: pointer;
        transition: all 0.2s ease;
    `;

    // Text element inside display
    const displayText = document.createElement('span');
    displayText.className = 'dropdown-display-text';
    displayText.textContent = 'Professional';
    displayText.style.cssText = `
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    `;

    // Arrow element
    const displayArrow = document.createElement('span');
    displayArrow.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
    displayArrow.style.cssText = `
        margin-left: 8px;
        display: flex;
        align-items: center;
        opacity: 0.6;
    `;

    // Add tone options without emojis
    const tones = [
        { value: 'professional', label: 'Professional' },
        { value: 'supportive', label: 'Supportive' },
        { value: 'friendly', label: 'Friendly' },
        { value: 'inquisitive', label: 'Inquisitive' },
        { value: 'cheerful', label: 'Cheerful' },
        { value: 'funny', label: 'Funny' }
    ];

    // Add options to the native select
    tones.forEach(tone => {
        const option = document.createElement('option');
        option.value = tone.value;
        option.textContent = tone.label;
        if (tone.value === 'professional') {
            option.selected = true;
        }
        toneSelect.appendChild(option);
    });

    // Update display when select changes
    toneSelect.addEventListener('change', () => {
        const selectedOption = toneSelect.options[toneSelect.selectedIndex];
        displayText.textContent = selectedOption.textContent;
        customDropdownDisplay.style.borderColor = '#d0d0d0';
        customDropdownDisplay.style.boxShadow = 'none';
    });

    // Handle focus/blur states for custom dropdown
    toneSelect.addEventListener('focus', () => {
        customDropdownDisplay.style.borderColor = '#0a66c2';
        customDropdownDisplay.style.boxShadow = '0 0 0 2px rgba(10, 102, 194, 0.1)';
    });

    toneSelect.addEventListener('blur', () => {
        customDropdownDisplay.style.borderColor = '#d0d0d0';
        customDropdownDisplay.style.boxShadow = 'none';
    });

    // Assemble custom dropdown
    customDropdownDisplay.appendChild(displayText);
    customDropdownDisplay.appendChild(displayArrow);
    customDropdown.appendChild(customDropdownDisplay);
    customDropdown.appendChild(toneSelect);

    toneContainer.appendChild(toneLabel);
    toneContainer.appendChild(customDropdown);

    const commentBox = document.createElement('textarea');
    commentBox.readOnly = true;
    commentBox.placeholder = 'Generated comment will appear here...';
    commentBox.style.cssText = `
        width: 100%;
        min-height: 120px;
        padding: 14px;
        border: 1px solid #d0d0d0;
        border-radius: 6px;
        font-size: 14px;
        line-height: 1.6;
        resize: vertical;
        box-sizing: border-box;
        background-color: #fafafa;
        transition: background-color 0.2s ease;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        color: #333;
    `;

    // Create a container for the textarea and copy button
    const commentBoxContainer = document.createElement('div');
    commentBoxContainer.style.cssText = `
        position: relative;
        width: 100%;
        margin-bottom: 10px;
    `;

    // Add copy button
    const copyButton = document.createElement('button');
    copyButton.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
    copyButton.title = "Copy comment to clipboard";
    copyButton.style.cssText = `
        position: absolute;
        top: 10px;
        right: 10px;
        background: rgba(255, 255, 255, 0.9);
        border: none;
        border-radius: 4px;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        color: #0a66c2;
        transition: all 0.2s ease;
        opacity: 0.7;
        z-index: 1;
    `;

    copyButton.addEventListener('mouseover', () => {
        copyButton.style.opacity = '1';
        copyButton.style.backgroundColor = '#f0f7ff';
    });

    copyButton.addEventListener('mouseout', () => {
        copyButton.style.opacity = '0.7';
        copyButton.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
    });

    copyButton.addEventListener('click', () => {
        if (!commentBox.value || commentBox.value === 'Analyzing Post...') return;

        try {
            // Copy to clipboard
            navigator.clipboard.writeText(commentBox.value).then(() => {
                // Show success feedback
                const originalInnerHTML = copyButton.innerHTML;
                copyButton.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

                setTimeout(() => {
                    copyButton.innerHTML = originalInnerHTML;
                }, 2000);
            }).catch(err => {
                debug.error('Failed to copy: ', err);

                // Fallback method for older browsers
                commentBox.select();
                document.execCommand('copy');

                // Show success feedback
                const originalInnerHTML = copyButton.innerHTML;
                copyButton.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

                setTimeout(() => {
                    copyButton.innerHTML = originalInnerHTML;
                }, 2000);
            });
        } catch (error) {
            debug.error('Error copying to clipboard', error);

            // Try one more fallback
            try {
                commentBox.select();
                document.execCommand('copy');
            } catch (e) {
                debug.error('Final copy attempt failed', e);
            }
        }
    });

    // Assemble the comment box container
    commentBoxContainer.appendChild(commentBox);
    commentBoxContainer.appendChild(copyButton);

    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
        display: flex;
        justify-content: space-between;
        gap: 12px;
    `;

    const regenerateBtn = document.createElement('button');
    regenerateBtn.textContent = 'Generate';
    regenerateBtn.style.cssText = `
        padding: 10px 22px;
        border: 1px solid #0a66c2;
        border-radius: 6px;
        background-color: white;
        color: #0a66c2;
        cursor: pointer;
        font-weight: 600;
        font-size: 13.5px;
        flex: 1;
        transition: all 0.2s ease;
        box-shadow: none;
        position: relative;
        overflow: hidden;
    `;

    const commentBtn = document.createElement('button');
    commentBtn.textContent = 'Comment';
    commentBtn.style.cssText = `
        padding: 10px 22px;
        border: none;
        border-radius: 6px;
        background-color: #0a66c2;
        color: white;
        cursor: pointer;
        font-weight: 600;
        font-size: 13.5px;
        flex: 1;
        transition: all 0.2s ease;
        box-shadow: none;
        position: relative;
        overflow: hidden;
        display: none;
    `;

    regenerateBtn.addEventListener('mouseover', () => {
        regenerateBtn.style.backgroundColor = '#f0f7ff';
        regenerateBtn.style.transform = 'translateY(-1px)';
        regenerateBtn.style.boxShadow = '0 2px 6px rgba(10,102,194,0.2)';
    });

    regenerateBtn.addEventListener('mouseout', () => {
        regenerateBtn.style.backgroundColor = 'white';
        regenerateBtn.style.transform = 'translateY(0)';
        regenerateBtn.style.boxShadow = 'none';
    });

    commentBtn.addEventListener('mouseover', () => {
        commentBtn.style.backgroundColor = '#004182';
        commentBtn.style.transform = 'translateY(-1px)';
        commentBtn.style.boxShadow = '0 2px 6px rgba(10,102,194,0.3)';
    });

    commentBtn.addEventListener('mouseout', () => {
        commentBtn.style.backgroundColor = '#0a66c2';
        commentBtn.style.transform = 'translateY(0)';
        commentBtn.style.boxShadow = 'none';
    });

    // Add note explaining about copy functionality
    const copyNote = document.createElement('div');
    copyNote.textContent = 'Click the copy icon above to copy or use Comment button to post directly.';
    copyNote.style.cssText = `
        font-size: 12px;
        color: #888;
        margin-top: 10px;
        text-align: center;
        margin-bottom: 10px;
    `;

    // Create close button
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
    closeBtn.style.cssText = `
        position: absolute;
        top: 20px;
        right: 20px;
        border: none;
        background: transparent;
        color: #666;
        cursor: pointer;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        transition: all 0.2s ease;
    `;

    closeBtn.addEventListener('mouseover', () => {
        closeBtn.style.backgroundColor = '#f5f5f5';
        closeBtn.style.color = '#333';
    });

    closeBtn.addEventListener('mouseout', () => {
        closeBtn.style.backgroundColor = 'transparent';
        closeBtn.style.color = '#666';
    });

    closeBtn.addEventListener('click', () => {
        container.remove();
        activeCommentUI = null;
        // Show the generate button again
        if (generateButton) {
            generateButton.style.display = 'inline-flex';
        }
    });

    // Add event listeners
    regenerateBtn.addEventListener('click', async () => {
        const content = extractPostContent(post);
        debug.log('Extracted post content for comment generation', content);

        // Show loading state
        commentBox.value = 'Analyzing Post...';
        regenerateBtn.disabled = true;
        commentBtn.disabled = true;

        try {
            const hint = hintInput.value.trim();
            const tone = toneSelect.value;

            // Only use the API - no fallback to local generation
            try {
                const comment = await generateCommentAPI(content, hint, tone);
                commentBox.value = comment;
                hintInput.style.display = 'block';

                // Show both buttons after successful generation
                regenerateBtn.style.display = 'inline-block';
                commentBtn.style.display = 'inline-block';
                regenerateBtn.textContent = 'Regenerate';
            } catch (apiError) {
                debug.error('API generation failed', apiError);

                // Show clear error message to user
                commentBox.value = `Error: Could not generate comment. ${apiError.message}\n\nPlease check API configuration or try again later.`;
            }
        } catch (error) {
            debug.error('Error in comment generation process', error);
            commentBox.value = `Error: ${error.message || 'Unknown error occurred while generating comment.'}`;
        }

        regenerateBtn.disabled = false;
        commentBtn.disabled = false;
    });

    // Comment button click handler
    commentBtn.addEventListener('click', async () => {
        if (!commentBox.value || commentBox.value === 'Analyzing Post...') return;

        commentBtn.disabled = true;
        const originalText = commentBtn.textContent;
        commentBtn.textContent = 'Posting...';

        try {
            await postCommentToLinkedIn(post, commentBox.value);

            // Show success feedback
            commentBtn.textContent = 'Posted!';
            commentBtn.style.backgroundColor = '#22c55e';

            setTimeout(() => {
                // Close the UI after successful comment
                container.remove();
                activeCommentUI = null;
                if (generateButton) {
                    generateButton.style.display = 'inline-flex';
                }
            }, 2000);
        } catch (error) {
            debug.error('Error posting comment', error);
            commentBtn.textContent = 'Failed';
            commentBtn.style.backgroundColor = '#dc2626';

            setTimeout(() => {
                commentBtn.textContent = originalText;
                commentBtn.style.backgroundColor = '#0a66c2';
                commentBtn.disabled = false;
            }, 2000);
        }
    });

    // Assemble the UI
    buttonContainer.appendChild(regenerateBtn);
    buttonContainer.appendChild(commentBtn);
    container.appendChild(closeBtn);
    container.appendChild(heading);
    container.appendChild(toneContainer);
    container.appendChild(commentBoxContainer);
    container.appendChild(hintInput);
    container.appendChild(copyNote);
    container.appendChild(buttonContainer);

    return container;
}

// Create the Generate Comment button with logo
function createGenerateButton() {
    const button = document.createElement('button');

    // Use logo instead of text
    button.innerHTML = `<img src="${chrome.runtime.getURL('icons/logo.png')}" alt="Generate Comment" style="width: 128px; height: 48px; display: block;" />`;
    button.className = 'linkedin-comment-generator-button';
    button.setAttribute('data-lcg-processed', 'true');
    button.style.cssText = `
    background-color: transparent;
    color: white;
    border: none;
    border-radius: 6px;
    padding: 8px 12px;
    margin: 0 4px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 40px;
    box-shadow: none;
    transition: all 0.2s ease;
    position: relative;
    overflow: hidden;
`;

    button.onmouseover = () => {
        button.style.backgroundColor = 'rgba(10, 102, 194, 0.1)';
        button.style.transform = 'translateY(-1px)';
        button.style.boxShadow = '0 2px 6px rgba(10,102,194,0.15)';
    };

    button.onmouseout = () => {
        button.style.backgroundColor = 'transparent';
        button.style.transform = 'translateY(0)';
        button.style.boxShadow = 'none';
    };

    return button;
}

// Find posts and add buttons
function addButtonsToPosts() {
    try {
        // Cleanup before adding new buttons
        cleanupDuplicateButtons();

        // Find LinkedIn posts with different possible selectors
        const postSelectors = [
            '.feed-shared-update-v2',
            '.occludable-update',
            '.feed-shared-article',
            '.feed-shared-update',
            '.update-components-actor',
            '.update-components-article',
            '.update-components-image',
            '.feed-shared-external-video',
            '.feed-shared-text'
        ];

        let allPosts = [];

        // Try each selector
        for (const selector of postSelectors) {
            const posts = document.querySelectorAll(selector);
            if (posts.length > 0) {
                debug.log(`Found ${posts.length} posts with selector: ${selector}`);
                allPosts = [...allPosts, ...posts];
            }
        }

        // Make posts unique
        allPosts = [...new Set(allPosts)];
        debug.log(`Processing ${allPosts.length} total posts`);

        let buttonsAdded = 0;

        // Process each post
        allPosts.forEach(post => {
            // Get a unique ID for this post
            const postId = getPostId(post);

            // Skip if already processed
            if (processedPostIds.has(postId)) return;

            // Skip if not commentable
            if (!isCommentable(post)) {
                debug.log(`Skipping post ${postId} - not commentable`);
                return;
            }

            // Skip if no content
            if (!hasContent(post)) {
                debug.log(`Skipping post ${postId} - no meaningful content`);
                return;
            }

            // Check if the button already exists somewhere in this post
            if (post.querySelector('.linkedin-comment-generator-button')) {
                processedPostIds.add(postId);
                return;
            }

            // First try to find the social actions toolbar
            const actionSelectors = [
                '.feed-shared-social-actions',
                '.social-details-social-actions',
                '.update-v2-social-actions',
                '.feed-shared-social-action-bar',
                '.artdeco-card__actions',
                '.feed-shared-social-counts'
            ];

            let actionBar = null;
            for (const selector of actionSelectors) {
                const actionBars = post.querySelectorAll(selector);
                if (actionBars.length > 0) {
                    for (const bar of actionBars) {
                        // Look for any visible action bar
                        if (bar.offsetParent !== null) {
                            actionBar = bar;
                            break;
                        }
                    }
                    if (actionBar) break;
                }
            }

            if (actionBar) {
                // Try to find a good placement
                let buttonAdded = false;

                // First try: Look for the comment button
                const commentBtn = actionBar.querySelector('button[aria-label*="comment" i], .comment-button, [role="button"]');
                if (commentBtn) {
                    // Find a parent element that might be a list item
                    let commentItem = commentBtn;
                    for (let i = 0; i < 3; i++) {
                        if (commentItem.tagName === 'LI' || commentItem.getAttribute('role') === 'listitem') {
                            break;
                        }
                        if (commentItem.parentNode) {
                            commentItem = commentItem.parentNode;
                        } else {
                            break;
                        }
                    }

                    if (commentItem && commentItem.parentNode) {
                        // Create a container similar to other action buttons
                        const buttonContainer = document.createElement('li');
                        buttonContainer.className = 'linkedin-comment-generator-container';
                        buttonContainer.setAttribute('data-lcg-post-id', postId);
                        buttonContainer.style.cssText = `
                            display: inline-flex;
                            align-items: center;
                            margin: 0 4px;
                        `;

                        // Create the button
                        const button = createGenerateButton();

                        // Add click handler
                        button.addEventListener('click', (e) => {
                            e.stopPropagation();
                            e.preventDefault();

                            // Remove any existing comment UI
                            if (activeCommentUI) {
                                activeCommentUI.remove();
                                activeCommentUI = null;
                            }

                            // Hide the generate button
                            button.style.display = 'none';

                            // Create and add comment UI - add it after the action bar
                            const commentUI = createCommentUI(post, button);
                            actionBar.parentNode.insertBefore(commentUI, actionBar.nextSibling);
                            activeCommentUI = commentUI;

                            // Auto-generate initial comment
                            const regenerateBtn = commentUI.querySelector('button');
                            if (regenerateBtn && regenerateBtn.textContent === 'Generate') {
                                regenerateBtn.click();
                            }
                        });

                        // Add button to container
                        buttonContainer.appendChild(button);

                        // Add container next to the comment button
                        const parentElement = commentItem.parentNode;
                        parentElement.appendChild(buttonContainer);

                        processedPostIds.add(postId);
                        buttonAdded = true;
                        buttonsAdded++;
                        debug.log(`Added button to post ${postId} next to comment button`);
                    }
                }

                // Second try: Just append to the action bar
                if (!buttonAdded) {
                    // Create a direct button container
                    const buttonContainer = document.createElement('div');
                    buttonContainer.className = 'linkedin-comment-generator-container';
                    buttonContainer.setAttribute('data-lcg-post-id', postId);
                    buttonContainer.style.cssText = `
                        display: inline-flex;
                        align-items: center;
                        margin: 0 8px;
                    `;

                    // Create the button
                    const button = createGenerateButton();

                    // Add click handler
                    button.addEventListener('click', (e) => {
                        e.stopPropagation();
                        e.preventDefault();

                        // Remove any existing comment UI
                        if (activeCommentUI) {
                            activeCommentUI.remove();
                            activeCommentUI = null;
                        }

                        // Hide the generate button
                        button.style.display = 'none';

                        // Create and add comment UI
                        const commentUI = createCommentUI(post, button);
                        actionBar.parentNode.insertBefore(commentUI, actionBar.nextSibling);
                        activeCommentUI = commentUI;

                        // Auto-generate initial comment
                        const regenerateBtn = commentUI.querySelector('button');
                        if (regenerateBtn && regenerateBtn.textContent === 'Generate') {
                            regenerateBtn.click();
                        }
                    });

                    // Add button to container
                    buttonContainer.appendChild(button);

                    // Append to action bar
                    actionBar.appendChild(buttonContainer);

                    processedPostIds.add(postId);
                    buttonAdded = true;
                    buttonsAdded++;
                    debug.log(`Added button to post ${postId} directly to action bar`);
                }

                if (buttonAdded) {
                    // Skip the fallback button placement
                    processedPostIds.add(postId);
                    return;
                }
            }

            // Fallback placement: Add to the bottom of the post
            const button = createGenerateButton();

            // Make it full width for the fallback case
            button.style.display = 'block';
            button.style.width = 'calc(100% - 32px)';
            button.style.margin = '12px auto';
            button.style.padding = '8px 16px';

            // Add click handler
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();

                // Remove any existing comment UI
                if (activeCommentUI) {
                    activeCommentUI.remove();
                    activeCommentUI = null;
                }

                // Hide the generate button
                button.style.display = 'none';

                // Create and add comment UI
                const commentUI = createCommentUI(post, button);
                button.parentNode.insertBefore(commentUI, button.nextSibling);
                activeCommentUI = commentUI;

                // Auto-generate initial comment
                const regenerateBtn = commentUI.querySelector('button');
                if (regenerateBtn && regenerateBtn.textContent === 'Generate') {
                    regenerateBtn.click();
                }
            });

            // Create a container for our fallback button
            const container = document.createElement('div');
            container.className = 'linkedin-comment-generator-fallback';
            container.setAttribute('data-lcg-post-id', postId);
            container.style.cssText = `
                padding: 0 16px;
                margin: 8px 0;
            `;
            container.appendChild(button);

            // Add to the post
            post.appendChild(container);
            processedPostIds.add(postId);
            buttonsAdded++;
            debug.log(`Added fallback button to post ${postId}`);
        });

        debug.log(`Added ${buttonsAdded} buttons in total`);
    } catch (error) {
        debug.error('Error adding buttons', error);
    }
}

// Clean up any duplicate buttons
function cleanupDuplicateButtons() {
    try {
        // Get all buttons
        const buttons = document.querySelectorAll('.linkedin-comment-generator-button');
        debug.log(`Found ${buttons.length} total buttons during cleanup`);

        const buttonsByPost = new Map();

        // Group buttons by their parent post
        buttons.forEach(button => {
            const post = button.closest('.feed-shared-update-v2, .occludable-update, [data-urn], .feed-shared-update, .artdeco-card');
            if (!post) return;

            const postId = getPostId(post);
            if (!buttonsByPost.has(postId)) {
                buttonsByPost.set(postId, []);
            }
            buttonsByPost.get(postId).push(button);
        });

        // For each post, keep only the first button
        buttonsByPost.forEach((buttonsArray, postId) => {
            if (buttonsArray.length > 1) {
                debug.log(`Found ${buttonsArray.length} buttons for post ${postId}, removing duplicates`);
                // Keep the first button, remove the rest
                for (let i = 1; i < buttonsArray.length; i++) {
                    // Remove the parent container if it has our class
                    const container = buttonsArray[i].closest('.linkedin-comment-generator-container, .linkedin-comment-generator-fallback');
                    if (container) {
                        container.remove();
                    } else {
                        buttonsArray[i].remove();
                    }
                }
            }
        });

        // Remove buttons from non-commentable or content-less posts
        const allButtons = document.querySelectorAll('.linkedin-comment-generator-button');
        allButtons.forEach(button => {
            const post = button.closest('.feed-shared-update-v2, .occludable-update, [data-urn], .feed-shared-update, .artdeco-card');
            if (post) {
                if (!isCommentable(post)) {
                    const container = button.closest('.linkedin-comment-generator-container, .linkedin-comment-generator-fallback');
                    if (container) {
                        container.remove();
                    } else {
                        button.remove();
                    }
                    debug.log(`Removed button from non-commentable post`);
                }
                else if (!hasContent(post)) {
                    const container = button.closest('.linkedin-comment-generator-container, .linkedin-comment-generator-fallback');
                    if (container) {
                        container.remove();
                    } else {
                        button.remove();
                    }
                    debug.log(`Removed button from post without meaningful content`);
                }
            }
        });
    } catch (error) {
        debug.error('Error cleaning up duplicate buttons', error);
    }
}

/**
 * Initializes the LinkedIn Comment Generator extension
 * Sets up observers, keyboard shortcuts, and initial button placement
 */
function initialize() {
    debug.log('LinkedIn Comment Generator initializing');

    try {
        // Add keyboard shortcut for debug mode
        document.addEventListener('keydown', (e) => {
            // Ctrl+Shift+D to toggle debug mode
            if (e.ctrlKey && e.shiftKey && e.key === 'D') {
                debug.toggleDebugMode();
            }
        });

        // Initial run with a longer delay to ensure LinkedIn has fully loaded
        setTimeout(() => {
            // Verify API configuration
            if (!API_CONFIG.URL) {
                debug.error('API endpoint not configured. Comment generation will not work.');
            }

            // Add comment generator buttons to posts
            addButtonsToPosts();

            // Insert a marker to indicate the extension is active
            const marker = document.createElement('div');
            marker.id = 'linkedin-comment-generator-active';
            marker.style.display = 'none';
            document.body.appendChild(marker);

            // Add debug indicator if in debug mode
            if (debug.isDebugMode) {
                const debugIndicator = document.createElement('div');
                debugIndicator.textContent = 'Debug Mode';
                debugIndicator.style.cssText = `
                    position: fixed;
                    top: 10px;
                    right: 10px;
                    background: #f44336;
                    color: white;
                    padding: 5px 10px;
                    border-radius: 4px;
                    z-index: 10000;
                    font-family: Arial, sans-serif;
                    font-size: 12px;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
                `;
                document.body.appendChild(debugIndicator);
            }
        }, 2000);

        // Set up observer for DOM changes to detect new posts
        setupMutationObserver();

        // Add diagnostic click handler to help debug issues (only in debug mode)
        document.addEventListener('click', (e) => {
            // Check if user clicked with Alt key pressed (diagnostic mode)
            if (debug.isDebugMode && e.altKey && e.target) {
                const target = e.target;
                debug.log('Diagnostic click on element:', target);
                debug.log('Element classes:', target.className);
                debug.log('Element ID:', target.id);
                debug.log('Element attributes:', Array.from(target.attributes).map(attr => `${attr.name}="${attr.value}"`).join(', '));
            }
        }, true);
    } catch (error) {
        debug.error('Error during initialization', error);
    }
}

/**
 * Sets up mutation observer to detect new posts in the LinkedIn feed
 */
function setupMutationObserver() {
    try {
        // Set up observer for DOM changes
        const observer = new MutationObserver((mutations) => {
            // Only process if we have meaningful DOM changes
            const hasRelevantChanges = mutations.some(mutation => {
                return mutation.addedNodes.length > 0 ||
                    (mutation.target.classList &&
                        (mutation.target.classList.contains('feed-shared-update-v2') ||
                            mutation.target.classList.contains('occludable-update')));
            });

            if (hasRelevantChanges) {
                setTimeout(() => {
                    addButtonsToPosts();
                }, 500);
            }
        });

        // Start observing
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Also check periodically (LinkedIn loads content dynamically)
        const intervalId = setInterval(() => {
            addButtonsToPosts();
        }, 3000);

        // Store interval ID for potential cleanup
        window._linkedInCommentGenerator = window._linkedInCommentGenerator || {};
        window._linkedInCommentGenerator.intervalId = intervalId;

        debug.log('Mutation observer and interval set up successfully');
    } catch (error) {
        debug.error('Error setting up mutation observer', error);
    }
}

/**
 * Handles messages from popup or background scripts
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    debug.log('Received message', request);

    try {
        if (request.action === 'pasteComment') {
            // No longer used but kept for backward compatibility
            sendResponse({ success: false, error: 'Direct comment pasting is not supported' });
        } else if (request.action === 'diagnose') {
            // Diagnostic information
            const diagnosticInfo = {
                userAgent: navigator.userAgent,
                url: window.location.href,
                extensionActive: !!document.getElementById('linkedin-comment-generator-active'),
                apiConfigured: !!API_CONFIG.URL,
                commentablePostsFound: document.querySelectorAll('[data-lcg-post-id]').length,
                buttonsAdded: document.querySelectorAll('.linkedin-comment-generator-button').length,
                commentBoxesFound: document.querySelectorAll('div[contenteditable="true"], div[role="textbox"]').length
            };

            debug.log('Diagnostic info collected', diagnosticInfo);
            sendResponse({ success: true, diagnosticInfo });
        } else if (request.action === 'getSelectedPost') {
            // Get the currently viewed post content
            const post = findCurrentPost();
            if (post) {
                const content = extractPostContent(post);
                sendResponse({ success: true, content });
            } else {
                sendResponse({ success: false, error: 'No post found' });
            }
        }
    } catch (error) {
        debug.error('Error handling message', error);
        sendResponse({ success: false, error: error.message });
    }

    return true; // Keep the message channel open for async response
});

// Start the extension
initialize();