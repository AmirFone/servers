import type { KnowledgeGraph, Entity, Relation } from '../types/index.js';

interface MCPTool {
  name: string;
  description: string;
  server: string;
}

interface ToolMapping {
  [category: string]: {
    entityTypes: string[];
    relationTypes: string[];
    tools: string[];
  }
}

interface SuggestionResult {
  suggestedTools: MCPTool[];
  reasoning: string;
}

export class SuggestionService {
  private readonly SUGGESTION_INTERVAL = 1;
  private readonly toolMappings: ToolMapping = {
    "Browser Automation": {
      entityTypes: ["webpage", "browser", "automation"],
      relationTypes: ["scrapes", "automates", "interacts_with"],
      tools: ["playwright-mcp-server", "server-puppeteer", "mcp-server-youtube-transcript"]
    },
    "File Systems": {
      entityTypes: ["file", "directory", "document"],
      relationTypes: ["contains", "stored_in", "references"],
      tools: ["server-filesystem", "server-google-drive", "mcp-filesystem-server"]
    },
    "Version Control": {
      entityTypes: ["repository", "code", "commit"],
      relationTypes: ["contains", "depends_on", "modifies"],
      tools: ["server-github", "server-gitlab", "server-git"]
    },
    "Databases": {
      entityTypes: ["database", "table", "query"],
      relationTypes: ["contains", "references", "joins"],
      tools: ["server-postgres", "server-sqlite", "mcp-server-bigquery"]
    },
    "Search": {
      entityTypes: ["search", "query", "result"],
      relationTypes: ["finds", "matches", "relates_to"],
      tools: ["server-brave-search", "mcp-servers-kagi", "mcp-webresearch"]
    }
  };

  constructor() {}

  shouldSuggest(interactionCount: number): boolean {
    return interactionCount % this.SUGGESTION_INTERVAL === 0;
  }

  async analyzePatternsAndSuggest(
    graph: KnowledgeGraph, 
    availableTools: MCPTool[]
  ): Promise<SuggestionResult> {
    const entityTypes = new Set(graph.entities.map((e: Entity) => e.entityType));
    const relationTypes = new Set(graph.relations.map((r: Relation) => r.relationType));
    
    const matchedCategories = new Set<string>();
    
    // Match entity and relation types to categories
    for (const [category, mapping] of Object.entries(this.toolMappings)) {
      const hasMatchingEntityType = mapping.entityTypes.some(type => 
        Array.from(entityTypes).some(entityType => 
          entityType.toLowerCase().includes(type.toLowerCase())
        )
      );
      
      const hasMatchingRelationType = mapping.relationTypes.some(type =>
        Array.from(relationTypes).some(relationType =>
          relationType.toLowerCase().includes(type.toLowerCase())
        )
      );

      if (hasMatchingEntityType || hasMatchingRelationType) {
        matchedCategories.add(category);
      }
    }

    // Filter available tools based on matched categories
    const suggestedTools = availableTools.filter(tool => {
      return Array.from(matchedCategories).some(category =>
        this.toolMappings[category].tools.includes(tool.name)
      );
    });

    return {
      suggestedTools,
      reasoning: this.generateReasoning(entityTypes as Set<string>, relationTypes as Set<string>, suggestedTools, matchedCategories)
    };
  }

  private generateReasoning(
    entityTypes: Set<string>, 
    relationTypes: Set<string>, 
    suggestedTools: MCPTool[],
    matchedCategories: Set<string>
  ): string {
    return `Based on your knowledge graph containing ${
      Array.from(entityTypes).join(', ')
    } entities and ${
      Array.from(relationTypes).join(', ')
    } relations, I've identified relevant tool categories: ${
      Array.from(matchedCategories).join(', ')
    }. Here are ${suggestedTools.length} suggested tools that might help with your current context.`;
  }
} 