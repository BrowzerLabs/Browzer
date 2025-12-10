export enum NavigationErrorCategory {
  NETWORK = 'network',
  DNS = 'dns',
  SSL = 'ssl',
  HTTP = 'http',
  TIMEOUT = 'timeout',
  BLOCKED = 'blocked',
  CANCELLED = 'cancelled',
  UNKNOWN = 'unknown',
}

// Only include error codes that are actually used/handled
export enum NavigationErrorCode {
  ERR_FAILED = -2,
  ERR_ABORTED = -3,
  ERR_FILE_NOT_FOUND = -6,
  ERR_TIMED_OUT = -7,
  ERR_ACCESS_DENIED = -10,
  ERR_BLOCKED_BY_CLIENT = -20,
  ERR_NETWORK_CHANGED = -21,
  ERR_BLOCKED_BY_ADMINISTRATOR = -22,
  ERR_CONNECTION_CLOSED = -100,
  ERR_CONNECTION_RESET = -101,
  ERR_CONNECTION_REFUSED = -102,
  ERR_CONNECTION_FAILED = -104,
  ERR_NAME_NOT_RESOLVED = -105,
  ERR_INTERNET_DISCONNECTED = -106,
  ERR_SSL_PROTOCOL_ERROR = -107,
  ERR_ADDRESS_UNREACHABLE = -109,
  ERR_CONNECTION_TIMED_OUT = -118,
  ERR_CERT_COMMON_NAME_INVALID = -200,
  ERR_CERT_DATE_INVALID = -201,
  ERR_CERT_AUTHORITY_INVALID = -202,
  ERR_CERT_REVOKED = -206,
  ERR_CERT_INVALID = -207,
  ERR_SSL_VERSION_OR_CIPHER_MISMATCH = -113,
  ERR_INVALID_URL = -300,
  ERR_DISALLOWED_URL_SCHEME = -301,
  ERR_UNKNOWN_URL_SCHEME = -302,
  ERR_TOO_MANY_REDIRECTS = -310,
  ERR_UNSAFE_PORT = -312,
  ERR_EMPTY_RESPONSE = -324,
  ERR_INVALID_RESPONSE = -320,
}

export interface NavigationError {
  code: NavigationErrorCode;
  category: NavigationErrorCategory;
  title: string;
  description: string;
  url: string;
  timestamp: number;
  isRecoverable: boolean;
  suggestions: string[];
  technicalDetails?: string;
}

type ErrorInfo = Omit<NavigationError, 'code' | 'url' | 'timestamp' | 'technicalDetails'>;

const ERROR_INFO: Record<number, ErrorInfo> = {
  [-3]: { category: NavigationErrorCategory.CANCELLED, title: 'Navigation cancelled', description: 'The page load was cancelled.', isRecoverable: true, suggestions: ['Try loading the page again'] },
  [-106]: { category: NavigationErrorCategory.NETWORK, title: 'No internet connection', description: 'Your device is not connected to the internet.', isRecoverable: true, suggestions: ['Check your Wi-Fi or ethernet connection', 'Check your router or modem', 'Try reconnecting to your network'] },
  [-105]: { category: NavigationErrorCategory.DNS, title: 'Site not found', description: "The server's DNS address could not be found.", isRecoverable: true, suggestions: ['Check if the URL is spelled correctly', 'Check your internet connection', 'The website might be temporarily unavailable'] },
  [-102]: { category: NavigationErrorCategory.NETWORK, title: 'Connection refused', description: 'The server refused the connection.', isRecoverable: true, suggestions: ['The website might be down or under maintenance', 'Check if the URL and port are correct', 'Try again later'] },
  [-118]: { category: NavigationErrorCategory.TIMEOUT, title: 'Connection timed out', description: 'The connection to the server took too long.', isRecoverable: true, suggestions: ['Check your internet connection', 'The website might be experiencing high traffic', 'Try again later'] },
  [-7]: { category: NavigationErrorCategory.TIMEOUT, title: 'Request timed out', description: 'The request took too long to complete.', isRecoverable: true, suggestions: ['Check your internet connection', 'Try again later'] },
  [-101]: { category: NavigationErrorCategory.NETWORK, title: 'Connection reset', description: 'The connection was unexpectedly closed.', isRecoverable: true, suggestions: ['Try reloading the page', 'Check your internet connection'] },
  [-104]: { category: NavigationErrorCategory.NETWORK, title: 'Connection failed', description: 'Failed to establish a connection to the server.', isRecoverable: true, suggestions: ['Check your internet connection', 'The website might be temporarily unavailable'] },
  [-21]: { category: NavigationErrorCategory.NETWORK, title: 'Network changed', description: 'Your network connection changed during the request.', isRecoverable: true, suggestions: ['Try reloading the page', 'Wait for your network connection to stabilize'] },
  [-109]: { category: NavigationErrorCategory.NETWORK, title: 'Address unreachable', description: 'The server address is unreachable.', isRecoverable: true, suggestions: ['Check if the URL is correct', 'The server might be on a private network'] },
  [-107]: { category: NavigationErrorCategory.SSL, title: 'SSL protocol error', description: 'An SSL protocol error occurred.', isRecoverable: false, suggestions: ['The website might have an SSL configuration issue', 'Contact the website administrator'] },
  [-200]: { category: NavigationErrorCategory.SSL, title: 'Certificate name mismatch', description: "The server's certificate does not match the website address.", isRecoverable: false, suggestions: ["Make sure you're visiting the correct website", 'The website might have a misconfigured certificate'] },
  [-201]: { category: NavigationErrorCategory.SSL, title: 'Certificate expired', description: "The server's security certificate has expired or is not yet valid.", isRecoverable: false, suggestions: ["Check if your device's date and time are correct", "The website's certificate might need renewal"] },
  [-202]: { category: NavigationErrorCategory.SSL, title: 'Certificate authority invalid', description: "The server's certificate is not trusted.", isRecoverable: false, suggestions: ['The certificate might be self-signed', 'Your device might be missing root certificates'] },
  [-206]: { category: NavigationErrorCategory.SSL, title: 'Certificate revoked', description: "The server's certificate has been revoked.", isRecoverable: false, suggestions: ['Do not proceed - this could indicate a security issue', 'Contact the website administrator'] },
  [-207]: { category: NavigationErrorCategory.SSL, title: 'Invalid certificate', description: "The server's security certificate is invalid.", isRecoverable: false, suggestions: ['The website might have a security issue', 'Do not enter sensitive information'] },
  [-113]: { category: NavigationErrorCategory.SSL, title: 'SSL version mismatch', description: 'The server uses an unsupported SSL/TLS version or cipher.', isRecoverable: false, suggestions: ['The website might be using outdated security protocols'] },
  [-300]: { category: NavigationErrorCategory.HTTP, title: 'Invalid URL', description: 'The URL you entered is not valid.', isRecoverable: false, suggestions: ['Check if the URL is spelled correctly', 'Make sure the URL format is correct'] },
  [-301]: { category: NavigationErrorCategory.HTTP, title: 'URL scheme not allowed', description: 'This type of URL is not supported.', isRecoverable: false, suggestions: ['Try using http:// or https://'] },
  [-302]: { category: NavigationErrorCategory.HTTP, title: 'Unknown URL scheme', description: 'The URL scheme is not recognized.', isRecoverable: false, suggestions: ['Check if the URL is correct', 'Try using http:// or https://'] },
  [-310]: { category: NavigationErrorCategory.HTTP, title: 'Too many redirects', description: 'The page redirected too many times.', isRecoverable: true, suggestions: ['Clear your cookies for this site', 'The website might have a configuration issue'] },
  [-324]: { category: NavigationErrorCategory.HTTP, title: 'Empty response', description: 'The server sent an empty response.', isRecoverable: true, suggestions: ['Try reloading the page', 'The server might be experiencing issues'] },
  [-320]: { category: NavigationErrorCategory.HTTP, title: 'Invalid response', description: 'The server sent an invalid response.', isRecoverable: true, suggestions: ['Try reloading the page'] },
  [-312]: { category: NavigationErrorCategory.BLOCKED, title: 'Unsafe port blocked', description: 'Access to this port is blocked for security reasons.', isRecoverable: false, suggestions: ['Try using a standard port (80 for HTTP, 443 for HTTPS)'] },
  [-20]: { category: NavigationErrorCategory.BLOCKED, title: 'Blocked by browser', description: 'The request was blocked by the browser.', isRecoverable: false, suggestions: ['Check if an extension is blocking this request'] },
  [-22]: { category: NavigationErrorCategory.BLOCKED, title: 'Blocked by administrator', description: 'Access to this site has been blocked by an administrator.', isRecoverable: false, suggestions: ['Contact your network administrator'] },
  [-6]: { category: NavigationErrorCategory.HTTP, title: 'File not found', description: 'The requested file could not be found.', isRecoverable: false, suggestions: ['Check if the file path is correct'] },
  [-10]: { category: NavigationErrorCategory.BLOCKED, title: 'Access denied', description: "You don't have permission to access this resource.", isRecoverable: false, suggestions: ['You might need to log in'] },
  [-2]: { category: NavigationErrorCategory.UNKNOWN, title: 'Page failed to load', description: 'An error occurred while loading the page.', isRecoverable: true, suggestions: ['Try reloading the page', 'Check your internet connection'] },
};

const DEFAULT_ERROR: ErrorInfo = {
  category: NavigationErrorCategory.UNKNOWN,
  title: 'Page failed to load',
  description: 'An unknown error occurred while loading the page.',
  isRecoverable: true,
  suggestions: ['Try reloading the page', 'Check your internet connection'],
};

const SSL_ERROR_CODES = new Set([-107, -200, -201, -202, -206, -207, -113]);
const NETWORK_ERROR_CODES = new Set([-106, -105, -102, -118, -101, -104, -100, -21, -109, -7]);

export function getNavigationErrorInfo(errorCode: number, errorDescription: string, url: string): NavigationError {
  const info = ERROR_INFO[errorCode] ?? DEFAULT_ERROR;
  return {
    code: errorCode as NavigationErrorCode,
    ...info,
    url,
    timestamp: Date.now(),
    technicalDetails: `Error code: ${errorCode} (${errorDescription})`,
  };
}

export const shouldIgnoreError = (code: number) => code === NavigationErrorCode.ERR_ABORTED;
export const isSSLError = (code: number) => SSL_ERROR_CODES.has(code);
export const isNetworkError = (code: number) => NETWORK_ERROR_CODES.has(code);
