import requests
import json
from datetime import datetime
import os

LOG_FILE = os.path.join(os.path.dirname(__file__), 'crypto_agent.log')
def log_event(message):
    with open(LOG_FILE, 'a') as f:
        f.write(f"[{datetime.now().isoformat()}] {message}\n")

class CryptoAgent:
    def __init__(self):
        self.base_url = "https://api.coingecko.com/api/v3"
        log_event("Initialized CryptoAgent")

    def get_crypto_summary(self, query):
        try:
            log_event(f"Fetching crypto data for query: {query}")
            # Use CoinGecko API which doesn't require API key
            response = requests.get(
                f"{self.base_url}/coins/markets",
                params={
                    'vs_currency': 'usd',
                    'order': 'market_cap_desc',
                    'per_page': 5,
                    'page': 1
                }
            )
            
            log_event(f"Response status code: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                
                summary = {
                    'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                    'cryptocurrencies': []
                }
                
                for crypto in data:
                    summary['cryptocurrencies'].append({
                        'name': crypto['name'],
                        'symbol': crypto['symbol'].upper(),
                        'price': f"${crypto['current_price']:.2f}",
                        'change_24h': f"{crypto['price_change_percentage_24h']:.2f}%",
                        'market_cap': f"${crypto['market_cap']:,.0f}"
                    })
                
                log_event(f"Successfully fetched data for {len(summary['cryptocurrencies'])} cryptocurrencies")
                return {
                    'success': True,
                    'data': summary
                }
            else:
                log_event(f"API request failed with status {response.status_code}")
                return {
                    'success': False,
                    'error': f"API request failed with status {response.status_code}"
                }
                
        except Exception as e:
            log_event(f"Error in get_crypto_summary: {e}")
            return {
                'success': False,
                'error': str(e)
            }

    def process_query(self, query):
        log_event(f"Processing query: {query}")
        return self.get_crypto_summary(query)

if __name__ == "__main__":
    # Test the agent
    import sys
    query = sys.argv[1] if len(sys.argv) > 1 else "crypto"
    agent = CryptoAgent()
    result = agent.process_query(query)
    print(json.dumps(result, indent=2))
    log_event(f"Final result: {json.stringify(result) if hasattr(json, 'stringify') else str(result)}") 