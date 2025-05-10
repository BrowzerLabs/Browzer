import requests
import json
from datetime import datetime
import os
import re
from bs4 import BeautifulSoup
import time
import random

LOG_FILE = os.path.join(os.path.dirname(__file__), 'flight_agent.log')
def log_event(message):
    with open(LOG_FILE, 'a') as f:
        f.write("[{}] {}\n".format(datetime.now().isoformat(), message))

class FlightAgent:
    def __init__(self):
        self.user_agents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Safari/605.1.15',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.107 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36 Edg/90.0.818.66',
        ]
        log_event("Initialized FlightAgent")

    def get_random_user_agent(self):
        return random.choice(self.user_agents)

    def get_webpage_content(self, url):
        try:
            headers = {
                'User-Agent': self.get_random_user_agent(),
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Referer': 'https://www.google.com/',
                'DNT': '1',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            }
            log_event('Sending request to URL: {}'.format(url))
            response = requests.get(url, headers=headers, timeout=10)
            response.raise_for_status()
            log_event('Fetched content for URL: {} (status: {})'.format(url, response.status_code))
            return response.text
        except Exception as e:
            log_event('Error fetching URL {}: {}'.format(url, e))
            return None

    def extract_flight_details(self, page_content, flight_url):
        """Extract flight information from CheapFlights content"""
        log_event('Extracting flight details from CheapFlights page content')
        
        if not page_content:
            return []
            
        soup = BeautifulSoup(page_content, 'html.parser')
        flights = []
        
        try:
            # Try to find the cheapest flights section
            flight_cards = soup.select('div[data-test="deal-card"]')
            if not flight_cards:
                flight_cards = soup.select('.deal-card')  # Alternative class
            
            log_event('Found {} potential flight cards'.format(len(flight_cards)))
            
            for card in flight_cards[:5]:  # Get up to 5 flights
                try:
                    # Extract price
                    price_element = card.select_one('[data-test="deal-price"], .deal-price, .price')
                    price = price_element.text.strip() if price_element else "Unknown"
                    
                    # Extract airline
                    airline_element = card.select_one('[data-test="deal-airline"], .deal-airline, .airline')
                    airline = airline_element.text.strip() if airline_element else "Various Airlines"
                    
                    # Extract dates or departure/arrival info
                    date_element = card.select_one('[data-test="deal-dates"], .deal-dates, .dates')
                    dates = date_element.text.strip() if date_element else ""
                    
                    # Extract route information
                    route_element = card.select_one('[data-test="deal-route"], .deal-route, .route')
                    route = route_element.text.strip() if route_element else ""
                    
                    # Extract departure and arrival
                    departure = ""
                    arrival = ""
                    if route:
                        route_parts = route.split(' - ')
                        if len(route_parts) >= 2:
                            departure = route_parts[0]
                            arrival = route_parts[1]
                    
                    # Extract stops/duration
                    stops_element = card.select_one('[data-test="deal-stops"], .deal-stops, .stops')
                    stops = stops_element.text.strip() if stops_element else "Direct"
                    
                    flights.append({
                        'price': price,
                        'airline': airline,
                        'departure': departure or "See details",
                        'arrival': arrival or "See details",
                        'duration': stops or dates
                    })
                    
                except Exception as e:
                    log_event('Error extracting flight details from card: {}'.format(e))
                    continue
        
        except Exception as e:
            log_event('Error in flight extraction: {}'.format(e))
        
        # Extract from table if no cards found
        if not flights:
            try:
                # Try to extract from table
                flight_rows = soup.select('table tbody tr')
                log_event('Found {} rows in flight table'.format(len(flight_rows)))
                
                for row in flight_rows[:5]:  # Get up to 5 flights
                    cells = row.select('td')
                    if len(cells) >= 4:
                        airline = cells[0].text.strip() if len(cells) > 0 else "Various Airlines"
                        price = cells[-1].text.strip() if len(cells) > 0 else "See website"
                        route_info = cells[1].text.strip() if len(cells) > 1 else ""
                        
                        flights.append({
                            'price': price,
                            'airline': airline,
                            'departure': "See details",
                            'arrival': "See details",
                            'duration': route_info
                        })
            except Exception as e:
                log_event('Error extracting from table: {}'.format(e))
        
        # If we still couldn't find flight data, extract the average prices at least
        if not flights:
            try:
                price_elements = soup.select('.deal-price, .price, [data-test="price"]')
                
                if price_elements:
                    log_event('Found {} price elements'.format(len(price_elements)))
                    price = price_elements[0].text.strip()
                    
                    flights.append({
                        'price': price,
                        'airline': "Various Airlines",
                        'departure': "Check website for details",
                        'arrival': "Check website for details",
                        'duration': "See website for schedule"
                    })
            except Exception as e:
                log_event('Error extracting price elements: {}'.format(e))
        
        # If still no flights found, provide a default response
        if not flights:
            log_event('No flight data found, returning instructions')
            flights = [{
                'price': 'Check website',
                'airline': 'Various Airlines',
                'departure': 'See CheapFlights website',
                'arrival': 'for complete details',
                'duration': 'N/A'
            }]
            
        # Add a reference to the original site
        flights.append({
            'price': 'View more',
            'airline': 'All airlines',
            'departure': 'Visit CheapFlights',
            'arrival': flight_url,
            'duration': 'for more options'
        })
            
        return flights

    def parse_flight_query(self, query):
        """Parse flight-related information from the user query"""
        log_event('Parsing flight query: {}'.format(query))
        
        # Initialize with default values
        origin = None
        destination = None
        departure_date = None
        return_date = None
        
        # Look for cities/airports
        city_pattern = r"from\s+([A-Za-z\s]+?)(?:\s+to|\s+on|\s+for|\s+near|\s+after|\s+before|$)"
        destination_pattern = r"to\s+([A-Za-z\s]+?)(?:\s+from|\s+on|\s+for|\s+near|\s+after|\s+before|$)"
        
        origin_match = re.search(city_pattern, query, re.IGNORECASE)
        if origin_match:
            origin = origin_match.group(1).strip()
            
        dest_match = re.search(destination_pattern, query, re.IGNORECASE)
        if dest_match:
            destination = dest_match.group(1).strip()
            
        # Look for dates
        date_pattern = r"(?:on|for|near|after|before)\s+([A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?)"
        date_matches = re.findall(date_pattern, query, re.IGNORECASE)
        
        if len(date_matches) >= 1:
            departure_date = date_matches[0]
            
        if len(date_matches) >= 2:
            return_date = date_matches[1]
            
        log_event('Parsed flight details: Origin={}, Destination={}, Dates: {} to {}'.format(origin, destination, departure_date, return_date))
        
        # If no origin/destination found, try to extract from general text
        if not origin and not destination:
            words = query.split()
            city_names = []
            
            # Look for potential city names (capitalized words not at the beginning of a sentence)
            for i, word in enumerate(words):
                if word and len(word) > 0 and word[0].isupper() and len(word) > 2 and i > 0 and words[i-1][-1] != '.':
                    city_names.append(word)
            
            # If exactly two city names found, assume they're origin and destination
            if len(city_names) == 2:
                origin = city_names[0]
                destination = city_names[1]
                log_event('Extracted potential cities from text: {} and {}'.format(origin, destination))
        
        return {
            'origin': origin,
            'destination': destination,
            'departure_date': departure_date,
            'return_date': return_date
        }

    def build_cheapflights_url(self, flight_details):
        """Build a CheapFlights URL based on the parsed query"""
        base_url = 'https://www.cheapflights.com/flights-to-'
        
        # If we don't have destination, use a generic URL
        if not flight_details['destination']:
            return 'https://www.cheapflights.com/'
            
        # Format the destination for URL
        destination = flight_details['destination'].lower().replace(' ', '-')
        
        # If we have an origin, include it in the URL
        if flight_details['origin']:
            origin = flight_details['origin'].lower().replace(' ', '-')
            url = "{}{}/{}/".format(base_url, destination, origin)
        else:
            url = "{}{}/".format(base_url, destination)
        
        # Note: CheapFlights typically handles dates through their search interface
        # rather than in the URL, so we're not adding date parameters here
        
        log_event('Built CheapFlights URL: {}'.format(url))
        return url

    def process_query(self, query):
        log_event("Processing flight query: {}".format(query))
        
        try:
            # Parse flight details from query
            flight_details = self.parse_flight_query(query)
            
            # Build CheapFlights URL
            flights_url = self.build_cheapflights_url(flight_details)
            
            # Fetch CheapFlights page
            page_content = self.get_webpage_content(flights_url)
            
            # Extract flight information
            flights = self.extract_flight_details(page_content, flights_url)
            
            return {
                'success': True,
                'data': {
                    'query': query,
                    'search_details': flight_details,
                    'flights_url': flights_url,
                    'flights': flights
                }
            }
        except Exception as e:
            log_event("Error in process_query: {}".format(e))
            return {
                'success': False,
                'error': str(e)
            }

if __name__ == "__main__":
    # Test the agent
    import sys
    query = sys.argv[1] if len(sys.argv) > 1 else "Find cheap flights from Rochester to Nashville"
    agent = FlightAgent()
    result = agent.process_query(query)
    print(json.dumps(result, indent=2))
    log_event("Final result: {}".format(str(result))) 