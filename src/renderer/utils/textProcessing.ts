export interface TextSelectionInfo {
  text: string;
  rect: {
    top: number;
    left: number;
    bottom: number;
    right: number;
    width: number;
    height: number;
  } | null;
}

export interface KeywordExtractionOptions {
  maxKeywords?: number;
  minLength?: number;
  includeStopWords?: boolean;
  caseSensitive?: boolean;
}

export class TextProcessing {
  private static readonly STOP_WORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
    'will', 'would', 'could', 'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those',
    'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them', 'there', 'their',
    'about', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'up', 'down',
    'out', 'off', 'over', 'under', 'again', 'further', 'then', 'once'
  ]);

  private static readonly TOPIC_KEYWORDS = {
    'technology': ['tech', 'software', 'computer', 'digital', 'programming', 'code', 'app', 'api', 'database'],
    'finance': ['money', 'investment', 'stock', 'crypto', 'bitcoin', 'finance', 'trading', 'market', 'economy'],
    'health': ['health', 'medical', 'doctor', 'medicine', 'treatment', 'symptom', 'disease', 'wellness'],
    'science': ['science', 'research', 'study', 'experiment', 'discovery', 'theory', 'data', 'analysis'],
    'travel': ['travel', 'trip', 'vacation', 'flight', 'hotel', 'destination', 'tourism', 'journey'],
    'food': ['food', 'recipe', 'cooking', 'restaurant', 'meal', 'ingredients', 'nutrition', 'diet'],
    'entertainment': ['movie', 'music', 'game', 'entertainment', 'show', 'video', 'streaming', 'celebrity'],
    'sports': ['sport', 'game', 'team', 'player', 'match', 'tournament', 'athletics', 'competition'],
    'education': ['education', 'learning', 'school', 'university', 'course', 'study', 'knowledge', 'teaching'],
    'business': ['business', 'company', 'corporate', 'startup', 'entrepreneur', 'marketing', 'sales', 'revenue']
  };

  /**
   * Extract keywords from text using frequency analysis
   */
  static extractKeywords(text: string, options: KeywordExtractionOptions = {}): string[] {
    const {
      maxKeywords = 5,
      minLength = 3,
      includeStopWords = false,
      caseSensitive = false
    } = options;

    if (!text || typeof text !== 'string') return [];

    try {
      // Clean and tokenize text
      const processedText = caseSensitive ? text : text.toLowerCase();
      const words = processedText
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word && word.length >= minLength);

      // Filter stop words if needed
      const filteredWords = includeStopWords 
        ? words 
        : words.filter(word => !this.STOP_WORDS.has(word));

      // Count word frequencies
      const wordFreq = new Map<string, number>();
      filteredWords.forEach(word => {
        wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
      });

      // Sort by frequency and return top keywords
      return Array.from(wordFreq.entries())
        .sort(([, a], [, b]) => b - a)
        .slice(0, maxKeywords)
        .map(([word]) => word);
    } catch (error) {
      console.error('Error extracting keywords:', error);
      return [];
    }
  }

  /**
   * Extract topic from content using keyword matching
   */
  static extractTopic(content: { title?: string; question?: string; answer?: string; content?: string }): string {
    try {
      if (!content) return 'general';

      // Combine all text content
      const fullText = [
        content.title || '',
        content.question || '',
        content.answer || '',
        content.content || ''
      ].join(' ').toLowerCase();

      const topicScores = new Map<string, number>();

      // Calculate scores for each topic
      Object.entries(this.TOPIC_KEYWORDS).forEach(([topic, keywords]) => {
        let score = 0;
        keywords.forEach(keyword => {
          const matches = (fullText.match(new RegExp(keyword, 'g')) || []).length;
          score += matches;
        });
        if (score > 0) {
          topicScores.set(topic, score);
        }
      });

      // Return the topic with the highest score
      if (topicScores.size > 0) {
        const sortedTopics = Array.from(topicScores.entries()).sort(([, a], [, b]) => b - a);
        return sortedTopics[0][0];
      }

      // If no topic detected, extract from significant words
      const words = fullText.split(/\s+/).filter(w => w && w.length > 3);
      if (words.length >= 2) {
        return words.slice(0, 2).join(' ');
      }

      return 'general';
    } catch (error) {
      console.error('Error extracting topic:', error);
      return 'general';
    }
  }

  /**
   * Clean and normalize text
   */
  static cleanText(text: string): string {
    if (!text) return '';

    return text
      .replace(/\s+/g, ' ')  // Replace multiple spaces with single space
      .replace(/\n+/g, ' ')  // Replace newlines with spaces
      .replace(/\t+/g, ' ')  // Replace tabs with spaces
      .trim();
  }

  /**
   * Truncate text to specified length with ellipsis
   */
  static truncateText(text: string, maxLength: number, addEllipsis: boolean = true): string {
    if (!text || text.length <= maxLength) return text;

    const truncated = text.substring(0, maxLength);
    return addEllipsis ? truncated + '...' : truncated;
  }

  /**
   * Split text into sentences
   */
  static splitIntoSentences(text: string): string[] {
    if (!text) return [];

    return text
      .split(/[.!?]+/)
      .map(sentence => sentence.trim())
      .filter(sentence => sentence.length > 0);
  }

  /**
   * Extract the most important sentences from text
   */
  static extractKeySentences(text: string, maxSentences: number = 3): string[] {
    const sentences = this.splitIntoSentences(text);
    
    if (sentences.length <= maxSentences) {
      return sentences;
    }

    // Score sentences by length and keyword density
    const scoredSentences = sentences.map(sentence => {
      const words = sentence.split(/\s+/);
      const lengthScore = Math.min(words.length / 20, 1); // Prefer medium-length sentences
      const keywordScore = this.extractKeywords(sentence, { maxKeywords: 10 }).length / 10;
      
      return {
        sentence,
        score: lengthScore + keywordScore
      };
    });

    return scoredSentences
      .sort((a, b) => b.score - a.score)
      .slice(0, maxSentences)
      .map(item => item.sentence);
  }

  /**
   * Calculate text similarity using simple word overlap
   */
  static calculateSimilarity(text1: string, text2: string): number {
    const words1 = new Set(this.extractKeywords(text1, { maxKeywords: 20 }));
    const words2 = new Set(this.extractKeywords(text2, { maxKeywords: 20 }));

    const intersection = new Set([...words1].filter(word => words2.has(word)));
    const union = new Set([...words1, ...words2]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * Check if text selection exists in webview
   */
  static async checkForTextSelection(webview: any): Promise<TextSelectionInfo | null> {
    if (!webview || !webview.executeJavaScript) {
      console.error('Invalid webview or missing executeJavaScript method');
      return null;
    }

    try {
      const result = await webview.executeJavaScript(`
        (function() {
          const selection = window.getSelection();
          const text = selection.toString().trim();
          if (text.length > 0) {
            const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
            const rect = range ? range.getBoundingClientRect() : null;
            return {
              text: text,
              rect: rect ? {
                top: rect.top,
                left: rect.left,
                bottom: rect.bottom,
                right: rect.right,
                width: rect.width,
                height: rect.height
              } : null
            };
          }
          return null;
        })()
      `);

      return result;
    } catch (err) {
      console.error('Error checking text selection:', err);
      return null;
    }
  }

  /**
   * Inject text selection handler into webview
   */
  static injectSelectionHandler(webview: any, onSelection?: (text: string, rect: any) => void): void {
    if (!webview) return;

    try {
      console.log('Injecting text selection handler for webview:', webview.id);

      const injectionScript = `
        (function() {
          if (window.__browzerSelectionHandler) {
            return;
          }

          window.__browzerSelectionHandler = true;
          
          let selectionTimeout = null;
          
          function handleSelection() {
            try {
              clearTimeout(selectionTimeout);
              selectionTimeout = setTimeout(() => {
                const selection = window.getSelection();
                const text = selection.toString().trim();
                
                if (text && text.length >= 3) {
                  const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
                  if (range) {
                    const rect = range.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) {
                      // Send selection data to parent
                      window.parent.postMessage({
                        type: 'text-selection',
                        text: text,
                        rect: {
                          top: rect.top,
                          left: rect.left,
                          bottom: rect.bottom,
                          right: rect.right,
                          width: rect.width,
                          height: rect.height
                        }
                      }, '*');
                    }
                  }
                }
              }, 100);
            } catch (e) {
              console.error('Error in selection handler:', e);
            }
          }
          
          // Add event listeners
          document.addEventListener('mouseup', handleSelection, true);
          document.addEventListener('selectionchange', handleSelection);
          document.addEventListener('touchend', handleSelection);
          
          // Keyboard shortcut for quick selection
          document.addEventListener('keydown', function(e) {
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'A') {
              e.preventDefault();
              const selection = window.getSelection();
              const text = selection.toString().trim();
              
              if (text) {
                window.parent.postMessage({
                  type: 'text-selection-quick',
                  text: text
                }, '*');
              }
            }
          });
          
          console.log('✓ Text selection handler installed');
        })();
      `;

             webview.executeJavaScript(injectionScript, false)
         .then(() => {
           console.log('✓ Selection handler injection successful');
         })
         .catch((err: Error) => {
           console.log('Selection handler injection failed:', err.message);
         });

     } catch (err) {
       console.log('Error setting up selection handler:', err instanceof Error ? err.message : String(err));
     }
  }

  /**
   * Remove HTML tags from text
   */
  static stripHtml(html: string): string {
    if (!html) return '';

    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }

  /**
   * Highlight keywords in text with HTML markup
   */
  static highlightKeywords(text: string, keywords: string[], className: string = 'highlight'): string {
    if (!text || !keywords.length) return text;

    let highlightedText = text;
    
    keywords.forEach(keyword => {
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
      highlightedText = highlightedText.replace(regex, `<span class="${className}">$&</span>`);
    });

    return highlightedText;
  }

  /**
   * Count words in text
   */
  static countWords(text: string): number {
    if (!text) return 0;
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  }

  /**
   * Estimate reading time in minutes
   */
  static estimateReadingTime(text: string, wordsPerMinute: number = 200): number {
    const wordCount = this.countWords(text);
    return Math.ceil(wordCount / wordsPerMinute);
  }

  /**
   * Extract quoted text from content
   */
  static extractQuotes(text: string): string[] {
    if (!text) return [];

    const quotes: string[] = [];
    
    // Match text in quotes
    const quoteRegex = /["'"](.*?)["'"]/g;
    let match;
    
    while ((match = quoteRegex.exec(text)) !== null) {
      const quote = match[1].trim();
      if (quote.length > 10) { // Only meaningful quotes
        quotes.push(quote);
      }
    }

    return quotes;
  }

  /**
   * Check if text appears to be in a specific language
   */
  static detectLanguage(text: string): string {
    if (!text) return 'unknown';

    // Simple language detection based on common words
    const languagePatterns = {
      'english': /\b(the|and|for|are|but|not|you|all|can|had|her|was|one|our|out|day|get|has|him|his|how|man|new|now|old|see|two|way|who|boy|did|its|let|put|say|she|too|use)\b/g,
      'spanish': /\b(que|de|no|la|el|en|es|se|lo|le|da|su|por|son|con|para|una|las|los|del|al|todo|esta|muy|fue|han|dos|hasta|desde|sobre|tiene|sus)\b/g,
      'french': /\b(de|la|le|et|des|les|du|un|une|que|est|pour|qui|dans|avec|il|ce|son|elle|sur|peut|tout|mais|par)\b/g,
      'german': /\b(der|die|und|in|den|von|zu|das|mit|sich|des|auf|für|ist|im|dem|nicht|ein|eine|als|auch|es|an|werden|aus|er|hat|dass)\b/g
    };

    let bestMatch = 'unknown';
    let highestScore = 0;

    Object.entries(languagePatterns).forEach(([language, pattern]) => {
      const matches = text.match(pattern);
      const score = matches ? matches.length : 0;
      
      if (score > highestScore) {
        highestScore = score;
        bestMatch = language;
      }
    });

    return highestScore > 3 ? bestMatch : 'unknown';
  }
} 