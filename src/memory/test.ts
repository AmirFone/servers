import { Client } from "@modelcontextprotocol/sdk/client/index.js";

async function test() {
  const client = new Client(
    { name: "test-client", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );
  
  const result = await client.callTool({
    name: "mcp_suggest",
    arguments: {
      interactionCount: 5,
      availableTools: [
        {
          name: "filesystem-read",
          description: "Read files from filesystem",
          server: "filesystem"
        },
        {
          name: "git-commit",
          description: "Make git commits",
          server: "git"
        }
      ]
    }
  });

  console.log(JSON.stringify(result, null, 2));
}

test().catch(console.error); 