import { BaseHandler } from './base';

import { AutocompleteSuggestion } from '@/shared/types';

export class AutocompleteHandler extends BaseHandler {
  register(): void {
    const { browserService } = this.context;

    this.handle(
      'autocomplete:get-suggestions',
      async (_, query: string): Promise<AutocompleteSuggestion[]> => {
        return browserService.getAutocompleteSuggestions(query);
      }
    );

    this.handle(
      'autocomplete:get-search-suggestions',
      async (_, query: string): Promise<string[]> => {
        return browserService.getSearchSuggestions(query);
      }
    );
  }
}
