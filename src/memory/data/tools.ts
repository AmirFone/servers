export interface MCPToolInfo {
  tool: string;
  category: string;
  description: string;
}

export const MCP_TOOLS: MCPToolInfo[] = [
  {
    tool: "playwright-mcp-server",
    category: "Browser Automation",
    description: "Web content access and automation with Playwright."
  },
  {
    tool: "server-puppeteer",
    category: "Browser Automation",
    description: "Web scraping and interaction automation."
  },
  {
    tool: "server-filesystem",
    category: "File Systems",
    description: "Direct local file system access."
  },
  {
    tool: "server-google-drive",
    category: "File Systems",
    description: "Google Drive file operations."
  },
  {
    tool: "server-github",
    category: "Version Control",
    description: "GitHub repository management and operations."
  },
  {
    tool: "server-gitlab",
    category: "Version Control",
    description: "GitLab project management and CI/CD."
  },
  {
    tool: "server-git",
    category: "Version Control",
    description: "Local Git repository operations."
  },
  {
    tool: "server-postgres",
    category: "Databases",
    description: "PostgreSQL integration with schema inspection."
  },
  {
    tool: "server-sqlite",
    category: "Databases",
    description: "SQLite operations with analysis features."
  },
  {
    tool: "server-brave-search",
    category: "Search",
    description: "Web search using Brave's API."
  },
  {
    tool: "server-memory",
    category: "Knowledge & Memory",
    description: "Persistent memory using knowledge graphs."
  }
];

export const TOOL_CATEGORIES = Array.from(new Set(MCP_TOOLS.map(t => t.category))); 