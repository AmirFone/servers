### Example Usage
```json
// List recent transactions
{
  "name": "stripe_list_transactions",
  "arguments": {
    "limit": 5
  }
}

// Get account balance
{
  "name": "stripe_get_balance",
  "arguments": {}
}

// List Customers
{
  "name": "stripe_list_customers",
  "arguments": {
    "limit": 10
  }
}

// Get payment methods for a customer
{
  "name": "stripe_payment_methods",
  "arguments": {
    "customer": "cus_XXXXXX"  
  }
}

// Get invoice history
{
  "name": "stripe_invoice_history",
  "arguments": {
    "customer": "cus_XXXXXX" 
  }
}

// Get subscription metrics
{
  "name": "stripe_subscription_metrics",
  "arguments": {
    "from_date": "2024-01-01T00:00:00Z",  // Optional ISO 8601 date string
    "to_date": "2024-12-31T23:59:59Z"   // Optional ISO 8601 date string
  }
}