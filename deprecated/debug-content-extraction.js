// Debug script to test content extraction
console.log('=== CONTENT EXTRACTION DEBUG ===');

// Test the actual content extraction
async function debugContentExtraction() {
  const webview = document.querySelector('webview.active');
  if (!webview) {
    console.error('No active webview found');
    return;
  }
  
  console.log('Testing content extraction on:', webview.src);
  
  try {
    // Test 1: Basic content extraction
    const basicContent = await webview.executeJavaScript(`
      document.body.innerText
    `);
    console.log('=== BASIC CONTENT ===');
    console.log('Length:', basicContent.length);
    console.log('Sample:', basicContent.substring(0, 500));
    
    // Test 2: Look for blog-related elements
    const blogElements = await webview.executeJavaScript(`
      // Look for various blog-related selectors
      const selectors = [
        'article', '.blog', '.post', '.entry', 
        '[class*="blog"]', '[id*="blog"]',
        '.content', '#content', 'main',
        'section', '.section'
      ];
      
      const found = [];
      selectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          found.push({
            selector: selector,
            count: elements.length,
            sample: elements[0].innerText.substring(0, 200)
          });
        }
      });
      
      return found;
    `);
    console.log('=== BLOG ELEMENTS FOUND ===');
    console.log(blogElements);
    
    // Test 3: Search for MCP mentions
    const mcpMentions = await webview.executeJavaScript(`
      const text = document.body.innerText.toLowerCase();
      const mcpCount = (text.match(/mcp/g) || []).length;
      const mcpContexts = [];
      
      // Find contexts around MCP mentions
      const sentences = text.split(/[.!?]+/);
      sentences.forEach((sentence, index) => {
        if (sentence.includes('mcp')) {
          mcpContexts.push({
            sentence: sentence.trim(),
            index: index
          });
        }
      });
      
      return {
        mcpCount: mcpCount,
        contexts: mcpContexts
      };
    `);
    console.log('=== MCP MENTIONS ===');
    console.log(mcpMentions);
    
    // Test 4: Get all links that might lead to blog posts
    const links = await webview.executeJavaScript(`
      const links = Array.from(document.querySelectorAll('a[href]'))
        .map(link => ({
          href: link.href,
          text: link.innerText.trim(),
          title: link.title || link.getAttribute('aria-label') || ''
        }))
        .filter(link => 
          link.text.toLowerCase().includes('blog') ||
          link.text.toLowerCase().includes('post') ||
          link.text.toLowerCase().includes('article') ||
          link.href.includes('blog') ||
          link.href.includes('post')
        );
      return links;
    `);
    console.log('=== BLOG-RELATED LINKS ===');
    console.log(links);
    
    // Test 5: Check if content is loaded dynamically
    const dynamicContent = await webview.executeJavaScript(`
      // Wait a bit and check if content changes
      const initialLength = document.body.innerText.length;
      
      return new Promise(resolve => {
        setTimeout(() => {
          const finalLength = document.body.innerText.length;
          resolve({
            initialLength: initialLength,
            finalLength: finalLength,
            changed: finalLength !== initialLength
          });
        }, 3000);
      });
    `);
    console.log('=== DYNAMIC CONTENT CHECK ===');
    console.log(dynamicContent);
    
  } catch (error) {
    console.error('Error during content extraction debug:', error);
  }
}

// Run the debug
debugContentExtraction(); 