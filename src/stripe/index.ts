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
  ReadResourceRequest,
  ReadResourceResponse,
} from "@modelcontextprotocol/sdk/types.js";
import Stripe from 'stripe';

const version = "0.1.0";

// Environment Variable Validation
const requiredEnvVars = ['STRIPE_SECRET_KEY'];
const missingEnvVars = requiredEnvVars.filter(v => !process.env[v]);
if (missingEnvVars.length > 0) {
  console.error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
  process.exit(1);
}

console.error(`Stripe MCP Server v${version} starting...`);

// --- Type Definitions (for Tool Arguments) ---
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

// --- Tool Definitions (Manual JSON Schema) ---
const TOOLS: Tool[] = [
  {
    name: "stripe_list_transactions",
    description: "List recent transactions with pagination support.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", minimum: 1, description: "Number of transactions to retrieve." },
        starting_after: { type: "string", description: "Cursor for pagination." },
        ending_before: { type: "string", description: "Cursor for pagination." }
      }
    }
  },
  {
    name: "stripe_get_balance",
    description: "Get current account balance and pending payouts.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "stripe_list_customers",
    description: "List customers with pagination support.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", maximum: 100, description: "Number of customers to retrieve (max 100)." },
        starting_after: { type: "string", description: "Cursor for pagination." },
        ending_before: { type: "string", description: "Cursor for pagination." },
        email: { type: "string", description: "Filter customers by email." }
      }
    }
  },
  {
    name: "stripe_payment_methods",
    description: "List saved payment methods for a customer.",
    inputSchema: {
      type: "object",
      properties: {
        customer: { type: "string", description: "Customer ID." }
      },
      required: ["customer"]
    }
  },
  {
    name: "stripe_invoice_history",
    description: "Get invoice history with status and payment details.",
    inputSchema: {
      type: "object",
      properties: {
        customer: { type: "string", description: "Customer ID." },
        limit: { type: "number", maximum: 100, description: "Number of invoices to retrieve (max 100)." },
        starting_after: { type: "string", description: "Cursor for pagination." },
        ending_before: { type: "string", description: "Cursor for pagination." }
      },
      required: ["customer"]
    }
  },
  {
    name: "stripe_subscription_metrics",
    description: "Get subscription metrics like MRR, churn rate, etc.",
    inputSchema: {
      type: "object",
      properties: {
        from_date: { type: "string", format: "date-time", description: "Start date for metrics (ISO 8601 format)." },
        to_date: { type: "string", format: "date-time", description: "End date for metrics (ISO 8601 format)." }
      }
    },
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


server.setRequestHandler(ReadResourceRequestSchema, async (request: ReadResourceRequest) => {
  if (request.params.uri === "stripe://dashboard") {
    try {
      const stripeClient = await initializeStripe();
      const balance = await stripeClient.balance.retrieve();
      const transactions = await stripeClient.charges.list({ limit: 5 });
      //Or stripeClient.charges.search if using search


      const balanceAmount = balance.available.length ? balance.available[0].amount / 100 : 0;
      const balanceCurrency = balance.available.length ? balance.available[0].currency : '';

      let summary = `Current Balance: ${balanceAmount} ${balanceCurrency}\n\nRecent Transactions:\n`;
      if (transactions.data) {
        transactions.data.forEach(transaction => {
          summary += `- ${transaction.amount / 100} ${transaction.currency} on ${new Date(transaction.created * 1000).toLocaleDateString()}\n`;
        });
      }

      return {
        contents: [{
          type: "text",
          text: summary,
          mimeType: "text/plain",
          uri: request.params.uri
        }]
      };
    } catch (error) {
      return {
        contents: [{
          type: "text",
          text: `Error fetching dashboard data: ${error instanceof Error ? error.message : String(error)}`,
          mimeType: "text/plain",
          uri: request.params.uri,
          isError: true
        }],
        isError: true // Add isError to contents as well
      };
    }
  }

  throw new Error(`Resource not found: ${request.params.uri}`);
});

// --- Tool Handlers ---
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

async function handleToolCall(name: string, args: any): Promise<{ toolResult: CallToolResult }> {
  const stripeClient = await initializeStripe();
  console.error(`Processing ${name} with args:`, args);

  const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Request timed out")), TIMEOUT_MS));

  try {
    switch (name) {
      case "stripe_list_transactions": {
        const parsedArgs = args as ListTransactionsArgs;
        const transactions = await Promise.race([stripeClient.charges.list(parsedArgs), timeoutPromise]) as Stripe.Response<Stripe.ApiList<Stripe.Charge>>;

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
        const balance = await Promise.race([stripeClient.balance.retrieve(), timeoutPromise]) as Stripe.Response<Stripe.Balance>;

        return {
          toolResult: {
            content: [{ type: "text", text: JSON.stringify(balance) }],
            isError: false,
          },
        };
      }

      case "stripe_list_customers": {
        const parsedArgs = args as ListCustomersArgs;
        const customers = await Promise.race([stripeClient.customers.list(parsedArgs), timeoutPromise]) as Stripe.Response<Stripe.ApiList<Stripe.Customer>>;

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
        const parsedArgs = args as PaymentMethodsArgs;
        const paymentMethods = await Promise.race([stripeClient.paymentMethods.list({
          customer: parsedArgs.customer,
          type: 'card', // You can expand supported types
        }), timeoutPromise]) as Stripe.Response<Stripe.ApiList<Stripe.PaymentMethod>>;


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
        const parsedArgs = args as InvoiceHistoryArgs;
        const invoices = await Promise.race([stripeClient.invoices.list(parsedArgs), timeoutPromise]) as Stripe.Response<Stripe.ApiList<Stripe.Invoice>>;

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
        const parsedArgs = args as SubscriptionMetricsArgs;
        let fromDate: number | undefined;

        if (parsedArgs.from_date) {
            fromDate = new Date(parsedArgs.from_date).getTime();
            if (isNaN(fromDate)) {
                throw new Error("Invalid 'from_date'.  Use ISO 8601 format.");
            }
            fromDate = Math.floor(fromDate / 1000);  // Convert to seconds since epoch
        }

        let toDate: number | undefined;
        if (parsedArgs.to_date) {
            toDate = new Date(parsedArgs.to_date).getTime();
            if (isNaN(toDate)) {
                throw new Error("Invalid 'to_date'. Use ISO 8601 format.");
            }
            toDate = Math.floor(toDate / 1000); //Convert to seconds since epoch
        }


        if (fromDate && toDate && fromDate > toDate) {
            throw new Error("'from_date' must be before 'to_date'.");
        }


        const subscriptions = await Promise.race([stripeClient.subscriptions.list({
            status: 'active',
            created: {
                gte: fromDate,  // These can now be undefined
                lte: toDate   // These can now be undefined
            },
            expand: ['data.items.data.price'] //Expands the price information so we can use it in calculations
        }), timeoutPromise]) as Stripe.Response<Stripe.ApiList<Stripe.Subscription>>; // Type cast to avoid unknown types


        if (!subscriptions.data || !Array.isArray(subscriptions.data)) {
            throw new Error("Invalid response from Stripe API (subscription metrics)");
        }


        const mrr = subscriptions.data.reduce((total, sub) =>
            total + sub.items.data.reduce((itemTotal, item) =>
                itemTotal + (item.price.unit_amount || 0) * (item.quantity || 1), 0), 0) / 100;


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
    if ((error as any) instanceof Stripe.StripeError && (error as any).type === 'rate_limit') { // Type guard for Stripe errors
      const retryAfter = (error as any).headers?.['retry-after'];
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
      return {
          toolResult: {
            content: [{
              type: "text", text: `Error v${version}: ${error instanceof Error ? error.message : String(error)}`
            }], isError: true
          }
        };      
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
console.error(`Fatal error in main() v${version}:`, error);
process.exit(1);
});