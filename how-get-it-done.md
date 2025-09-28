1. Discover Server Categories or Actions
discover_server_categories_or_actions - find relevant categories or actions based on user intent. No semantic search!

Tool Details
Description: PREFERRED STARTING POINT. Discover available categories or actions based on user query. Try this tool first when exploring what actions are available across servers. This is the primary entry point for exploring available actions and should be used before other search methods. The output will be a list of servers with detail level and details.If detail level is ‘categories_only’, the details will be a list of category names only. Next step prefer to use get_category_actions tool to get the actions for the categories.If detail level is ‘full_details’, the details will be a list of category names with their actions details included. This happens when the server has only a few actions. Next step prefer to use execute_action tool to execute the actions.If detail level is ‘categories_and_actions’, the details will be a list of category names and action names. This happens when using external tools. Next step prefer to use get_action_details tool to get the details of the actions.Parameters:

    user_query (string, required): Natural language user query to filter results.
    server_names (array, required): List of server names to discover categories or actions.


2. Get Category Actions
get_category_actions - retrieve all action names within specified categories.

Tool Details
Description: Get a comprehensive overview of API actions available within specific categories. Use this tool if you want to explore what actions are available in particular service categories or get a detailed view of category capabilities. ** Important **: It should only be called after you get the server categories from the discover_server_categories tool.Parameters:

    category_names (array, required): List of categories to get actions for

3. Get Action Details
get_action_details - get full schema and parameters for a specific action.

Tool Details
Description: Get detailed information about a specific action, including required and optional parameters. Must provide category name and action name. ** Important **: It should only be called after you get the server categories from previous tool calls.Parameters:

    category_name (string, required): The name of the category
    action_name (string, required): The name of the action/operation within the category


4. Execute Action
execute_action - run actions with parameters and get results.

Tool Details
Description: Execute a specific action with the provided parameters. Must provide server name, action name, and action parameters. ** Important **: It should only be called after you get the action details from the get_action_details tool.Parameters:

    server_name (string, required): The name of the server
    category_name (string, required): The name of the category to execute the action for
    action_name (string, required): The name of the action/operation to execute
    path_params (string, optional): JSON string containing path parameters for the action
    query_params (string, optional): JSON string containing query parameters for the action
    body_schema (string, optional, default: ""): JSON string containing request body for actions
    include_output_fields (array, optional): Optional but strongly recommended when you know the response_schema of this action from previous tool calls: Array of field paths to include in the response. Only these fields will be returned. Use dot notation for nested fields (e.g., “author.displayName”).
    maximum_output_characters (integer, optional): Optional: Maximum number of characters to return in the response. If the response exceeds this limit, it will be truncated. Prefer include_output_fields over this.

5. Search Documentation
search_documentation - find relevant information only when needed.

Tool Details
Description: SECONDARY OPTION: Use this tool only when discover_server_categories doesn’t provide sufficient detail or when you need to search within a specific server’s documentation. Search for server action documentations by category, operation, tags, or functionality using keyword matching. This is not a natural language search - it matches exact keywords and phrases. Returns endpoints ranked by relevance. Use a few targeted keywords to find the best matches. Common patterns: category names (‘projects’, ‘users’, ‘pipelines’), actions (‘create’, ‘delete’, ‘list’, ‘get’), or combinations (‘create user’, ‘list projects’). The search algorithm uses smart scoring to prevent verbose description fields from overwhelming results.Parameters:

    query (string, required): Search keywords that match API documentation terms. Best practices: (1) Use resource names like ‘users’, ‘projects’, ‘files’, (2) Add actions for precision like ‘user create’ or ‘project delete’, (3) Avoid filler words like ‘how to’, ‘show me’, ‘all the’ - focus on the core terms that appear in endpoint names and descriptions.
    server_name (string, required): Name of the server to search within.
    max_results (integer, optional, default: 10, minimum: 1, maximum: 50): Number of results to return. Default: 10

6. Handle Auth Failure
handle_auth_failure - handle authentication only when needed.

Tool Details
Description: Handle authentication failures that occur when executing actions. CRITICAL: This tool should ONLY be called when execute_action fails specifically due to authentication issues (401 Unauthorized, invalid credentials, expired tokens, etc.). DO NOT call this tool to check authentication status or for any other purpose. Usage: (1) When execute_action returns an authentication error, call this tool with ‘get_auth_url’ to get authentication instructions. (2) When user provides authentication data after a failure, call this tool with ‘save_auth_data’ to save the credentials. NEVER call this tool if the failure is NOT an authentication failure (e.g., 404 Not Found, 500 Internal Server Error, etc.).Parameters:

    server_name (string, required): The name of the server that failed authentication during execute_action
    intention (string, required, enum: [“get_auth_url”, “save_auth_data”]): Use ‘get_auth_url’ when execute_action fails with authentication errors to get authentication instructions. Use ‘save_auth_data’ when user provides authentication credentials after an authentication failure.
    auth_data (object, optional): Authentication data provided by user after an authentication failure (e.g., {"token": "...", "api_key": "..."}). Only used with ‘save_auth_data’ intention when resolving authentication failures.
