export interface FoundInPageResult {
  requestId?: number;
  final?: boolean;
  matches: number;
  activeMatchOrdinal: number;
  selectionArea?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}


