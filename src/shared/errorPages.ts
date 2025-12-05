/**
 * Chromium Network Error Codes and Error Page Configuration
 * 
 * This file contains all the error codes that Chromium/Electron can return
 * during navigation, along with user-friendly messages and suggested actions.
 */

export enum ErrorCategory {
  NETWORK = 'network',
  DNS = 'dns',
  CONNECTION = 'connection',
  SSL = 'ssl',
  HTTP = 'http',
  CACHE = 'cache',
  CERTIFICATE = 'certificate',
  PROXY = 'proxy',
  TIMEOUT = 'timeout',
  BLOCKED = 'blocked',
  UNKNOWN = 'unknown',
}

export const ChromiumErrorCodes = {
  IO_PENDING: -1,
  FAILED: -2,
  ABORTED: -3,
  INVALID_ARGUMENT: -4,
  INVALID_HANDLE: -5,
  FILE_NOT_FOUND: -6,
  TIMED_OUT: -7,
  FILE_TOO_BIG: -8,
  UNEXPECTED: -9,
  ACCESS_DENIED: -10,
  NOT_IMPLEMENTED: -11,
  INSUFFICIENT_RESOURCES: -12,
  OUT_OF_MEMORY: -13,
  UPLOAD_FILE_CHANGED: -14,
  SOCKET_NOT_CONNECTED: -15,
  FILE_EXISTS: -16,
  FILE_PATH_TOO_LONG: -17,
  FILE_NO_SPACE: -18,
  FILE_VIRUS_INFECTED: -19,
  BLOCKED_BY_CLIENT: -20,
  NETWORK_CHANGED: -21,
  BLOCKED_BY_ADMINISTRATOR: -22,
  SOCKET_IS_CONNECTED: -23,
  BLOCKED_ENROLLMENT_CHECK_PENDING: -24,
  UPLOAD_STREAM_REWIND_NOT_SUPPORTED: -25,
  CONTEXT_SHUT_DOWN: -26,
  BLOCKED_BY_RESPONSE: -27,
  BLOCKED_BY_XSS_AUDITOR: -28,
  CLEARTEXT_NOT_PERMITTED: -29,
  BLOCKED_BY_CSP: -30,
  H2_OR_QUIC_REQUIRED: -31,
  BLOCKED_BY_ORB: -32,

  // Connection-related errors (-100 to -199)
  CONNECTION_CLOSED: -100,
  CONNECTION_RESET: -101,
  CONNECTION_REFUSED: -102,
  CONNECTION_ABORTED: -103,
  CONNECTION_FAILED: -104,
  NAME_NOT_RESOLVED: -105,
  INTERNET_DISCONNECTED: -106,
  SSL_PROTOCOL_ERROR: -107,
  ADDRESS_INVALID: -108,
  ADDRESS_UNREACHABLE: -109,
  SSL_CLIENT_AUTH_CERT_NEEDED: -110,
  TUNNEL_CONNECTION_FAILED: -111,
  NO_SSL_VERSIONS_ENABLED: -112,
  SSL_VERSION_OR_CIPHER_MISMATCH: -113,
  SSL_RENEGOTIATION_REQUESTED: -114,
  PROXY_AUTH_UNSUPPORTED: -115,
  CERT_ERROR_IN_SSL_RENEGOTIATION: -116,
  BAD_SSL_CLIENT_AUTH_CERT: -117,
  CONNECTION_TIMED_OUT: -118,
  HOST_RESOLVER_QUEUE_TOO_LARGE: -119,
  SOCKS_CONNECTION_FAILED: -120,
  SOCKS_CONNECTION_HOST_UNREACHABLE: -121,
  ALPN_NEGOTIATION_FAILED: -122,
  SSL_NO_RENEGOTIATION: -123,
  WINSOCK_UNEXPECTED_WRITTEN_BYTES: -124,
  SSL_DECOMPRESSION_FAILURE_ALERT: -125,
  SSL_BAD_RECORD_MAC_ALERT: -126,
  PROXY_AUTH_REQUESTED: -127,
  PROXY_CONNECTION_FAILED: -130,
  MANDATORY_PROXY_CONFIGURATION_FAILED: -131,
  PRECONNECT_MAX_SOCKET_LIMIT: -133,
  SSL_CLIENT_AUTH_PRIVATE_KEY_ACCESS_DENIED: -134,
  SSL_CLIENT_AUTH_CERT_NO_PRIVATE_KEY: -135,
  PROXY_CERTIFICATE_INVALID: -136,
  NAME_RESOLUTION_FAILED: -137,
  NETWORK_ACCESS_DENIED: -138,
  TEMPORARILY_THROTTLED: -139,
  HTTPS_PROXY_TUNNEL_RESPONSE_REDIRECT: -140,
  SSL_CLIENT_AUTH_SIGNATURE_FAILED: -141,
  MSG_TOO_BIG: -142,
  WS_PROTOCOL_ERROR: -145,
  ADDRESS_IN_USE: -147,
  SSL_HANDSHAKE_NOT_COMPLETED: -148,
  SSL_BAD_PEER_PUBLIC_KEY: -149,
  SSL_PINNED_KEY_NOT_IN_CERT_CHAIN: -150,
  CLIENT_AUTH_CERT_TYPE_UNSUPPORTED: -151,
  SSL_DECRYPT_ERROR_ALERT: -153,
  WS_THROTTLE_QUEUE_TOO_LARGE: -154,
  SSL_SERVER_CERT_CHANGED: -156,
  SSL_UNRECOGNIZED_NAME_ALERT: -159,
  SOCKET_SET_RECEIVE_BUFFER_SIZE_ERROR: -160,
  SOCKET_SET_SEND_BUFFER_SIZE_ERROR: -161,
  SOCKET_RECEIVE_BUFFER_SIZE_UNCHANGEABLE: -162,
  SOCKET_SEND_BUFFER_SIZE_UNCHANGEABLE: -163,
  SSL_CLIENT_AUTH_CERT_BAD_FORMAT: -164,
  ICANN_NAME_COLLISION: -166,
  SSL_SERVER_CERT_BAD_FORMAT: -167,
  CT_STH_PARSING_FAILED: -168,
  CT_STH_INCOMPLETE: -169,
  UNABLE_TO_REUSE_CONNECTION_FOR_PROXY_AUTH: -170,
  CT_CONSISTENCY_PROOF_PARSING_FAILED: -171,
  SSL_OBSOLETE_CIPHER: -172,
  WS_UPGRADE: -173,
  READ_IF_READY_NOT_IMPLEMENTED: -174,
  NO_BUFFER_SPACE: -176,
  SSL_CLIENT_AUTH_NO_COMMON_ALGORITHMS: -177,
  EARLY_DATA_REJECTED: -178,
  WRONG_VERSION_ON_EARLY_DATA: -179,
  TLS13_DOWNGRADE_DETECTED: -180,
  SSL_KEY_USAGE_INCOMPATIBLE: -181,
  INVALID_ECH_CONFIG_LIST: -182,
  ECH_NOT_NEGOTIATED: -183,
  ECH_FALLBACK_CERTIFICATE_INVALID: -184,

  // Certificate errors (-200 to -299)
  CERT_COMMON_NAME_INVALID: -200,
  CERT_DATE_INVALID: -201,
  CERT_AUTHORITY_INVALID: -202,
  CERT_CONTAINS_ERRORS: -203,
  CERT_NO_REVOCATION_MECHANISM: -204,
  CERT_UNABLE_TO_CHECK_REVOCATION: -205,
  CERT_REVOKED: -206,
  CERT_INVALID: -207,
  CERT_WEAK_SIGNATURE_ALGORITHM: -208,
  CERT_NON_UNIQUE_NAME: -210,
  CERT_WEAK_KEY: -211,
  CERT_NAME_CONSTRAINT_VIOLATION: -212,
  CERT_VALIDITY_TOO_LONG: -213,
  CERTIFICATE_TRANSPARENCY_REQUIRED: -214,
  CERT_SYMANTEC_LEGACY: -215,
  CERT_KNOWN_INTERCEPTION_BLOCKED: -217,
  SSL_OBSOLETE_VERSION: -218,

  // HTTP errors (-300 to -399)
  TOO_MANY_REDIRECTS: -310,
  UNSAFE_REDIRECT: -311,
  UNSAFE_PORT: -312,
  INVALID_RESPONSE: -320,
  INVALID_CHUNKED_ENCODING: -321,
  METHOD_NOT_SUPPORTED: -322,
  UNEXPECTED_PROXY_AUTH: -323,
  EMPTY_RESPONSE: -324,
  RESPONSE_HEADERS_TOO_BIG: -325,
  PAC_SCRIPT_FAILED: -327,
  REQUEST_RANGE_NOT_SATISFIABLE: -328,
  MALFORMED_IDENTITY: -329,
  CONTENT_DECODING_FAILED: -330,
  NETWORK_IO_SUSPENDED: -331,
  SYN_REPLY_NOT_RECEIVED: -332,
  ENCODING_CONVERSION_FAILED: -333,
  UNRECOGNIZED_FTP_DIRECTORY_LISTING_FORMAT: -334,
  NO_SUPPORTED_PROXIES: -336,
  HTTP2_PROTOCOL_ERROR: -337,
  INVALID_AUTH_CREDENTIALS: -338,
  UNSUPPORTED_AUTH_SCHEME: -339,
  ENCODING_DETECTION_FAILED: -340,
  MISSING_AUTH_CREDENTIALS: -341,
  UNEXPECTED_SECURITY_LIBRARY_STATUS: -342,
  MISCONFIGURED_AUTH_ENVIRONMENT: -343,
  UNDOCUMENTED_SECURITY_LIBRARY_STATUS: -344,
  RESPONSE_BODY_TOO_BIG_TO_DRAIN: -345,
  RESPONSE_HEADERS_MULTIPLE_CONTENT_LENGTH: -346,
  INCOMPLETE_HTTP2_HEADERS: -347,
  PAC_NOT_IN_DHCP: -348,
  RESPONSE_HEADERS_MULTIPLE_CONTENT_DISPOSITION: -349,
  RESPONSE_HEADERS_MULTIPLE_LOCATION: -350,
  HTTP2_SERVER_REFUSED_STREAM: -351,
  HTTP2_PING_FAILED: -352,
  CONTENT_LENGTH_MISMATCH: -354,
  INCOMPLETE_CHUNKED_ENCODING: -355,
  QUIC_PROTOCOL_ERROR: -356,
  RESPONSE_HEADERS_TRUNCATED: -357,
  QUIC_HANDSHAKE_FAILED: -358,
  HTTP2_INADEQUATE_TRANSPORT_SECURITY: -360,
  HTTP2_FLOW_CONTROL_ERROR: -361,
  HTTP2_FRAME_SIZE_ERROR: -362,
  HTTP2_COMPRESSION_ERROR: -363,
  PROXY_AUTH_REQUESTED_WITH_NO_CONNECTION: -364,
  HTTP_1_1_REQUIRED: -365,
  PROXY_HTTP_1_1_REQUIRED: -366,
  PAC_SCRIPT_TERMINATED: -367,
  INVALID_HTTP_RESPONSE: -370,
  CONTENT_DECODING_INIT_FAILED: -371,
  HTTP2_RST_STREAM_NO_ERROR_RECEIVED: -372,
  HTTP2_PUSHED_STREAM_NOT_AVAILABLE: -373,
  HTTP2_CLAIMED_PUSHED_STREAM_RESET_BY_SERVER: -374,
  TOO_MANY_RETRIES: -375,
  HTTP2_STREAM_CLOSED: -376,
  HTTP2_CLIENT_REFUSED_STREAM: -377,
  HTTP2_PUSHED_RESPONSE_DOES_NOT_MATCH: -378,
  HTTP_RESPONSE_CODE_FAILURE: -379,
  QUIC_CERT_ROOT_NOT_KNOWN: -380,
  QUIC_GOAWAY_REQUEST_CAN_BE_RETRIED: -381,
  TOO_MANY_ACCEPT_CH_RESTARTS: -382,
  INCONSISTENT_IP_ADDRESS_SPACE: -383,
  CACHED_IP_ADDRESS_SPACE_BLOCKED_BY_LOCAL_NETWORK_ACCESS_POLICY: -384,

  // Cache errors (-400 to -499)
  CACHE_MISS: -400,
  CACHE_READ_FAILURE: -401,
  CACHE_WRITE_FAILURE: -402,
  CACHE_OPERATION_NOT_SUPPORTED: -403,
  CACHE_OPEN_FAILURE: -404,
  CACHE_CREATE_FAILURE: -405,
  CACHE_RACE: -406,
  CACHE_CHECKSUM_READ_FAILURE: -407,
  CACHE_CHECKSUM_MISMATCH: -408,
  CACHE_LOCK_TIMEOUT: -409,
  CACHE_AUTH_FAILURE_AFTER_READ: -410,
  CACHE_ENTRY_NOT_SUITABLE: -411,
  CACHE_DOOM_FAILURE: -412,
  CACHE_OPEN_OR_CREATE_FAILURE: -413,

  // DNS errors (-800 to -899)
  DNS_MALFORMED_RESPONSE: -800,
  DNS_SERVER_REQUIRES_TCP: -801,
  DNS_SERVER_FAILED: -802,
  DNS_TIMED_OUT: -803,
  DNS_CACHE_MISS: -804,
  DNS_SEARCH_EMPTY: -805,
  DNS_SORT_ERROR: -806,
  DNS_SECURE_RESOLVER_HOSTNAME_RESOLUTION_FAILED: -808,
  DNS_NAME_HTTPS_ONLY: -809,
  DNS_REQUEST_CANCELLED: -810,
  DNS_NO_MATCHING_SUPPORTED_ALPN: -811,
} as const;

export type ChromiumErrorCode = typeof ChromiumErrorCodes[keyof typeof ChromiumErrorCodes];

export interface ErrorPageConfig {
  code: number;
  category: ErrorCategory;
  title: string;
  description: string;
  errorName: string;
  suggestions: string[];
  canRetry: boolean;
  showDiagnostics: boolean;
  icon: string;
}

export const ERROR_PAGE_CONFIGS: Record<number, ErrorPageConfig> = {
  [ChromiumErrorCodes.NAME_NOT_RESOLVED]: {
    code: ChromiumErrorCodes.NAME_NOT_RESOLVED,
    category: ErrorCategory.DNS,
    title: "This site can't be reached",
    description: "The server's DNS address could not be found.",
    errorName: 'ERR_NAME_NOT_RESOLVED',
    suggestions: [
      'Check if there is a typo in the URL',
      'Check your internet connection',
      'Check your DNS settings',
      'Try clearing your DNS cache',
    ],
    canRetry: true,
    showDiagnostics: true,
    icon: 'globe-lock',
  },

  [ChromiumErrorCodes.NAME_RESOLUTION_FAILED]: {
    code: ChromiumErrorCodes.NAME_RESOLUTION_FAILED,
    category: ErrorCategory.DNS,
    title: "This site can't be reached",
    description: "The server's DNS address could not be found.",
    errorName: 'ERR_NAME_RESOLUTION_FAILED',
    suggestions: [
      'Check if there is a typo in the URL',
      'Check your internet connection',
      'Try again later',
    ],
    canRetry: true,
    showDiagnostics: true,
    icon: 'globe-lock',
  },

  [ChromiumErrorCodes.DNS_TIMED_OUT]: {
    code: ChromiumErrorCodes.DNS_TIMED_OUT,
    category: ErrorCategory.DNS,
    title: "This site can't be reached",
    description: 'DNS lookup timed out.',
    errorName: 'ERR_DNS_TIMED_OUT',
    suggestions: [
      'Check your internet connection',
      'Try using a different DNS server',
      'Try again later',
    ],
    canRetry: true,
    showDiagnostics: true,
    icon: 'clock',
  },

  [ChromiumErrorCodes.DNS_SERVER_FAILED]: {
    code: ChromiumErrorCodes.DNS_SERVER_FAILED,
    category: ErrorCategory.DNS,
    title: "This site can't be reached",
    description: 'The DNS server is not responding.',
    errorName: 'ERR_DNS_SERVER_FAILED',
    suggestions: [
      'Check your internet connection',
      'Try using a different DNS server (like 8.8.8.8 or 1.1.1.1)',
      'Contact your network administrator',
    ],
    canRetry: true,
    showDiagnostics: true,
    icon: 'server-off',
  },

  // Connection Errors
  [ChromiumErrorCodes.CONNECTION_REFUSED]: {
    code: ChromiumErrorCodes.CONNECTION_REFUSED,
    category: ErrorCategory.CONNECTION,
    title: "This site can't be reached",
    description: 'The connection was refused by the server.',
    errorName: 'ERR_CONNECTION_REFUSED',
    suggestions: [
      'Check if the website is down',
      'Check your firewall settings',
      'Try again later',
    ],
    canRetry: true,
    showDiagnostics: true,
    icon: 'plug-zap-off',
  },

  [ChromiumErrorCodes.CONNECTION_RESET]: {
    code: ChromiumErrorCodes.CONNECTION_RESET,
    category: ErrorCategory.CONNECTION,
    title: "This site can't be reached",
    description: 'The connection was reset.',
    errorName: 'ERR_CONNECTION_RESET',
    suggestions: [
      'Check your internet connection',
      'Check your firewall and antivirus settings',
      'Try again later',
    ],
    canRetry: true,
    showDiagnostics: true,
    icon: 'refresh-cw-off',
  },

  [ChromiumErrorCodes.CONNECTION_CLOSED]: {
    code: ChromiumErrorCodes.CONNECTION_CLOSED,
    category: ErrorCategory.CONNECTION,
    title: "This site can't be reached",
    description: 'The connection was closed unexpectedly.',
    errorName: 'ERR_CONNECTION_CLOSED',
    suggestions: [
      'Check your internet connection',
      'Try reloading the page',
      'Try again later',
    ],
    canRetry: true,
    showDiagnostics: false,
    icon: 'unplug',
  },

  [ChromiumErrorCodes.CONNECTION_FAILED]: {
    code: ChromiumErrorCodes.CONNECTION_FAILED,
    category: ErrorCategory.CONNECTION,
    title: "This site can't be reached",
    description: 'Failed to establish a connection to the server.',
    errorName: 'ERR_CONNECTION_FAILED',
    suggestions: [
      'Check your internet connection',
      'Check if the website is available',
      'Try again later',
    ],
    canRetry: true,
    showDiagnostics: true,
    icon: 'wifi-off',
  },

  [ChromiumErrorCodes.CONNECTION_TIMED_OUT]: {
    code: ChromiumErrorCodes.CONNECTION_TIMED_OUT,
    category: ErrorCategory.TIMEOUT,
    title: "This site can't be reached",
    description: 'The connection timed out.',
    errorName: 'ERR_CONNECTION_TIMED_OUT',
    suggestions: [
      'Check your internet connection',
      'The website might be temporarily unavailable',
      'Try again later',
    ],
    canRetry: true,
    showDiagnostics: true,
    icon: 'timer-off',
  },

  [ChromiumErrorCodes.CONNECTION_ABORTED]: {
    code: ChromiumErrorCodes.CONNECTION_ABORTED,
    category: ErrorCategory.CONNECTION,
    title: "This site can't be reached",
    description: 'The connection was aborted.',
    errorName: 'ERR_CONNECTION_ABORTED',
    suggestions: [
      'Check your internet connection',
      'Try reloading the page',
    ],
    canRetry: true,
    showDiagnostics: false,
    icon: 'x-circle',
  },

  // Internet / Network Errors
  [ChromiumErrorCodes.INTERNET_DISCONNECTED]: {
    code: ChromiumErrorCodes.INTERNET_DISCONNECTED,
    category: ErrorCategory.NETWORK,
    title: 'No internet connection',
    description: 'Your computer is not connected to the internet.',
    errorName: 'ERR_INTERNET_DISCONNECTED',
    suggestions: [
      'Check your network cables, modem, and router',
      'Reconnect to Wi-Fi',
      'Run network diagnostics',
    ],
    canRetry: true,
    showDiagnostics: true,
    icon: 'wifi-off',
  },

  [ChromiumErrorCodes.NETWORK_CHANGED]: {
    code: ChromiumErrorCodes.NETWORK_CHANGED,
    category: ErrorCategory.NETWORK,
    title: 'Network changed',
    description: 'A network change was detected.',
    errorName: 'ERR_NETWORK_CHANGED',
    suggestions: [
      'Try reloading the page',
      'Check your network connection',
    ],
    canRetry: true,
    showDiagnostics: false,
    icon: 'refresh-cw',
  },

  [ChromiumErrorCodes.NETWORK_ACCESS_DENIED]: {
    code: ChromiumErrorCodes.NETWORK_ACCESS_DENIED,
    category: ErrorCategory.NETWORK,
    title: 'Network access denied',
    description: 'Access to the network was denied.',
    errorName: 'ERR_NETWORK_ACCESS_DENIED',
    suggestions: [
      'Check your firewall settings',
      'Contact your network administrator',
    ],
    canRetry: true,
    showDiagnostics: true,
    icon: 'shield-off',
  },

  [ChromiumErrorCodes.NETWORK_IO_SUSPENDED]: {
    code: ChromiumErrorCodes.NETWORK_IO_SUSPENDED,
    category: ErrorCategory.NETWORK,
    title: 'Network suspended',
    description: 'Network operations have been suspended.',
    errorName: 'ERR_NETWORK_IO_SUSPENDED',
    suggestions: [
      'Check your network connection',
      'Try again later',
    ],
    canRetry: true,
    showDiagnostics: false,
    icon: 'pause-circle',
  },

  // Timeout Errors
  [ChromiumErrorCodes.TIMED_OUT]: {
    code: ChromiumErrorCodes.TIMED_OUT,
    category: ErrorCategory.TIMEOUT,
    title: "This site can't be reached",
    description: 'The request timed out.',
    errorName: 'ERR_TIMED_OUT',
    suggestions: [
      'Check your internet connection',
      'The website might be temporarily unavailable',
      'Try again later',
    ],
    canRetry: true,
    showDiagnostics: true,
    icon: 'timer-off',
  },

  // SSL/TLS Errors
  [ChromiumErrorCodes.SSL_PROTOCOL_ERROR]: {
    code: ChromiumErrorCodes.SSL_PROTOCOL_ERROR,
    category: ErrorCategory.SSL,
    title: "This site can't provide a secure connection",
    description: 'An SSL protocol error occurred.',
    errorName: 'ERR_SSL_PROTOCOL_ERROR',
    suggestions: [
      'The website might be temporarily unavailable',
      'Try again later',
      'Contact the website administrator',
    ],
    canRetry: true,
    showDiagnostics: false,
    icon: 'shield-alert',
  },

  [ChromiumErrorCodes.SSL_VERSION_OR_CIPHER_MISMATCH]: {
    code: ChromiumErrorCodes.SSL_VERSION_OR_CIPHER_MISMATCH,
    category: ErrorCategory.SSL,
    title: "This site can't provide a secure connection",
    description: 'The client and server don\'t support a common SSL protocol version or cipher suite.',
    errorName: 'ERR_SSL_VERSION_OR_CIPHER_MISMATCH',
    suggestions: [
      'The website might be using outdated security',
      'Contact the website administrator',
    ],
    canRetry: false,
    showDiagnostics: false,
    icon: 'shield-x',
  },

  [ChromiumErrorCodes.SSL_OBSOLETE_VERSION]: {
    code: ChromiumErrorCodes.SSL_OBSOLETE_VERSION,
    category: ErrorCategory.SSL,
    title: "This site can't provide a secure connection",
    description: 'The website uses an outdated security protocol.',
    errorName: 'ERR_SSL_OBSOLETE_VERSION',
    suggestions: [
      'Contact the website administrator',
      'The website needs to update its security settings',
    ],
    canRetry: false,
    showDiagnostics: false,
    icon: 'shield-x',
  },

  // Certificate Errors
  [ChromiumErrorCodes.CERT_COMMON_NAME_INVALID]: {
    code: ChromiumErrorCodes.CERT_COMMON_NAME_INVALID,
    category: ErrorCategory.CERTIFICATE,
    title: 'Your connection is not private',
    description: 'The certificate is not valid for this website.',
    errorName: 'ERR_CERT_COMMON_NAME_INVALID',
    suggestions: [
      'Check if the URL is correct',
      'This might be a security risk',
      'Proceed with caution if you trust this site',
    ],
    canRetry: false,
    showDiagnostics: false,
    icon: 'shield-alert',
  },

  [ChromiumErrorCodes.CERT_DATE_INVALID]: {
    code: ChromiumErrorCodes.CERT_DATE_INVALID,
    category: ErrorCategory.CERTIFICATE,
    title: 'Your connection is not private',
    description: 'The security certificate has expired or is not yet valid.',
    errorName: 'ERR_CERT_DATE_INVALID',
    suggestions: [
      'Check your computer\'s date and time settings',
      'The website\'s certificate may have expired',
      'Contact the website administrator',
    ],
    canRetry: false,
    showDiagnostics: false,
    icon: 'calendar-x',
  },

  [ChromiumErrorCodes.CERT_AUTHORITY_INVALID]: {
    code: ChromiumErrorCodes.CERT_AUTHORITY_INVALID,
    category: ErrorCategory.CERTIFICATE,
    title: 'Your connection is not private',
    description: 'The security certificate is not trusted.',
    errorName: 'ERR_CERT_AUTHORITY_INVALID',
    suggestions: [
      'This might be a security risk',
      'The certificate was issued by an untrusted authority',
      'Proceed with caution if you trust this site',
    ],
    canRetry: false,
    showDiagnostics: false,
    icon: 'shield-alert',
  },

  [ChromiumErrorCodes.CERT_REVOKED]: {
    code: ChromiumErrorCodes.CERT_REVOKED,
    category: ErrorCategory.CERTIFICATE,
    title: 'Your connection is not private',
    description: 'The security certificate has been revoked.',
    errorName: 'ERR_CERT_REVOKED',
    suggestions: [
      'This is a security risk',
      'Do not proceed to this website',
      'Contact the website administrator',
    ],
    canRetry: false,
    showDiagnostics: false,
    icon: 'shield-x',
  },

  [ChromiumErrorCodes.CERT_INVALID]: {
    code: ChromiumErrorCodes.CERT_INVALID,
    category: ErrorCategory.CERTIFICATE,
    title: 'Your connection is not private',
    description: 'The security certificate is invalid.',
    errorName: 'ERR_CERT_INVALID',
    suggestions: [
      'This might be a security risk',
      'Proceed with caution if you trust this site',
    ],
    canRetry: false,
    showDiagnostics: false,
    icon: 'shield-alert',
  },

  [ChromiumErrorCodes.CERT_WEAK_SIGNATURE_ALGORITHM]: {
    code: ChromiumErrorCodes.CERT_WEAK_SIGNATURE_ALGORITHM,
    category: ErrorCategory.CERTIFICATE,
    title: 'Your connection is not private',
    description: 'The security certificate uses a weak signature algorithm.',
    errorName: 'ERR_CERT_WEAK_SIGNATURE_ALGORITHM',
    suggestions: [
      'The website needs to update its security certificate',
      'Contact the website administrator',
    ],
    canRetry: false,
    showDiagnostics: false,
    icon: 'shield-alert',
  },

  // Proxy Errors
  [ChromiumErrorCodes.PROXY_CONNECTION_FAILED]: {
    code: ChromiumErrorCodes.PROXY_CONNECTION_FAILED,
    category: ErrorCategory.PROXY,
    title: "This site can't be reached",
    description: 'Failed to connect to the proxy server.',
    errorName: 'ERR_PROXY_CONNECTION_FAILED',
    suggestions: [
      'Check your proxy settings',
      'Contact your network administrator',
      'Try disabling your proxy',
    ],
    canRetry: true,
    showDiagnostics: true,
    icon: 'server-off',
  },

  [ChromiumErrorCodes.TUNNEL_CONNECTION_FAILED]: {
    code: ChromiumErrorCodes.TUNNEL_CONNECTION_FAILED,
    category: ErrorCategory.PROXY,
    title: "This site can't be reached",
    description: 'Failed to establish a tunnel through the proxy.',
    errorName: 'ERR_TUNNEL_CONNECTION_FAILED',
    suggestions: [
      'Check your proxy settings',
      'The proxy server might be blocking this connection',
    ],
    canRetry: true,
    showDiagnostics: true,
    icon: 'server-off',
  },

  // HTTP Errors
  [ChromiumErrorCodes.TOO_MANY_REDIRECTS]: {
    code: ChromiumErrorCodes.TOO_MANY_REDIRECTS,
    category: ErrorCategory.HTTP,
    title: 'This page isn\'t working',
    description: 'The page redirected too many times.',
    errorName: 'ERR_TOO_MANY_REDIRECTS',
    suggestions: [
      'Try clearing your cookies',
      'The website might be misconfigured',
    ],
    canRetry: true,
    showDiagnostics: false,
    icon: 'repeat',
  },

  [ChromiumErrorCodes.EMPTY_RESPONSE]: {
    code: ChromiumErrorCodes.EMPTY_RESPONSE,
    category: ErrorCategory.HTTP,
    title: 'This page isn\'t working',
    description: 'The server sent no data.',
    errorName: 'ERR_EMPTY_RESPONSE',
    suggestions: [
      'Try reloading the page',
      'The website might be temporarily unavailable',
    ],
    canRetry: true,
    showDiagnostics: false,
    icon: 'file-x',
  },

  [ChromiumErrorCodes.INVALID_RESPONSE]: {
    code: ChromiumErrorCodes.INVALID_RESPONSE,
    category: ErrorCategory.HTTP,
    title: 'This page isn\'t working',
    description: 'The server sent an invalid response.',
    errorName: 'ERR_INVALID_RESPONSE',
    suggestions: [
      'Try reloading the page',
      'The website might be experiencing issues',
    ],
    canRetry: true,
    showDiagnostics: false,
    icon: 'file-warning',
  },

  [ChromiumErrorCodes.INVALID_HTTP_RESPONSE]: {
    code: ChromiumErrorCodes.INVALID_HTTP_RESPONSE,
    category: ErrorCategory.HTTP,
    title: 'This page isn\'t working',
    description: 'The server sent an invalid HTTP response.',
    errorName: 'ERR_INVALID_HTTP_RESPONSE',
    suggestions: [
      'Try reloading the page',
      'The website might be experiencing issues',
    ],
    canRetry: true,
    showDiagnostics: false,
    icon: 'file-warning',
  },

  [ChromiumErrorCodes.CONTENT_DECODING_FAILED]: {
    code: ChromiumErrorCodes.CONTENT_DECODING_FAILED,
    category: ErrorCategory.HTTP,
    title: 'This page isn\'t working',
    description: 'Failed to decode the response.',
    errorName: 'ERR_CONTENT_DECODING_FAILED',
    suggestions: [
      'Try reloading the page',
      'Clear your browser cache',
    ],
    canRetry: true,
    showDiagnostics: false,
    icon: 'file-x',
  },

  // Blocked Errors
  [ChromiumErrorCodes.BLOCKED_BY_CLIENT]: {
    code: ChromiumErrorCodes.BLOCKED_BY_CLIENT,
    category: ErrorCategory.BLOCKED,
    title: 'Blocked',
    description: 'The request was blocked.',
    errorName: 'ERR_BLOCKED_BY_CLIENT',
    suggestions: [
      'Check your ad blocker or content blocker settings',
      'The content might be blocked by an extension',
    ],
    canRetry: true,
    showDiagnostics: false,
    icon: 'ban',
  },

  [ChromiumErrorCodes.BLOCKED_BY_ADMINISTRATOR]: {
    code: ChromiumErrorCodes.BLOCKED_BY_ADMINISTRATOR,
    category: ErrorCategory.BLOCKED,
    title: 'Blocked by administrator',
    description: 'Access to this website has been blocked by your administrator.',
    errorName: 'ERR_BLOCKED_BY_ADMINISTRATOR',
    suggestions: [
      'Contact your network administrator',
      'This website might be restricted by your organization',
    ],
    canRetry: false,
    showDiagnostics: false,
    icon: 'shield-ban',
  },

  [ChromiumErrorCodes.BLOCKED_BY_RESPONSE]: {
    code: ChromiumErrorCodes.BLOCKED_BY_RESPONSE,
    category: ErrorCategory.BLOCKED,
    title: 'Blocked',
    description: 'The response was blocked.',
    errorName: 'ERR_BLOCKED_BY_RESPONSE',
    suggestions: [
      'The website might be blocking this request',
      'Try again later',
    ],
    canRetry: true,
    showDiagnostics: false,
    icon: 'ban',
  },

  [ChromiumErrorCodes.BLOCKED_BY_CSP]: {
    code: ChromiumErrorCodes.BLOCKED_BY_CSP,
    category: ErrorCategory.BLOCKED,
    title: 'Blocked by Content Security Policy',
    description: 'The content was blocked by the website\'s security policy.',
    errorName: 'ERR_BLOCKED_BY_CSP',
    suggestions: [
      'This is a security feature of the website',
      'Contact the website administrator',
    ],
    canRetry: false,
    showDiagnostics: false,
    icon: 'shield-ban',
  },

  // Address Errors
  [ChromiumErrorCodes.ADDRESS_INVALID]: {
    code: ChromiumErrorCodes.ADDRESS_INVALID,
    category: ErrorCategory.NETWORK,
    title: "This site can't be reached",
    description: 'The address is invalid.',
    errorName: 'ERR_ADDRESS_INVALID',
    suggestions: [
      'Check if the URL is correct',
      'The address format might be wrong',
    ],
    canRetry: false,
    showDiagnostics: false,
    icon: 'map-pin-off',
  },

  [ChromiumErrorCodes.ADDRESS_UNREACHABLE]: {
    code: ChromiumErrorCodes.ADDRESS_UNREACHABLE,
    category: ErrorCategory.NETWORK,
    title: "This site can't be reached",
    description: 'The address is unreachable.',
    errorName: 'ERR_ADDRESS_UNREACHABLE',
    suggestions: [
      'Check your internet connection',
      'The server might be down',
      'Try again later',
    ],
    canRetry: true,
    showDiagnostics: true,
    icon: 'map-pin-off',
  },

  // File Errors
  [ChromiumErrorCodes.FILE_NOT_FOUND]: {
    code: ChromiumErrorCodes.FILE_NOT_FOUND,
    category: ErrorCategory.HTTP,
    title: 'File not found',
    description: 'The requested file was not found.',
    errorName: 'ERR_FILE_NOT_FOUND',
    suggestions: [
      'Check if the file path is correct',
      'The file might have been moved or deleted',
    ],
    canRetry: false,
    showDiagnostics: false,
    icon: 'file-x',
  },

  [ChromiumErrorCodes.ACCESS_DENIED]: {
    code: ChromiumErrorCodes.ACCESS_DENIED,
    category: ErrorCategory.BLOCKED,
    title: 'Access denied',
    description: 'You don\'t have permission to access this resource.',
    errorName: 'ERR_ACCESS_DENIED',
    suggestions: [
      'Check your permissions',
      'Contact the administrator',
    ],
    canRetry: false,
    showDiagnostics: false,
    icon: 'lock',
  },

  // Aborted (user cancelled)
  [ChromiumErrorCodes.ABORTED]: {
    code: ChromiumErrorCodes.ABORTED,
    category: ErrorCategory.UNKNOWN,
    title: 'Navigation cancelled',
    description: 'The navigation was cancelled.',
    errorName: 'ERR_ABORTED',
    suggestions: [],
    canRetry: true,
    showDiagnostics: false,
    icon: 'x-circle',
  },

  // Failed (generic)
  [ChromiumErrorCodes.FAILED]: {
    code: ChromiumErrorCodes.FAILED,
    category: ErrorCategory.UNKNOWN,
    title: 'Something went wrong',
    description: 'An error occurred while loading the page.',
    errorName: 'ERR_FAILED',
    suggestions: [
      'Try reloading the page',
      'Check your internet connection',
    ],
    canRetry: true,
    showDiagnostics: true,
    icon: 'alert-triangle',
  },

  // Unsafe port
  [ChromiumErrorCodes.UNSAFE_PORT]: {
    code: ChromiumErrorCodes.UNSAFE_PORT,
    category: ErrorCategory.BLOCKED,
    title: 'Unsafe port blocked',
    description: 'The requested port is not allowed for security reasons.',
    errorName: 'ERR_UNSAFE_PORT',
    suggestions: [
      'Use a standard port (80 for HTTP, 443 for HTTPS)',
      'Contact the website administrator',
    ],
    canRetry: false,
    showDiagnostics: false,
    icon: 'shield-ban',
  },
};

export function getErrorPageConfig(errorCode: number): ErrorPageConfig {
  const config = ERROR_PAGE_CONFIGS[errorCode];
  
  if (config) {
    return config;
  }

  return {
    code: errorCode,
    category: ErrorCategory.UNKNOWN,
    title: 'Something went wrong',
    description: `An error occurred while loading the page (Error code: ${errorCode}).`,
    errorName: `ERR_UNKNOWN_${Math.abs(errorCode)}`,
    suggestions: [
      'Try reloading the page',
      'Check your internet connection',
      'Try again later',
    ],
    canRetry: true,
    showDiagnostics: true,
    icon: 'alert-triangle',
  };
}

export function shouldShowErrorPage(errorCode: number): boolean {
  // -3 (ABORTED) is typically user-initiated (clicking a link while loading, etc.)
  if (errorCode === ChromiumErrorCodes.ABORTED) {
    return false;
  }

  // -1 (IO_PENDING) is not an error
  if (errorCode === ChromiumErrorCodes.IO_PENDING) {
    return false;
  }

  // Show error page for all other error codes
  return errorCode < 0;
}

export function isSecurityError(errorCode: number): boolean {
  const config = ERROR_PAGE_CONFIGS[errorCode];
  if (!config) return false;
  
  return [
    ErrorCategory.SSL,
    ErrorCategory.CERTIFICATE,
  ].includes(config.category);
}

export function getErrorMessage(errorCode: number, url?: string): string {
  const config = getErrorPageConfig(errorCode);
  
  if (url) {
    try {
      const hostname = new URL(url).hostname;
      return `${hostname} ${config.description.toLowerCase()}`;
    } catch {
      return config.description;
    }
  }
  
  return config.description;
}

export interface ErrorPageData {
  errorCode: number;
  errorName: string;
  url: string;
  title: string;
  description: string;
  suggestions: string[];
  canRetry: boolean;
  showDiagnostics: boolean;
  icon: string;
  category: ErrorCategory;
  timestamp: number;
}

export function createErrorPageData(errorCode: number, url: string): ErrorPageData {
  const config = getErrorPageConfig(errorCode);
  
  let hostname = '';
  try {
    hostname = new URL(url).hostname;
  } catch {
    hostname = url;
  }

  return {
    errorCode,
    errorName: config.errorName,
    url,
    title: config.title,
    description: config.description.replace('The server', hostname || 'The server'),
    suggestions: config.suggestions,
    canRetry: config.canRetry,
    showDiagnostics: config.showDiagnostics,
    icon: config.icon,
    category: config.category,
    timestamp: Date.now(),
  };
}
