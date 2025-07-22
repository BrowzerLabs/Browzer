import { DoStep } from '../services/DoAgent';
import { getBestSelector } from './browserAutomation';

export interface TaskIntent {
  type: 'shopping' | 'search' | 'navigation' | 'extraction' | 'form_fill' | 'travel' | 'generic';
  confidence: number;
  entities: TaskEntity[];
  context: TaskContext;
}

export interface TaskEntity {
  type: 'product' | 'website' | 'search_term' | 'url' | 'price_filter' | 'form_field' | 'action' | 'travel_destination' | 'travel_date' | 'travel_type';
  value: string;
  confidence: number;
}

export interface TaskContext {
  urgency: 'low' | 'medium' | 'high';
  complexity: 'simple' | 'medium' | 'complex';
  expectedDuration: number; // in milliseconds
  riskLevel: 'low' | 'medium' | 'high';
}

export class TaskParser {
  private shoppingKeywords = [
    'buy', 'purchase', 'shop', 'find', 'search for', 'cheapest', 'best price',
    'lowest price', 'deals', 'discount', 'sale', 'order', 'add to cart'
  ];

  private searchKeywords = [
    'search', 'find', 'look for', 'google', 'bing', 'yahoo', 'duckduckgo',
    'research', 'discover', 'explore', 'investigate'
  ];

  private navigationKeywords = [
    'go to', 'navigate to', 'open', 'visit', 'browse to', 'load', 'access'
  ];

  private extractionKeywords = [
    'extract', 'get', 'download', 'copy', 'scrape', 'collect', 'gather',
    'save', 'export', 'capture'
  ];

  private formKeywords = [
    'fill', 'complete', 'submit', 'enter', 'input', 'type', 'select',
    'choose', 'upload', 'login', 'register', 'sign up', 'sign in'
  ];

  private travelKeywords = [
    'flight', 'flights', 'ticket', 'tickets', 'book', 'travel', 'fly',
    'airline', 'airport', 'trip', 'journey', 'vacation', 'hotel', 'booking'
  ];

  private priceFilters = [
    'cheapest', 'lowest price', 'best price', 'under', 'below', 'less than',
    'maximum', 'budget', 'affordable', 'expensive', 'premium', 'high-end'
  ];

  private websites = [
    'amazon', 'ebay', 'walmart', 'target', 'bestbuy', 'google', 'youtube',
    'facebook', 'twitter', 'instagram', 'linkedin', 'github', 'stackoverflow',
    'expedia', 'booking', 'kayak', 'priceline', 'orbitz', 'travelocity', 'skyscanner'
  ];

  /**
   * Parse a natural language instruction into structured task intent
   */
  parseInstruction(instruction: string): TaskIntent {
    const normalizedInstruction = instruction.toLowerCase().trim();
    
    // Determine task type
    const taskType = this.determineTaskType(normalizedInstruction);
    
    // Extract entities
    const entities = this.extractEntities(normalizedInstruction, taskType);
    
    // Determine context
    const context = this.determineContext(normalizedInstruction, taskType);
    
    // Calculate confidence based on keyword matches and entity extraction
    const confidence = this.calculateConfidence(normalizedInstruction, taskType, entities);

    return {
      type: taskType,
      confidence,
      entities,
      context
    };
  }

  /**
   * Generate DoSteps from parsed task intent
   */
  generateSteps(intent: TaskIntent, instruction: string): DoStep[] {
    switch (intent.type) {
      case 'shopping':
        return this.generateShoppingSteps(intent, instruction);
      case 'search':
        return this.generateSearchSteps(intent, instruction);
      case 'navigation':
        return this.generateNavigationSteps(intent, instruction);
      case 'extraction':
        return this.generateExtractionSteps(intent, instruction);
      case 'form_fill':
        return this.generateFormSteps(intent, instruction);
      case 'travel':
        return this.generateTravelSteps(intent, instruction);
      default:
        return this.generateGenericSteps(intent, instruction);
    }
  }

  private determineTaskType(instruction: string): TaskIntent['type'] {
    const scores = {
      travel: this.calculateKeywordScore(instruction, this.travelKeywords),
      shopping: this.calculateKeywordScore(instruction, this.shoppingKeywords),
      search: this.calculateKeywordScore(instruction, this.searchKeywords),
      navigation: this.calculateKeywordScore(instruction, this.navigationKeywords),
      extraction: this.calculateKeywordScore(instruction, this.extractionKeywords),
      form_fill: this.calculateKeywordScore(instruction, this.formKeywords),
      generic: 0.1 // Base score for generic tasks
    };

    // Boost travel if we detect travel-related patterns
    if (this.isTravelPattern(instruction)) {
      scores.travel += 0.4;
    }

    // Boost shopping if we detect e-commerce sites (but not for travel)
    if (this.websites.some(site => instruction.includes(site) && !['expedia', 'booking', 'kayak', 'priceline', 'orbitz', 'travelocity', 'skyscanner'].includes(site))) {
      scores.shopping += 0.3;
    }

    // Boost travel if we detect travel sites
    if (['expedia', 'booking', 'kayak', 'priceline', 'orbitz', 'travelocity', 'skyscanner'].some(site => instruction.includes(site))) {
      scores.travel += 0.3;
    }

    // Boost search if it looks like a query
    if (instruction.includes('?') || instruction.match(/what|how|where|when|why|who/)) {
      scores.search += 0.2;
    }

    // Find the highest scoring type
    const maxScore = Math.max(...Object.values(scores));
    const taskType = Object.keys(scores).find(key => scores[key as keyof typeof scores] === maxScore) as TaskIntent['type'];

    return taskType;
  }

  private isTravelPattern(instruction: string): boolean {
    // Check for travel-specific patterns
    const travelPatterns = [
      /tickets?\s+from\s+.+\s+to\s+.+/,
      /flights?\s+from\s+.+\s+to\s+.+/,
      /fly\s+from\s+.+\s+to\s+.+/,
      /travel\s+from\s+.+\s+to\s+.+/,
      /book\s+.+\s+flight/,
      /\w+\s+to\s+\w+\s+and\s+back/,
      /round\s+trip/,
      /one\s+way/,
      /\d+th\s+to\s+\d+th/,
      /\d+st\s+to\s+\d+st/,
      /\d+nd\s+to\s+\d+nd/,
      /\d+rd\s+to\s+\d+rd/,
      /(january|february|march|april|may|june|july|august|september|october|november|december)/,
      /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/
    ];

    return travelPatterns.some(pattern => pattern.test(instruction));
  }

  private calculateKeywordScore(instruction: string, keywords: string[]): number {
    let score = 0;
    for (const keyword of keywords) {
      if (instruction.includes(keyword)) {
        score += 1 / keywords.length; // Normalize by keyword count
      }
    }
    return score;
  }

  private extractEntities(instruction: string, taskType: TaskIntent['type']): TaskEntity[] {
    const entities: TaskEntity[] = [];

    // Extract website entities
    for (const website of this.websites) {
      if (instruction.includes(website)) {
        entities.push({
          type: 'website',
          value: website,
          confidence: 0.9
        });
      }
    }

    // Extract URL entities
    const urlRegex = /https?:\/\/[^\s]+/g;
    const urls = instruction.match(urlRegex);
    if (urls) {
      urls.forEach(url => {
        entities.push({
          type: 'url',
          value: url,
          confidence: 1.0
        });
      });
    }

    // Extract price filter entities
    for (const filter of this.priceFilters) {
      if (instruction.includes(filter)) {
        entities.push({
          type: 'price_filter',
          value: filter,
          confidence: 0.8
        });
      }
    }

    // Extract product/search terms based on task type
    if (taskType === 'shopping') {
      const productEntity = this.extractProductEntity(instruction);
      if (productEntity) {
        entities.push(productEntity);
      }
    } else if (taskType === 'search') {
      const searchEntity = this.extractSearchEntity(instruction);
      if (searchEntity) {
        entities.push(searchEntity);
      }
    }

    return entities;
  }

  private extractProductEntity(instruction: string): TaskEntity | null {
    // Common patterns for product extraction
    const patterns = [
      /(?:find|search for|buy|purchase|cheapest|best)\s+(.+?)\s+(?:on|from|at)/,
      /(?:find|search for|buy|purchase|cheapest|best)\s+(.+)$/,
      /(.+?)\s+(?:on|from|at)\s+(?:amazon|ebay|walmart|target)/
    ];

    for (const pattern of patterns) {
      const match = instruction.match(pattern);
      if (match && match[1]) {
        const product = match[1].trim();
        // Filter out common words that aren't products
        const filterWords = ['the', 'a', 'an', 'some', 'any', 'best', 'good', 'cheap'];
        const cleanProduct = product.split(' ').filter(word => !filterWords.includes(word)).join(' ');
        
        if (cleanProduct.length > 0) {
          return {
            type: 'product',
            value: cleanProduct,
            confidence: 0.8
          };
        }
      }
    }

    return null;
  }

  private extractSearchEntity(instruction: string): TaskEntity | null {
    const patterns = [
      /(?:search for|find|look for|google)\s+(.+)$/,
      /(?:what is|what are|how to|where is|who is)\s+(.+)$/
    ];

    for (const pattern of patterns) {
      const match = instruction.match(pattern);
      if (match && match[1]) {
        return {
          type: 'search_term',
          value: match[1].trim(),
          confidence: 0.8
        };
      }
    }

    return null;
  }

  private determineContext(instruction: string, taskType: TaskIntent['type']): TaskContext {
    // Determine urgency
    const urgencyKeywords = {
      high: ['urgent', 'asap', 'immediately', 'now', 'quickly', 'fast'],
      medium: ['soon', 'today', 'this week'],
      low: ['later', 'sometime', 'when possible']
    };

    let urgency: TaskContext['urgency'] = 'medium';
    for (const [level, keywords] of Object.entries(urgencyKeywords)) {
      if (keywords.some(keyword => instruction.includes(keyword))) {
        urgency = level as TaskContext['urgency'];
        break;
      }
    }

    // Determine complexity
    const complexityFactors = {
      simple: ['single', 'just', 'only', 'simple'],
      complex: ['multiple', 'several', 'compare', 'analyze', 'detailed']
    };

    let complexity: TaskContext['complexity'] = 'medium';
    for (const [level, keywords] of Object.entries(complexityFactors)) {
      if (keywords.some(keyword => instruction.includes(keyword))) {
        complexity = level as TaskContext['complexity'];
        break;
      }
    }

    // Estimate duration based on task type and complexity
    const baseDurations = {
      navigation: 2000,
      search: 5000,
      shopping: 10000,
      extraction: 8000,
      form_fill: 6000,
      travel: 15000,
      generic: 5000
    };

    const complexityMultipliers = {
      simple: 0.7,
      medium: 1.0,
      complex: 1.5
    };

    const expectedDuration = baseDurations[taskType] * complexityMultipliers[complexity];

    // Determine risk level
    const riskFactors = {
      high: ['delete', 'remove', 'purchase', 'buy', 'order', 'submit', 'payment'],
      medium: ['login', 'register', 'upload', 'download', 'form'],
      low: ['search', 'find', 'view', 'read', 'browse']
    };

    let riskLevel: TaskContext['riskLevel'] = 'low';
    for (const [level, keywords] of Object.entries(riskFactors)) {
      if (keywords.some(keyword => instruction.includes(keyword))) {
        riskLevel = level as TaskContext['riskLevel'];
        break;
      }
    }

    return {
      urgency,
      complexity,
      expectedDuration,
      riskLevel
    };
  }

  private calculateConfidence(instruction: string, taskType: TaskIntent['type'], entities: TaskEntity[]): number {
    let confidence = 0.5; // Base confidence

    // Boost confidence based on entity extraction
    const entityBoost = Math.min(entities.length * 0.1, 0.3);
    confidence += entityBoost;

    // Boost confidence based on keyword matches
    const keywordMap = {
      shopping: this.shoppingKeywords,
      search: this.searchKeywords,
      navigation: this.navigationKeywords,
      extraction: this.extractionKeywords,
      form_fill: this.formKeywords,
      travel: this.travelKeywords,
      generic: []
    };

    const keywordScore = this.calculateKeywordScore(instruction, keywordMap[taskType]);
    confidence += keywordScore * 0.3;

    // Boost confidence if we have specific patterns
    if (taskType === 'shopping' && entities.some(e => e.type === 'product')) {
      confidence += 0.2;
    }

    if (taskType === 'search' && entities.some(e => e.type === 'search_term')) {
      confidence += 0.2;
    }

    if (taskType === 'navigation' && entities.some(e => e.type === 'url' || e.type === 'website')) {
      confidence += 0.2;
    }

    if (taskType === 'travel' && entities.some(e => e.type === 'travel_destination' || e.type === 'travel_date')) {
      confidence += 0.2;
    }

    return Math.min(confidence, 1.0);
  }

  private generateTravelSteps(intent: TaskIntent, instruction: string): DoStep[] {
    const steps: DoStep[] = [];
    
    // Extract travel information
    const travelData = this.extractTravelData(instruction);
    
    // Use Google Flights for flight searches
    steps.push({
      id: 'navigate-flights',
      action: 'navigate',
      target: 'https://www.google.com/travel/flights',
      description: 'Navigate to Google Flights',
      status: 'pending'
    });

    steps.push({
      id: 'wait-flights-load',
      action: 'wait',
      value: '3000',
      description: 'Wait for Google Flights to load',
      status: 'pending'
    });

    // Fill origin
    if (travelData.origin) {
      steps.push({
        id: 'fill-origin',
        action: 'type',
        selector: 'input[placeholder*="Where from"], input[aria-label*="Where from"], input[placeholder*="From"]',
        value: travelData.origin,
        description: `Enter origin: ${travelData.origin}`,
        status: 'pending'
      });

      steps.push({
        id: 'wait-origin',
        action: 'wait',
        value: '1000',
        description: 'Wait for origin selection',
        status: 'pending'
      });
    }

    // Fill destination
    if (travelData.destination) {
      steps.push({
        id: 'fill-destination',
        action: 'type',
        selector: 'input[placeholder*="Where to"], input[aria-label*="Where to"], input[placeholder*="To"]',
        value: travelData.destination,
        description: `Enter destination: ${travelData.destination}`,
        status: 'pending'
      });

      steps.push({
        id: 'wait-destination',
        action: 'wait',
        value: '1000',
        description: 'Wait for destination selection',
        status: 'pending'
      });
    }

    // Set trip type if round trip
    if (travelData.isRoundTrip) {
      steps.push({
        id: 'select-roundtrip',
        action: 'click',
        selector: '[data-value="RoundTrip"], [aria-label*="Round trip"], input[value="roundtrip"]',
        description: 'Select round trip',
        status: 'pending'
      });
    }

    // Fill departure date
    if (travelData.departureDate) {
      steps.push({
        id: 'fill-departure',
        action: 'click',
        selector: 'input[placeholder*="Departure"], input[aria-label*="Departure"]',
        description: 'Open departure date picker',
        status: 'pending'
      });

      steps.push({
        id: 'wait-departure-picker',
        action: 'wait',
        value: '1000',
        description: 'Wait for date picker',
        status: 'pending'
      });
    }

    // Fill return date
    if (travelData.returnDate) {
      steps.push({
        id: 'fill-return',
        action: 'click',
        selector: 'input[placeholder*="Return"], input[aria-label*="Return"]',
        description: 'Open return date picker',
        status: 'pending'
      });

      steps.push({
        id: 'wait-return-picker',
        action: 'wait',
        value: '1000',
        description: 'Wait for return date picker',
        status: 'pending'
      });
    }

    // Search for flights
    steps.push({
      id: 'search-flights',
      action: 'click',
      selector: 'button[aria-label*="Search"], button[jsaction*="search"], button:contains("Search")',
      description: 'Search for flights',
      status: 'pending'
    });

    steps.push({
      id: 'wait-results',
      action: 'wait',
      value: '5000',
      description: 'Wait for flight results',
      status: 'pending'
    });

    // Sort by price if requested
    if (instruction.includes('cheapest') || instruction.includes('lowest price')) {
      steps.push({
        id: 'sort-price',
        action: 'click',
        selector: 'button[aria-label*="Price"], button[data-sort="price"], [aria-label*="Sort by price"]',
        description: 'Sort by price',
        status: 'pending'
      });

      steps.push({
        id: 'wait-sort',
        action: 'wait',
        value: '2000',
        description: 'Wait for sorting',
        status: 'pending'
      });
    }

    steps.push({
      id: 'extract-flights',
      action: 'extract',
      description: 'Extract flight information',
      status: 'pending'
    });

    return steps;
  }

  private extractTravelData(instruction: string): any {
    const data: any = {};

    // Extract origin and destination
    const routePatterns = [
      /(?:from|leaving)\s+([A-Z]{3}|[A-Za-z\s]+)\s+to\s+([A-Z]{3}|[A-Za-z\s]+)/,
      /([A-Z]{3}|[A-Za-z\s]+)\s+to\s+([A-Z]{3}|[A-Za-z\s]+)/
    ];

    for (const pattern of routePatterns) {
      const match = instruction.match(pattern);
      if (match) {
        data.origin = match[1].trim();
        data.destination = match[2].trim();
        break;
      }
    }

    // Check for round trip
    data.isRoundTrip = instruction.includes('back to') || instruction.includes('return') || instruction.includes('round trip');

    // Extract dates
    const datePattern = /(\d{1,2}(?:st|nd|rd|th)?)\s+to\s+(\d{1,2}(?:st|nd|rd|th)?)\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i;
    const dateMatch = instruction.match(datePattern);
    if (dateMatch) {
      data.departureDate = `${dateMatch[1]} ${dateMatch[3]}`;
      data.returnDate = `${dateMatch[2]} ${dateMatch[3]}`;
    }

    return data;
  }

  private generateShoppingSteps(intent: TaskIntent, instruction: string): DoStep[] {
    const steps: DoStep[] = [];
    
    const productEntity = intent.entities.find(e => e.type === 'product');
    const websiteEntity = intent.entities.find(e => e.type === 'website');
    const priceFilterEntity = intent.entities.find(e => e.type === 'price_filter');
    
    const product = productEntity?.value || this.extractProductName(instruction);
    const website = websiteEntity?.value || this.extractPlatform(instruction);

    if (website === 'amazon') {
      steps.push({
        id: 'navigate-amazon',
        action: 'navigate',
        target: 'https://www.amazon.com',
        description: 'Navigate to Amazon.com',
        status: 'pending'
      });

      steps.push({
        id: 'wait-load',
        action: 'wait',
        value: '2000',
        description: 'Wait for page to load',
        status: 'pending'
      });

      steps.push({
        id: 'search-product',
        action: 'type',
        selector: getBestSelector('https://amazon.com', 'searchBox'),
        value: product,
        description: `Search for "${product}"`,
        status: 'pending'
      });

      steps.push({
        id: 'submit-search',
        action: 'click',
        selector: getBestSelector('https://amazon.com', 'searchButton'),
        description: 'Submit search',
        status: 'pending'
      });

      steps.push({
        id: 'wait-results',
        action: 'wait',
        value: '3000',
        description: 'Wait for search results',
        status: 'pending'
      });

      // Add price sorting if requested
      if (priceFilterEntity && (priceFilterEntity.value.includes('cheapest') || priceFilterEntity.value.includes('lowest'))) {
        steps.push({
          id: 'sort-price',
          action: 'click',
          selector: '#s-result-sort-select',
          description: 'Sort by price (low to high)',
          status: 'pending'
        });

        steps.push({
          id: 'wait-sort',
          action: 'wait',
          value: '2000',
          description: 'Wait for sorting',
          status: 'pending'
        });
      }

      steps.push({
        id: 'extract-results',
        action: 'extract',
        description: 'Extract product information',
        status: 'pending'
      });
    } else {
      // Generic shopping via Google
      steps.push({
        id: 'navigate-google',
        action: 'navigate',
        target: 'https://www.google.com',
        description: 'Navigate to Google',
        status: 'pending'
      });

      steps.push({
        id: 'search-google',
        action: 'type',
        selector: getBestSelector('https://google.com', 'searchBox'),
        value: `${product} ${website}`,
        description: `Search for "${product}" on ${website}`,
        status: 'pending'
      });

      steps.push({
        id: 'submit-google',
        action: 'click',
        selector: getBestSelector('https://google.com', 'searchButton'),
        description: 'Submit search',
        status: 'pending'
      });

      steps.push({
        id: 'extract-google',
        action: 'extract',
        description: 'Extract search results',
        status: 'pending'
      });
    }

    return steps;
  }

  private generateSearchSteps(intent: TaskIntent, instruction: string): DoStep[] {
    const steps: DoStep[] = [];
    
    const searchEntity = intent.entities.find(e => e.type === 'search_term');
    const searchTerm = searchEntity?.value || this.extractSearchTerm(instruction);

    steps.push({
      id: 'navigate-search',
      action: 'navigate',
      target: 'https://www.google.com',
      description: 'Navigate to Google',
      status: 'pending'
    });

    steps.push({
      id: 'enter-search',
      action: 'type',
      selector: getBestSelector('https://google.com', 'searchBox'),
      value: searchTerm,
      description: `Search for "${searchTerm}"`,
      status: 'pending'
    });

    steps.push({
      id: 'submit-search',
      action: 'click',
      selector: getBestSelector('https://google.com', 'searchButton'),
      description: 'Submit search',
      status: 'pending'
    });

    steps.push({
      id: 'extract-results',
      action: 'extract',
      description: 'Extract search results',
      status: 'pending'
    });

    return steps;
  }

  private generateNavigationSteps(intent: TaskIntent, instruction: string): DoStep[] {
    const steps: DoStep[] = [];
    
    const urlEntity = intent.entities.find(e => e.type === 'url');
    const websiteEntity = intent.entities.find(e => e.type === 'website');
    
    let url = urlEntity?.value;
    if (!url && websiteEntity) {
      url = `https://www.${websiteEntity.value}.com`;
    }
    if (!url) {
      url = this.extractUrl(instruction);
    }

    steps.push({
      id: 'navigate-url',
      action: 'navigate',
      target: url,
      description: `Navigate to ${url}`,
      status: 'pending'
    });

    steps.push({
      id: 'wait-load',
      action: 'wait',
      value: '2000',
      description: 'Wait for page to load',
      status: 'pending'
    });

    return steps;
  }

  private generateExtractionSteps(intent: TaskIntent, instruction: string): DoStep[] {
    const steps: DoStep[] = [];

    // For extraction, we assume the user is already on the target page
    steps.push({
      id: 'wait-ready',
      action: 'wait',
      value: '1000',
      description: 'Wait for page to be ready',
      status: 'pending'
    });

    steps.push({
      id: 'extract-content',
      action: 'extract',
      description: 'Extract page content',
      status: 'pending'
    });

    return steps;
  }

  private generateFormSteps(intent: TaskIntent, instruction: string): DoStep[] {
    const steps: DoStep[] = [];
    
    // This is a simplified form filling - in a real implementation,
    // you'd need to analyze the form structure and match fields
    steps.push({
      id: 'wait-form',
      action: 'wait',
      value: '1000',
      description: 'Wait for form to load',
      status: 'pending'
    });

    steps.push({
      id: 'fill-form',
      action: 'type',
      selector: 'input[type="text"]:first, input[type="email"]:first',
      value: 'form-data',
      description: 'Fill form fields',
      status: 'pending'
    });

    return steps;
  }

  private generateGenericSteps(intent: TaskIntent, instruction: string): DoStep[] {
    const steps: DoStep[] = [];

    steps.push({
      id: 'navigate-google',
      action: 'navigate',
      target: 'https://www.google.com',
      description: 'Navigate to Google',
      status: 'pending'
    });

    steps.push({
      id: 'search-generic',
      action: 'type',
      selector: getBestSelector('https://google.com', 'searchBox'),
      value: instruction,
      description: `Search for "${instruction}"`,
      status: 'pending'
    });

    steps.push({
      id: 'submit-generic',
      action: 'click',
      selector: getBestSelector('https://google.com', 'searchButton'),
      description: 'Submit search',
      status: 'pending'
    });

    return steps;
  }

  // Helper methods (using existing logic from DoAgent)
  private extractProductName(instruction: string): string {
    const productPatterns = [
      /find\s+(.+?)\s+on/,
      /cheapest\s+(.+?)\s+on/,
      /best\s+(.+?)\s+on/,
      /buy\s+(.+?)\s+on/,
      /shop\s+for\s+(.+?)\s+on/,
      /find\s+(.+)/,
      /cheapest\s+(.+)/,
      /best\s+(.+)/,
      /buy\s+(.+)/
    ];

    for (const pattern of productPatterns) {
      const match = instruction.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    return instruction;
  }

  private extractPlatform(instruction: string): string {
    if (instruction.includes('amazon')) return 'amazon';
    if (instruction.includes('ebay')) return 'ebay';
    if (instruction.includes('walmart')) return 'walmart';
    if (instruction.includes('target')) return 'target';
    return 'google';
  }

  private extractSearchTerm(instruction: string): string {
    const searchPatterns = [
      /search\s+for\s+(.+)/,
      /find\s+(.+)/,
      /look\s+for\s+(.+)/,
      /google\s+(.+)/
    ];

    for (const pattern of searchPatterns) {
      const match = instruction.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    return instruction;
  }

  private extractUrl(instruction: string): string {
    const urlPattern = /(?:go to|navigate to|open|visit)\s+(.+)/;
    const match = instruction.match(urlPattern);
    
    if (match) {
      let url = match[1].trim();
      if (!url.startsWith('http')) {
        url = 'https://' + url;
      }
      return url;
    }

    return 'https://www.google.com';
  }
} 