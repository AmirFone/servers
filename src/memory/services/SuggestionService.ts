import type { KnowledgeGraph, Entity, Relation } from '../types/index.js';
import { MCP_TOOLS, TOOL_CATEGORIES, MCPToolInfo } from '../data/tools.js';

interface MCPTool {
  name: string;
  description: string;
  server: string;
}

interface SuggestionResult {
  suggestedTools: MCPTool[];
  reasoning: string;
}

export class SuggestionService {
  private readonly SUGGESTION_INTERVAL = 1;

  constructor() {
    console.log('SuggestionService initialized with interval:', this.SUGGESTION_INTERVAL);
    console.log('Available tool categories:', TOOL_CATEGORIES);
  }

  shouldSuggest(interactionCount: number): boolean {
    const should = interactionCount % this.SUGGESTION_INTERVAL === 0;
    console.log(`Checking if should suggest at count ${interactionCount}: ${should}`);
    return should;
  }

  async analyzePatternsAndSuggest(
    graph: KnowledgeGraph, 
    availableTools: MCPTool[]
  ): Promise<SuggestionResult> {
    console.log('Analyzing graph:', {
      entityCount: graph.entities.length,
      relationCount: graph.relations.length,
      availableToolCount: availableTools.length
    });

    const entityTypes = new Set(graph.entities.map((e: Entity) => e.entityType));
    const relationTypes = new Set(graph.relations.map((r: Relation) => r.relationType));
    
    console.log('Detected types:', {
      entityTypes: Array.from(entityTypes),
      relationTypes: Array.from(relationTypes)
    });

    // Match entity and relation types to tool categories
    const matchedTools = new Set<MCPToolInfo>();
    
    for (const tool of MCP_TOOLS) {
      // Check if tool's category matches the context
      const isRelevant = this.isToolRelevantForContext(
        tool,
        Array.from(entityTypes),
        Array.from(relationTypes)
      );

      if (isRelevant) {
        console.log(`Matched tool: ${tool.tool} (${tool.category})`);
        matchedTools.add(tool);
      }
    }

    // Filter available tools based on matched tools
    const suggestedTools = availableTools.filter(tool => 
      Array.from(matchedTools).some(matchedTool => 
        tool.name === matchedTool.tool || 
        tool.server === matchedTool.tool
      )
    );

    console.log(`Found ${suggestedTools.length} suggested tools`);

    const result = {
      suggestedTools,
      reasoning: this.generateReasoning(
        entityTypes as Set<string>, 
        relationTypes as Set<string>, 
        suggestedTools,
        Array.from(matchedTools).map(t => t.category)
      )
    };

    console.log('Suggestion result:', result);
    return result;
  }

  private isToolRelevantForContext(
    tool: MCPToolInfo,
    entityTypes: string[],
    relationTypes: string[]
  ): boolean {
    const context = [...entityTypes, ...relationTypes].join(' ').toLowerCase();
    const toolContext = `${tool.category} ${tool.description}`.toLowerCase();

    // Check for keyword matches
    const keywords = toolContext.split(/\W+/);
    return keywords.some(keyword => 
      keyword.length > 3 && context.includes(keyword)
    );
  }

  private generateReasoning(
    entityTypes: Set<string>, 
    relationTypes: Set<string>, 
    suggestedTools: MCPTool[],
    matchedCategories: string[]
  ): string {
    const reasoning = `Based on your knowledge graph containing ${
      Array.from(entityTypes).join(', ')
    } entities and ${
      Array.from(relationTypes).join(', ')
    } relations, I've identified relevant tool categories: ${
      matchedCategories.join(', ')
    }. Here are ${suggestedTools.length} suggested tools that might help with your current context.`;
    
    console.log('Generated reasoning:', reasoning);
    return reasoning;
  }
} 