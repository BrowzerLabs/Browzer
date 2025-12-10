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

export enum NavigationErrorCode {
  ERR_FAILED = -2,
  ERR_ABORTED = -3,
  ERR_INVALID_ARGUMENT = -4,
  ERR_INVALID_HANDLE = -5,
  ERR_FILE_NOT_FOUND = -6,
  ERR_TIMED_OUT = -7,
  ERR_FILE_TOO_BIG = -8,
  ERR_UNEXPECTED = -9,
  ERR_ACCESS_DENIED = -10,
  ERR_NOT_IMPLEMENTED = -11,
  ERR_INSUFFICIENT_RESOURCES = -12,
  ERR_OUT_OF_MEMORY = -13,
  ERR_UPLOAD_FILE_CHANGED = -14,
  ERR_SOCKET_NOT_CONNECTED = -15,
  ERR_FILE_EXISTS = -16,
  ERR_FILE_PATH_TOO_LONG = -17,
  ERR_FILE_NO_SPACE = -18,
  ERR_FILE_VIRUS_INFECTED = -19,
  ERR_BLOCKED_BY_CLIENT = -20,
  ERR_NETWORK_CHANGED = -21,
  ERR_BLOCKED_BY_ADMINISTRATOR = -22,

  // Connection errors
  ERR_CONNECTION_CLOSED = -100,
  ERR_CONNECTION_RESET = -101,
  ERR_CONNECTION_REFUSED = -102,
  ERR_CONNECTION_ABORTED = -103,
  ERR_CONNECTION_FAILED = -104,
  ERR_NAME_NOT_RESOLVED = -105,
  ERR_INTERNET_DISCONNECTED = -106,
  ERR_SSL_PROTOCOL_ERROR = -107,
  ERR_ADDRESS_INVALID = -108,
  ERR_ADDRESS_UNREACHABLE = -109,
  ERR_SSL_CLIENT_AUTH_CERT_NEEDED = -110,
  ERR_TUNNEL_CONNECTION_FAILED = -111,
  ERR_NO_SSL_VERSIONS_ENABLED = -112,
  ERR_SSL_VERSION_OR_CIPHER_MISMATCH = -113,
  ERR_SSL_RENEGOTIATION_REQUESTED = -114,
  ERR_PROXY_AUTH_UNSUPPORTED = -115,
  ERR_CERT_ERROR_IN_SSL_RENEGOTIATION = -116,
  ERR_BAD_SSL_CLIENT_AUTH_CERT = -117,
  ERR_CONNECTION_TIMED_OUT = -118,
  ERR_HOST_RESOLVER_QUEUE_TOO_LARGE = -119,
  ERR_SOCKS_CONNECTION_FAILED = -120,
  ERR_SOCKS_CONNECTION_HOST_UNREACHABLE = -121,
  ERR_ALPN_NEGOTIATION_FAILED = -122,
  ERR_SSL_NO_RENEGOTIATION = -123,
  ERR_WINSOCK_UNEXPECTED_WRITTEN_BYTES = -124,
  ERR_SSL_DECOMPRESSION_FAILURE_ALERT = -125,
  ERR_SSL_BAD_RECORD_MAC_ALERT = -126,
  ERR_PROXY_AUTH_REQUESTED = -127,

  // Certificate errors
  ERR_CERT_COMMON_NAME_INVALID = -200,
  ERR_CERT_DATE_INVALID = -201,
  ERR_CERT_AUTHORITY_INVALID = -202,
  ERR_CERT_CONTAINS_ERRORS = -203,
  ERR_CERT_NO_REVOCATION_MECHANISM = -204,
  ERR_CERT_UNABLE_TO_CHECK_REVOCATION = -205,
  ERR_CERT_REVOKED = -206,
  ERR_CERT_INVALID = -207,
  ERR_CERT_WEAK_SIGNATURE_ALGORITHM = -208,
  ERR_CERT_NON_UNIQUE_NAME = -210,
  ERR_CERT_WEAK_KEY = -211,
  ERR_CERT_NAME_CONSTRAINT_VIOLATION = -212,
  ERR_CERT_VALIDITY_TOO_LONG = -213,
  ERR_CERTIFICATE_TRANSPARENCY_REQUIRED = -214,
  ERR_CERT_SYMANTEC_LEGACY = -215,
  ERR_CERT_KNOWN_INTERCEPTION_BLOCKED = -217,

  // HTTP errors
  ERR_INVALID_URL = -300,
  ERR_DISALLOWED_URL_SCHEME = -301,
  ERR_UNKNOWN_URL_SCHEME = -302,
  ERR_INVALID_REDIRECT = -303,
  ERR_TOO_MANY_REDIRECTS = -310,
  ERR_UNSAFE_REDIRECT = -311,
  ERR_UNSAFE_PORT = -312,
  ERR_INVALID_RESPONSE = -320,
  ERR_INVALID_CHUNKED_ENCODING = -321,
  ERR_METHOD_NOT_SUPPORTED = -322,
  ERR_UNEXPECTED_PROXY_AUTH = -323,
  ERR_EMPTY_RESPONSE = -324,
  ERR_RESPONSE_HEADERS_TOO_BIG = -325,
  ERR_PAC_SCRIPT_FAILED = -327,
  ERR_REQUEST_RANGE_NOT_SATISFIABLE = -328,
  ERR_MALFORMED_IDENTITY = -329,
  ERR_CONTENT_DECODING_FAILED = -330,
  ERR_NETWORK_IO_SUSPENDED = -331,
  ERR_SYN_REPLY_NOT_RECEIVED = -332,
  ERR_ENCODING_CONVERSION_FAILED = -333,
  ERR_UNRECOGNIZED_FTP_DIRECTORY_LISTING_FORMAT = -334,
  ERR_NO_SUPPORTED_PROXIES = -336,
  ERR_HTTP2_PROTOCOL_ERROR = -337,
  ERR_INVALID_AUTH_CREDENTIALS = -338,
  ERR_UNSUPPORTED_AUTH_SCHEME = -339,
  ERR_ENCODING_DETECTION_FAILED = -340,
  ERR_MISSING_AUTH_CREDENTIALS = -341,
  ERR_UNEXPECTED_SECURITY_LIBRARY_STATUS = -342,
  ERR_MISCONFIGURED_AUTH_ENVIRONMENT = -343,
  ERR_UNDOCUMENTED_SECURITY_LIBRARY_STATUS = -344,
  ERR_RESPONSE_BODY_TOO_BIG_TO_DRAIN = -345,
  ERR_RESPONSE_HEADERS_MULTIPLE_CONTENT_LENGTH = -346,
  ERR_INCOMPLETE_HTTP2_HEADERS = -347,
  ERR_PAC_NOT_IN_DHCP = -348,
  ERR_RESPONSE_HEADERS_MULTIPLE_CONTENT_DISPOSITION = -349,
  ERR_RESPONSE_HEADERS_MULTIPLE_LOCATION = -350,
  ERR_HTTP2_SERVER_REFUSED_STREAM = -351,
  ERR_HTTP2_PING_FAILED = -352,
  ERR_CONTENT_LENGTH_MISMATCH = -354,
  ERR_INCOMPLETE_CHUNKED_ENCODING = -355,
  ERR_QUIC_PROTOCOL_ERROR = -356,
  ERR_RESPONSE_HEADERS_TRUNCATED = -357,
  ERR_QUIC_HANDSHAKE_FAILED = -358,
  ERR_HTTP2_INADEQUATE_TRANSPORT_SECURITY = -360,
  ERR_HTTP2_FLOW_CONTROL_ERROR = -361,
  ERR_HTTP2_FRAME_SIZE_ERROR = -362,
  ERR_HTTP2_COMPRESSION_ERROR = -363,
  ERR_PROXY_AUTH_REQUESTED_WITH_NO_CONNECTION = -364,
  ERR_HTTP_1_1_REQUIRED = -365,
  ERR_PROXY_HTTP_1_1_REQUIRED = -366,
  ERR_PAC_SCRIPT_TERMINATED = -367,
  ERR_INVALID_HTTP_RESPONSE = -370,
  ERR_CONTENT_DECODING_INIT_FAILED = -371,
  ERR_HTTP2_RST_STREAM_NO_ERROR_RECEIVED = -372,
  ERR_HTTP2_PUSHED_STREAM_NOT_AVAILABLE = -373,
  ERR_HTTP2_CLAIMED_PUSHED_STREAM_RESET_BY_SERVER = -374,
  ERR_TOO_MANY_RETRIES = -375,
  ERR_HTTP2_STREAM_CLOSED = -376,
  ERR_HTTP2_CLIENT_REFUSED_STREAM = -377,
  ERR_HTTP2_PUSHED_RESPONSE_DOES_NOT_MATCH = -378,
  ERR_HTTP_RESPONSE_CODE_FAILURE = -379,
  ERR_QUIC_CERT_ROOT_NOT_KNOWN = -380,
  ERR_QUIC_GOAWAY_REQUEST_CAN_BE_RETRIED = -381,

  // Cache errors
  ERR_CACHE_MISS = -400,
  ERR_CACHE_READ_FAILURE = -401,
  ERR_CACHE_WRITE_FAILURE = -402,
  ERR_CACHE_OPERATION_NOT_SUPPORTED = -403,
  ERR_CACHE_OPEN_FAILURE = -404,
  ERR_CACHE_CREATE_FAILURE = -405,
  ERR_CACHE_RACE = -406,
  ERR_CACHE_CHECKSUM_READ_FAILURE = -407,
  ERR_CACHE_CHECKSUM_MISMATCH = -408,
  ERR_CACHE_LOCK_TIMEOUT = -409,
  ERR_CACHE_AUTH_FAILURE_AFTER_READ = -410,
  ERR_CACHE_ENTRY_NOT_SUITABLE = -411,
  ERR_CACHE_DOOM_FAILURE = -412,
  ERR_CACHE_OPEN_OR_CREATE_FAILURE = -413,

  // DNS errors
  ERR_DNS_MALFORMED_RESPONSE = -800,
  ERR_DNS_SERVER_REQUIRES_TCP = -801,
  ERR_DNS_SERVER_FAILED = -802,
  ERR_DNS_TIMED_OUT = -803,
  ERR_DNS_CACHE_MISS = -804,
  ERR_DNS_SEARCH_EMPTY = -805,
  ERR_DNS_SORT_ERROR = -806,
  ERR_DNS_SECURE_RESOLVER_HOSTNAME_RESOLUTION_FAILED = -808,
  ERR_DNS_NAME_HTTPS_ONLY = -809,
  ERR_DNS_REQUEST_CANCELLED = -810,
  ERR_DNS_NO_MATCHING_SUPPORTED_ALPN = -811,
}

/**
 * Detailed navigation error information
 */
export interface NavigationError {
  code: NavigationErrorCode;
  category: NavigationErrorCategory;
  title: string;
  description: string;
  originalDescription?: string;
  url: string;
  timestamp: number;
  isRecoverable: boolean;
  suggestions: string[];
  technicalDetails?: string;
}

export interface TabErrorState {
  hasError: boolean;
  error: NavigationError | null;
}

export interface ErrorPageData {
  error: NavigationError;
  canGoBack: boolean;
  canRetry: boolean;
}

export const ERROR_INFO_MAP: Record<number, Omit<NavigationError, 'code' | 'url' | 'timestamp' | 'originalDescription'>> = {
  [NavigationErrorCode.ERR_ABORTED]: {
    category: NavigationErrorCategory.CANCELLED,
    title: 'Navigation cancelled',
    description: 'The page load was cancelled.',
    isRecoverable: true,
    suggestions: ['Try loading the page again'],
  },

  [NavigationErrorCode.ERR_INTERNET_DISCONNECTED]: {
    category: NavigationErrorCategory.NETWORK,
    title: 'No internet connection',
    description: 'Your device is not connected to the internet.',
    isRecoverable: true,
    suggestions: [
      'Check your Wi-Fi or ethernet connection',
      'Check your router or modem',
      'Try reconnecting to your network',
      'Contact your internet service provider if the problem persists',
    ],
  },

  [NavigationErrorCode.ERR_NAME_NOT_RESOLVED]: {
    category: NavigationErrorCategory.DNS,
    title: 'Site not found',
    description: 'The server\'s DNS address could not be found.',
    isRecoverable: true,
    suggestions: [
      'Check if the URL is spelled correctly',
      'Check your internet connection',
      'Try clearing your DNS cache',
      'The website might be temporarily unavailable',
    ],
  },

  [NavigationErrorCode.ERR_CONNECTION_REFUSED]: {
    category: NavigationErrorCategory.NETWORK,
    title: 'Connection refused',
    description: 'The server refused the connection.',
    isRecoverable: true,
    suggestions: [
      'The website might be down or under maintenance',
      'Check if the URL and port are correct',
      'Try again later',
      'Check if a firewall is blocking the connection',
    ],
  },

  // Connection timed out
  [NavigationErrorCode.ERR_CONNECTION_TIMED_OUT]: {
    category: NavigationErrorCategory.TIMEOUT,
    title: 'Connection timed out',
    description: 'The connection to the server took too long.',
    isRecoverable: true,
    suggestions: [
      'Check your internet connection',
      'The website might be experiencing high traffic',
      'Try again later',
      'Check if a firewall or proxy is causing delays',
    ],
  },

  // General timeout
  [NavigationErrorCode.ERR_TIMED_OUT]: {
    category: NavigationErrorCategory.TIMEOUT,
    title: 'Request timed out',
    description: 'The request took too long to complete.',
    isRecoverable: true,
    suggestions: [
      'Check your internet connection',
      'Try again later',
      'The server might be overloaded',
    ],
  },

  // Connection reset
  [NavigationErrorCode.ERR_CONNECTION_RESET]: {
    category: NavigationErrorCategory.NETWORK,
    title: 'Connection reset',
    description: 'The connection was unexpectedly closed.',
    isRecoverable: true,
    suggestions: [
      'Try reloading the page',
      'Check your internet connection',
      'The server might have restarted',
    ],
  },

  // Connection failed
  [NavigationErrorCode.ERR_CONNECTION_FAILED]: {
    category: NavigationErrorCategory.NETWORK,
    title: 'Connection failed',
    description: 'Failed to establish a connection to the server.',
    isRecoverable: true,
    suggestions: [
      'Check your internet connection',
      'The website might be temporarily unavailable',
      'Try again later',
    ],
  },

  // Network changed
  [NavigationErrorCode.ERR_NETWORK_CHANGED]: {
    category: NavigationErrorCategory.NETWORK,
    title: 'Network changed',
    description: 'Your network connection changed during the request.',
    isRecoverable: true,
    suggestions: [
      'Try reloading the page',
      'Wait for your network connection to stabilize',
    ],
  },

  // Address unreachable
  [NavigationErrorCode.ERR_ADDRESS_UNREACHABLE]: {
    category: NavigationErrorCategory.NETWORK,
    title: 'Address unreachable',
    description: 'The server address is unreachable.',
    isRecoverable: true,
    suggestions: [
      'Check if the URL is correct',
      'The server might be on a private network',
      'Check your network configuration',
    ],
  },

  // SSL/TLS errors
  [NavigationErrorCode.ERR_SSL_PROTOCOL_ERROR]: {
    category: NavigationErrorCategory.SSL,
    title: 'SSL protocol error',
    description: 'An SSL protocol error occurred.',
    isRecoverable: false,
    suggestions: [
      'The website might have an SSL configuration issue',
      'Try accessing the site without HTTPS (if safe)',
      'Contact the website administrator',
    ],
  },

  [NavigationErrorCode.ERR_CERT_COMMON_NAME_INVALID]: {
    category: NavigationErrorCategory.SSL,
    title: 'Certificate name mismatch',
    description: 'The server\'s certificate does not match the website address.',
    isRecoverable: false,
    suggestions: [
      'Make sure you\'re visiting the correct website',
      'The website might have a misconfigured certificate',
      'Do not proceed if you\'re entering sensitive information',
    ],
  },

  [NavigationErrorCode.ERR_CERT_DATE_INVALID]: {
    category: NavigationErrorCategory.SSL,
    title: 'Certificate expired',
    description: 'The server\'s security certificate has expired or is not yet valid.',
    isRecoverable: false,
    suggestions: [
      'Check if your device\'s date and time are correct',
      'The website\'s certificate might need renewal',
      'Contact the website administrator',
    ],
  },

  [NavigationErrorCode.ERR_CERT_AUTHORITY_INVALID]: {
    category: NavigationErrorCategory.SSL,
    title: 'Certificate authority invalid',
    description: 'The server\'s certificate is not trusted.',
    isRecoverable: false,
    suggestions: [
      'The certificate might be self-signed',
      'Your device might be missing root certificates',
      'Do not proceed if you\'re entering sensitive information',
    ],
  },

  [NavigationErrorCode.ERR_CERT_REVOKED]: {
    category: NavigationErrorCategory.SSL,
    title: 'Certificate revoked',
    description: 'The server\'s certificate has been revoked.',
    isRecoverable: false,
    suggestions: [
      'Do not proceed - this could indicate a security issue',
      'Contact the website administrator',
    ],
  },

  [NavigationErrorCode.ERR_CERT_INVALID]: {
    category: NavigationErrorCategory.SSL,
    title: 'Invalid certificate',
    description: 'The server\'s security certificate is invalid.',
    isRecoverable: false,
    suggestions: [
      'The website might have a security issue',
      'Do not enter sensitive information',
      'Contact the website administrator',
    ],
  },

  [NavigationErrorCode.ERR_SSL_VERSION_OR_CIPHER_MISMATCH]: {
    category: NavigationErrorCategory.SSL,
    title: 'SSL version mismatch',
    description: 'The server uses an unsupported SSL/TLS version or cipher.',
    isRecoverable: false,
    suggestions: [
      'The website might be using outdated security protocols',
      'Contact the website administrator',
    ],
  },

  // HTTP errors
  [NavigationErrorCode.ERR_INVALID_URL]: {
    category: NavigationErrorCategory.HTTP,
    title: 'Invalid URL',
    description: 'The URL you entered is not valid.',
    isRecoverable: false,
    suggestions: [
      'Check if the URL is spelled correctly',
      'Make sure the URL format is correct',
    ],
  },

  [NavigationErrorCode.ERR_DISALLOWED_URL_SCHEME]: {
    category: NavigationErrorCategory.HTTP,
    title: 'URL scheme not allowed',
    description: 'This type of URL is not supported.',
    isRecoverable: false,
    suggestions: [
      'Try using http:// or https://',
      'This URL scheme might not be supported by the browser',
    ],
  },

  [NavigationErrorCode.ERR_UNKNOWN_URL_SCHEME]: {
    category: NavigationErrorCategory.HTTP,
    title: 'Unknown URL scheme',
    description: 'The URL scheme is not recognized.',
    isRecoverable: false,
    suggestions: [
      'Check if the URL is correct',
      'Try using http:// or https://',
    ],
  },

  [NavigationErrorCode.ERR_TOO_MANY_REDIRECTS]: {
    category: NavigationErrorCategory.HTTP,
    title: 'Too many redirects',
    description: 'The page redirected too many times.',
    isRecoverable: true,
    suggestions: [
      'Clear your cookies for this site',
      'The website might have a configuration issue',
      'Try again later',
    ],
  },

  [NavigationErrorCode.ERR_EMPTY_RESPONSE]: {
    category: NavigationErrorCategory.HTTP,
    title: 'Empty response',
    description: 'The server sent an empty response.',
    isRecoverable: true,
    suggestions: [
      'Try reloading the page',
      'The server might be experiencing issues',
      'Try again later',
    ],
  },

  [NavigationErrorCode.ERR_INVALID_RESPONSE]: {
    category: NavigationErrorCategory.HTTP,
    title: 'Invalid response',
    description: 'The server sent an invalid response.',
    isRecoverable: true,
    suggestions: [
      'Try reloading the page',
      'The server might be experiencing issues',
    ],
  },

  [NavigationErrorCode.ERR_UNSAFE_PORT]: {
    category: NavigationErrorCategory.BLOCKED,
    title: 'Unsafe port blocked',
    description: 'Access to this port is blocked for security reasons.',
    isRecoverable: false,
    suggestions: [
      'The port you\'re trying to access is restricted',
      'Try using a standard port (80 for HTTP, 443 for HTTPS)',
    ],
  },

  // Blocked errors
  [NavigationErrorCode.ERR_BLOCKED_BY_CLIENT]: {
    category: NavigationErrorCategory.BLOCKED,
    title: 'Blocked by browser',
    description: 'The request was blocked by the browser.',
    isRecoverable: false,
    suggestions: [
      'Check if an extension is blocking this request',
      'Check your browser\'s content settings',
    ],
  },

  [NavigationErrorCode.ERR_BLOCKED_BY_ADMINISTRATOR]: {
    category: NavigationErrorCategory.BLOCKED,
    title: 'Blocked by administrator',
    description: 'Access to this site has been blocked by an administrator.',
    isRecoverable: false,
    suggestions: [
      'Contact your network administrator',
      'This site might be on a blocklist',
    ],
  },

  // File errors
  [NavigationErrorCode.ERR_FILE_NOT_FOUND]: {
    category: NavigationErrorCategory.HTTP,
    title: 'File not found',
    description: 'The requested file could not be found.',
    isRecoverable: false,
    suggestions: [
      'Check if the file path is correct',
      'The file might have been moved or deleted',
    ],
  },

  [NavigationErrorCode.ERR_ACCESS_DENIED]: {
    category: NavigationErrorCategory.BLOCKED,
    title: 'Access denied',
    description: 'You don\'t have permission to access this resource.',
    isRecoverable: false,
    suggestions: [
      'You might need to log in',
      'Check if you have the necessary permissions',
    ],
  },

  // General failure
  [NavigationErrorCode.ERR_FAILED]: {
    category: NavigationErrorCategory.UNKNOWN,
    title: 'Page failed to load',
    description: 'An error occurred while loading the page.',
    isRecoverable: true,
    suggestions: [
      'Try reloading the page',
      'Check your internet connection',
      'Try again later',
    ],
  },
};

/**
 * Get error information for a given error code
 */
export function getNavigationErrorInfo(
  errorCode: number,
  errorDescription: string,
  url: string
): NavigationError {
  const errorInfo = ERROR_INFO_MAP[errorCode];
  
  if (errorInfo) {
    return {
      code: errorCode as NavigationErrorCode,
      ...errorInfo,
      url,
      timestamp: Date.now(),
      originalDescription: errorDescription,
      technicalDetails: `Error code: ${errorCode} (${errorDescription})`,
    };
  }

  return {
    code: errorCode as NavigationErrorCode,
    category: NavigationErrorCategory.UNKNOWN,
    title: 'Page failed to load',
    description: errorDescription || 'An unknown error occurred while loading the page.',
    url,
    timestamp: Date.now(),
    originalDescription: errorDescription,
    isRecoverable: true,
    suggestions: [
      'Try reloading the page',
      'Check your internet connection',
      'Try again later',
    ],
    technicalDetails: `Error code: ${errorCode} (${errorDescription})`,
  };
}

export function shouldIgnoreError(errorCode: number): boolean {
  return errorCode === NavigationErrorCode.ERR_ABORTED;
}

export function isSSLError(errorCode: number): boolean {
  const sslErrors = [
    NavigationErrorCode.ERR_SSL_PROTOCOL_ERROR,
    NavigationErrorCode.ERR_CERT_COMMON_NAME_INVALID,
    NavigationErrorCode.ERR_CERT_DATE_INVALID,
    NavigationErrorCode.ERR_CERT_AUTHORITY_INVALID,
    NavigationErrorCode.ERR_CERT_CONTAINS_ERRORS,
    NavigationErrorCode.ERR_CERT_REVOKED,
    NavigationErrorCode.ERR_CERT_INVALID,
    NavigationErrorCode.ERR_CERT_WEAK_SIGNATURE_ALGORITHM,
    NavigationErrorCode.ERR_CERT_WEAK_KEY,
    NavigationErrorCode.ERR_SSL_VERSION_OR_CIPHER_MISMATCH,
    NavigationErrorCode.ERR_BAD_SSL_CLIENT_AUTH_CERT,
    NavigationErrorCode.ERR_SSL_CLIENT_AUTH_CERT_NEEDED,
  ];
  return sslErrors.includes(errorCode);
}

export function isNetworkError(errorCode: number): boolean {
  const networkErrors = [
    NavigationErrorCode.ERR_INTERNET_DISCONNECTED,
    NavigationErrorCode.ERR_NAME_NOT_RESOLVED,
    NavigationErrorCode.ERR_CONNECTION_REFUSED,
    NavigationErrorCode.ERR_CONNECTION_TIMED_OUT,
    NavigationErrorCode.ERR_CONNECTION_RESET,
    NavigationErrorCode.ERR_CONNECTION_FAILED,
    NavigationErrorCode.ERR_CONNECTION_CLOSED,
    NavigationErrorCode.ERR_NETWORK_CHANGED,
    NavigationErrorCode.ERR_ADDRESS_UNREACHABLE,
    NavigationErrorCode.ERR_TIMED_OUT,
  ];
  return networkErrors.includes(errorCode);
}
