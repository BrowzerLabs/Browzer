import { PageContent } from '../../shared/types';
import { URLUtils } from './urlUtils';

export interface ContentExtractionOptions {
  includeHtml?: boolean;
  preserveLinks?: boolean;
  detectContentType?: boolean;
  waitForDynamic?: boolean;
  includeBlogContent?: boolean;
  timeout?: number;
}

export interface ExtractedContent extends PageContent {
  description?: string;
  htmlContent?: string;
  links?: Array<{ url: string; text: string }>;
  images?: Array<{ url: string; alt: string }>;
}

export class ContentExtraction {
  private static readonly DEFAULT_OPTIONS: ContentExtractionOptions = {
    includeHtml: true,
    preserveLinks: true,
    detectContentType: true,
    waitForDynamic: true,
    includeBlogContent: true,
    timeout: 5000
  };

  /**
   * Extract comprehensive page content from a webview
   */
  static async extractPageContent(
    webview: any, 
    options: ContentExtractionOptions = {}
  ): Promise<ExtractedContent> {
    const opts = { ...this.DEFAULT_OPTIONS, ...options };
    
    if (!webview) {
      console.error('No webview available for extracting page content');
      return { title: '', description: '', content: '', url: '' };
    }
    
    let currentUrl = '';
    try {
      currentUrl = webview.src || '';
    } catch (e) {
      console.error('Error getting webview URL:', e);
      return { title: '', description: '', content: '', url: '' };
    }
    
    // Check for problematic sites
    if (URLUtils.isProblematicSite(currentUrl)) {
      // console.log('Using safer content extraction for problematic site:', currentUrl);
      return {
        title: webview.getTitle?.() || '',
        description: '',
        content: 'Content extraction skipped for this site to prevent rendering issues.',
        url: currentUrl
      };
    }
    
    return new Promise((resolve) => {
      try {
        // Check if webview is still loading
        if (webview.isLoading && typeof webview.isLoading === 'function' && webview.isLoading()) {
          // console.log('Waiting for webview to finish loading before extracting content');
          
          const loadListener = () => {
            // console.log('Page finished loading, extracting content after short delay');
            setTimeout(() => {
              this.extractPageContent(webview, opts)
                .then(resolve)
                .catch(e => {
                  console.error('Error in delayed content extraction:', e);
                  resolve({
                    title: webview.getTitle?.() || '',
                    content: 'Error extracting content',
                    url: currentUrl
                  });
                });
            }, 500);
          };
          
          // Set a timeout to avoid waiting forever
          setTimeout(() => {
            webview.removeEventListener('did-finish-load', loadListener);
            resolve({
              title: webview.getTitle?.() || '',
              content: 'Timeout while waiting for page to load',
              url: currentUrl
            });
          }, opts.timeout || 5000);
          
          webview.addEventListener('did-finish-load', loadListener, { once: true });
          return;
        }
        
        // Execute extraction script
        const extractScript = this.buildExtractionScript(opts);
        
        const timeoutPromise = new Promise((_, timeoutReject) => {
          setTimeout(() => timeoutReject(new Error('Script execution timed out')), opts.timeout || 5000);
        });
        
        Promise.race([
          webview.executeJavaScript(extractScript),
          timeoutPromise
        ])
        .then((pageInfo: ExtractedContent) => {
          // console.log('Extracted page content, length:', pageInfo?.content?.length || 0);
          if (pageInfo?.htmlContent) {
            // console.log('HTML content extracted, length:', pageInfo.htmlContent.length);
          }
          resolve(pageInfo || { title: '', content: '', url: '' });
        })
        .catch(err => {
          console.error('Error executing extraction script:', err);
          resolve({
            title: webview.getTitle?.() || '',
            content: `Error: ${err.message}`,
            url: currentUrl
          });
        });
        
      } catch (error) {
        console.error('Error in extractPageContent:', error);
        resolve({ title: '', content: '', url: currentUrl });
      }
    });
  }

  /**
   * Build the JavaScript extraction script based on options
   */
  private static buildExtractionScript(opts: ContentExtractionOptions): string {
    return `
      (function() {
        try {
          const title = document.title || '';
          
          let description = "";
          try {
            const metaDesc = document.querySelector('meta[name="description"]');
            if (metaDesc) description = metaDesc.getAttribute('content') || '';
          } catch(e) {
            console.error('Error getting meta description:', e);
          }
          
          const mainContent = document.querySelector('article') || 
                            document.querySelector('main') || 
                            document.querySelector('.content') ||
                            document.querySelector('#content') ||
                            document.body;
          
          const result = {
            title: title,
            description: description,
            content: '',
            url: window.location.href,
            htmlContent: '',
            links: [],
            images: []
          };
          
          if (!mainContent) {
            return result;
          }
          
          const clone = mainContent.cloneNode(true);
          
          clone.querySelectorAll('script, style, iframe, noscript, svg, canvas, nav, header, footer, .sidebar, .advertisement, .ad, .popup').forEach(el => el.remove());
          
          ${opts.preserveLinks ? this.getLinkProcessingScript() : ''}
          ${opts.includeHtml ? this.getHTMLExtractionScript() : ''}
          
          result.content = clone.innerText || clone.textContent || '';
          result.content = result.content.replace(/\\s+/g, ' ').trim();
          
          const images = mainContent.querySelectorAll('img[src]');
          images.forEach(img => {
            const src = img.getAttribute('src');
            const alt = img.getAttribute('alt');
            if (src) {
              result.images.push({ url: src, alt: alt || '' });
            }
          });
          
          return result;
        } catch(error) {
          console.error('Error in content extraction script:', error);
          return {
            title: document.title || '',
            content: 'Error extracting content: ' + error.message,
            url: window.location.href,
            links: [],
            images: []
          };
        }
      })();
    `;
  }

  private static getLinkProcessingScript(): string {
    return `
      clone.querySelectorAll('a').forEach(link => {
        if (link.href) {
          const originalText = link.textContent.trim();
          link.textContent = originalText + " [LINK: " + link.href + "]";
          link.setAttribute('data-extracted-link', 'true');
          
          result.links.push({
            url: link.href,
            text: originalText
          });
        }
      });
    `;
  }

  private static getHTMLExtractionScript(): string {
    return `
      result.htmlContent = clone.innerHTML;
    `;
  }

  /**
   * Extract links from webview
   */
  static async extractLinksFromWebview(webview: any): Promise<Array<{ url: string; text: string }>> {
    if (!webview) {
      console.error('No webview provided for link extraction');
      return [];
    }

    try {
      const result = await webview.executeJavaScript(`
        (function() {
          const links = [];
          const linkElements = document.querySelectorAll('a[href]');
          
          linkElements.forEach(link => {
            const href = link.href;
            const text = link.textContent?.trim() || '';
            
            if (href && text && href.startsWith('http')) {
              links.push({ url: href, text: text });
            }
          });
          
          return links;
        })();
      `);

      // console.log(`Extracted ${result.length} links from page`);
      return result || [];
    } catch (error) {
      console.error('Error extracting links:', error);
      return [];
    }
  }

  /**
   * Extract content snippet (short summary of page content)
   */
  static async extractContentSnippet(webview: any, maxLength: number = 500): Promise<string> {
    if (!webview) return '';

    try {
      const snippet = await webview.executeJavaScript(`
        (function() {
          const mainContent = document.querySelector('article') || 
                            document.querySelector('main') || 
                            document.querySelector('.content') ||
                            document.querySelector('#content');
          
          if (mainContent) {
            const paragraphs = mainContent.querySelectorAll('p');
            if (paragraphs && paragraphs.length > 0) {
              for (const p of paragraphs) {
                const text = p.innerText.trim();
                if (text.length > 100) {
                  return text.substring(0, ${maxLength}) + (text.length > ${maxLength} ? '...' : '');
                }
              }
            }
            
            const mainText = mainContent.innerText.trim();
            return mainText.substring(0, ${maxLength}) + (mainText.length > ${maxLength} ? '...' : '');
          }
          
          const bodyText = document.body.innerText.trim();
          return bodyText.substring(0, ${maxLength}) + (bodyText.length > ${maxLength} ? '...' : '');
        })();
      `);

      return snippet?.replace(/\s+/g, ' ').trim() || '';
    } catch (error) {
      console.error('Error extracting content snippet:', error);
      return '';
    }
  }

  /**
   * Extract text content only (no HTML)
   */
  static async extractTextContent(webview: any): Promise<string> {
    if (!webview) return '';

    try {
      const content = await webview.executeJavaScript(`
        (function() {
          const mainContent = document.querySelector('article') || 
                            document.querySelector('main') || 
                            document.querySelector('.content') ||
                            document.querySelector('#content') ||
                            document.body;
          
          if (mainContent) {
            const clone = mainContent.cloneNode(true);
            clone.querySelectorAll('script, style, nav, header, footer, .sidebar').forEach(el => el.remove());
            return clone.textContent || clone.innerText || '';
          }
          
          return document.body.textContent || '';
        })();
      `);

      return content?.replace(/\s+/g, ' ').trim() || '';
    } catch (error) {
      console.error('Error extracting text content:', error);
      return '';
    }
  }

  /**
   * Extract metadata from page
   */
  static async extractMetadata(webview: any): Promise<Record<string, string>> {
    if (!webview) return {};

    try {
      const metadata = await webview.executeJavaScript(`
        (function() {
          const result = {};
          
          result.title = document.title || '';
          result.url = window.location.href;
          
          const metaTags = document.querySelectorAll('meta');
          metaTags.forEach(meta => {
            const name = meta.getAttribute('name') || meta.getAttribute('property');
            const content = meta.getAttribute('content');
            
            if (name && content) {
              switch (name.toLowerCase()) {
                case 'description':
                case 'og:description':
                  result.description = content;
                  break;
                case 'keywords':
                  result.keywords = content;
                  break;
                case 'author':
                case 'og:author':
                  result.author = content;
                  break;
                case 'article:published_time':
                case 'og:published_time':
                  result.publishedTime = content;
                  break;
                case 'og:image':
                  result.image = content;
                  break;
              }
            }
          });
          
          result.language = document.documentElement.lang || '';
          
          return result;
        })();
      `);

      return metadata || {};
    } catch (error) {
      console.error('Error extracting metadata:', error);
      return {};
    }
  }
} 