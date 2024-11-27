#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  Tool,
  Resource,
  CallToolResult,
  TextContent,
} from "@modelcontextprotocol/sdk/types.js";
import Stripe from 'stripe';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema/dist/index.js';  // Import with .js extension.

const version = "0.1.0";

// Environment Variable Validation
const requiredEnvVars = ['STRIPE_SECRET_KEY'];
const missingEnvVars = requiredEnvVars.filter(v => !process.env[v]);
if (missingEnvVars.length > 0) {
  console.error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
  process.exit(1);
}

// Logging with version
console.error(`Stripe MCP Server v${version} starting...`);



// --- Type Definitions ---
interface ListTransactionsArgs {
  limit?: number;
  starting_after?: string;
  ending_before?: string;
}

interface ListCustomersArgs {
  limit?: number;
  starting_after?: string;
  ending_before?: string;
  email?: string;
}

interface PaymentMethodsArgs {
  customer: string;
}

interface InvoiceHistoryArgs {
  customer: string;
  limit?: number;
  starting_after?: string;
  ending_before?: string;
}

interface SubscriptionMetricsArgs {
  from_date?: string;
  to_date?: string;
}


// --- Zod Schemas for Tool Inputs ---
const ListTransactionsSchema = z.object({
  limit: z.number().int().positive().optional(),
  starting_after: z.string().optional(),
  ending_before: z.string().optional(),
});

const ListCustomersSchema = z.object({
  limit: z.number().max(100).optional(), 
  starting_after: z.string().optional(),
  ending_before: z.string().optional(),
  email: z.string().optional()
});

const GetBalanceSchema = z.object({});

const GetPaymentMethodsSchema = z.object({
  customer: z.string(),
});

const GetInvoiceHistorySchema = z.object({
  customer: z.string(),
  limit: z.number().optional().max(100),
  starting_after: z.string().optional(),
  ending_before: z.string().optional()
});

const SubscriptionMetricsSchema = z.object({
  from_date: z.string().datetime({ message: "Invalid from_date format. Use a valid date-time string." }).optional(),
  to_date: z.string().datetime({ message: "Invalid to_date format. Use a valid date-time string." }).optional()
}).refine(data => {
  if (data.from_date && data.to_date) {
    return new Date(data.from_date) < new Date(data.to_date);
  }
  return true;
}, {
  message: "from_date must be before to_date"
});




// --- Stripe Initialization with Error Handling ---
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const TIMEOUT_MS = 30000; // Timeout for Stripe requests


async function initializeStripe(): Promise<Stripe> {
  try {
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16',
    });

    // Test the connection
    await stripe.balance.retrieve();

    return stripe;
  } catch (error) {
    console.error("Failed to initialize Stripe client:", error);
    process.exit(1);
  }
}



// --- Tool Definitions ---

const TOOLS: Tool[] = [
  {
    name: "stripe_list_transactions",
    description: "List recent transactions with pagination support",
    inputSchema: zodToJsonSchema(ListTransactionsSchema),
  },
  {
    name: "stripe_get_balance",
    description: "Get current account balance and pending payouts",
    inputSchema: zodToJsonSchema(GetBalanceSchema) as any,
  },
  {
    name: "stripe_list_customers",
    description: "List customers with their payment history and metadata",
    inputSchema: zodToJsonSchema(ListCustomersSchema)
  },
  {
    name: "stripe_payment_methods",
    description: "List saved payment methods for a customer",
    inputSchema: zodToJsonSchema(GetPaymentMethodsSchema)
  },
  {
    name: "stripe_invoice_history",
    description: "Get invoice history with status and payment details",
    inputSchema: zodToJsonSchema(GetInvoiceHistorySchema),
  },
  {
    name: "stripe_subscription_metrics",
    description: "Get subscription metrics like MRR, churn rate, etc.",
    inputSchema: zodToJsonSchema(SubscriptionMetricsSchema)
  },
];



// --- MCP Server Setup ---

const server = new Server(
  {
    name: "stripe",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);




// --- Resource Handlers ---

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: "stripe://dashboard",
      mimeType: "text/plain",
      name: "Stripe Dashboard Summary",
      description: "Current balance and recent transaction summary"
    } as Resource
  ],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
 // ... (same as before)
});


// --- Tool Handlers ---
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));


async function handleToolCall(name: string, args: any): Promise<{ toolResult: CallToolResult }> {  // Added return type
  const stripeClient = await initializeStripe(); // Initialize within the handler

  console.error(`Processing ${name} with args:`, args); // Debug logging

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Request timed out")), TIMEOUT_MS)
  );


  try {
    switch (name) {
      case "stripe_list_transactions": {
        const parsedArgs = ListTransactionsSchema.parse(args);
        const transactions = await Promise.race([stripeClient.charges.list(parsedArgs), timeoutPromise]);

        if (!transactions.data || !Array.isArray(transactions.data)) {
          throw new Error("Invalid response from Stripe API (list transactions)");
        }

        return {
          toolResult: {
            content: [{ type: "text", text: JSON.stringify(transactions.data) }],
            isError: false,
          },
        };
      }

      case "stripe_get_balance": {
        const balance = await Promise.race([stripeClient.balance.retrieve(), timeoutPromise]);
        return {
          toolResult: {
            content: [{ type: "text", text: JSON.stringify(balance) }],
            isError: false,
          },
        };
      }

      case "stripe_list_customers": {
        const parsedArgs = ListCustomersSchema.parse(args);
        const customers = await Promise.race([stripeClient.customers.list(parsedArgs), timeoutPromise]);

        if (!customers.data || !Array.isArray(customers.data)) {
          throw new Error("Invalid response from Stripe API (list customers)");
        }

        return {
          toolResult: {
            content: [{ type: "text", text: JSON.stringify(customers.data) }],
            isError: false,
          },
        };
      }

      case "stripe_payment_methods": {
        const parsedArgs = GetPaymentMethodsSchema.parse(args);
        const paymentMethods = await Promise.race([stripeClient.paymentMethods.list({
          customer: parsedArgs.customer,
          type: 'card',
        }), timeoutPromise]);

        if (!paymentMethods.data || !Array.isArray(paymentMethods.data)) {
          throw new Error("Invalid response from Stripe API (payment methods)");
        }

        return {
          toolResult: {
            content: [{ type: "text", text: JSON.stringify(paymentMethods.data) }],
            isError: false,
          },
        };
      }

      case "stripe_invoice_history": {
        const parsedArgs = GetInvoiceHistorySchema.parse(args);
        const invoices = await Promise.race([stripeClient.invoices.list(parsedArgs), timeoutPromise]);

        if (!invoices.data || !Array.isArray(invoices.data)) {
          throw new Error("Invalid response from Stripe API (invoice history)");
        }

        return {
          toolResult: {
            content: [{ type: "text", text: JSON.stringify(invoices.data) }],
            isError: false,
          },
        };
      }


      case "stripe_subscription_metrics": {
        const parsedArgs = SubscriptionMetricsSchema.parse(args);
        const subscriptions = await Promise.race([stripeClient.subscriptions.list({
          status: 'active',
          created: {
	     gte: parsedArgs.from_date ? Math.floor(new Date(parsedArgs.from_date).getTime() / 1000) : undefined,
	     lte: parsedArgs.to_date ? Math.floor(new Date(parsedArgs.to_date).getTime() / 1000) : undefined,
          },
          expand: ['data.items.data.price'],
        }), timeoutPromise]);


        if (!subscriptions.data || !Array.isArray(subscriptions.data)) {
          throw new Error("Invalid response from Stripe API (subscription metrics)");
        }


        const mrr = subscriptions.data.reduce((total, sub) =>
          total + sub.items.data.reduce((itemTotal, item) =>
            itemTotal + (item.price?.unit_amount || 0) * item.quantity, 0), 0) / 100;


        const metrics = {
          active_subscriptions: subscriptions.data.length,
          mrr,
          average_subscription_value: subscriptions.data.length > 0 ? mrr / subscriptions.data.length : 0
        };

        return {
          toolResult: {
            content: [{ type: "text", text: JSON.stringify(metrics) }],
            isError: false
          }
        };

      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    if (error instanceof Stripe.StripeError && error.type === 'rate_limit') {
      const retryAfter = error.headers?.['retry-after'];
      return {
        toolResult: {
          content: [{
            type: "text",
            text: `Rate limit exceeded. Retry after ${retryAfter} seconds.`
          }],
          isError: true
        }
      };
    }

    if (error instanceof z.ZodError) {
      return {
        toolResult: {
          content: [{ type: "text", text: `Invalid arguments: ${error.format()}` }],
          isError: true,
        },
      };
    } else if (error instanceof Stripe.StripeError) {
      return {
        toolResult: {
          content: [{ type: "text", text: `Stripe API Error v${version}: ${error.message} (code: ${error.code})` }], // Version added
          isError: true,
        },
      };
    } else {
      return {
        toolResult: {
          content: [{ type: "text", text: `Error v${version}: ${error instanceof Error ? error.message : String(error)}` }], // Version added
          isError: true,
        },
      };
    }
  }
}



server.setRequestHandler(CallToolRequestSchema, async (request) => {
  return handleToolCall(request.params.name, request.params.arguments ?? {});
});


async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Stripe MCP Server running on stdio");
}

runServer().catch((error) => {
  console.error(`Fatal error in main() v${version}:`, error); // Version in fatal error
  process.exit(1);
});
export { server, initializeStripe, handleToolCall };