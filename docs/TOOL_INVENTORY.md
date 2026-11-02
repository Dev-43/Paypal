# Tool Inventory (@paypal/agent-toolkit@1.11.0)

Inventory of all 47 tools exposed by `@paypal/agent-toolkit@1.11.0` in the current configuration.

| Tool | Arguments | Class | Suspected Untrusted Text Fields |
|---|---|---|---|
| `create_invoice` | `currency_code`, `invoice_number`, `invoice_date`, `reference`, `note`, `invoicer_business_name`, `invoicer_given_name`, `invoicer_surname`, `invoicer_email_address`, `invoicer_tax_id`, `invoicer_address_line_1`, `invoicer_address_line_2`, `invoicer_city`, `invoicer_state`, `invoicer_postal_code`, `invoicer_country_code`, `primary_recipients`, `items`, `allow_tip`, `theme_color`, `shipping_cost`, `enable_pay_by_bank`, `pay_by_bank_exclusive_above_threshold`, `allow_partial_payment`, `minimum_partial_payment_amount` | money_move | note, primary_recipients[].billing_info, memo |
| `create_recurring_series` | `interval_unit`, `interval_count`, `start_series_date`, `total_cycles`, `reference`, `currency_code`, `note`, `invoicer_business_name`, `invoicer_given_name`, `invoicer_surname`, `invoicer_email_address`, `invoicer_tax_id`, `invoicer_address_line_1`, `invoicer_address_line_2`, `invoicer_city`, `invoicer_state`, `invoicer_postal_code`, `invoicer_country_code`, `primary_recipients`, `items`, `allow_tip`, `shipping_cost`, `allow_partial_payment`, `minimum_partial_payment_amount` | money_move | none |
| `activate_recurring_series` | `recurring_series_id` | config | none |
| `get_recurring_series` | `recurring_series_id` | read | none |
| `cancel_recurring_series` | `recurring_series_id` | config | none |
| `delete_recurring_series` | `recurring_series_id` | config | none |
| `list_invoices` | `page`, `page_size`, `total_required` | read | note, primary_recipients[].billing_info, memo |
| `get_invoice` | `invoice_id` | read | note, primary_recipients[].billing_info, memo |
| `send_invoice` | `invoice_id`, `note`, `send_to_recipient`, `additional_recipients` | config | note, primary_recipients[].billing_info, memo |
| `send_invoice_reminder` | `invoice_id`, `subject`, `note`, `additional_recipients` | config | note, primary_recipients[].billing_info, memo |
| `cancel_sent_invoice` | `invoice_id`, `note`, `send_to_recipient`, `additional_recipients` | config | note, primary_recipients[].billing_info, memo |
| `delete_invoice` | `invoice_id` | config | note, primary_recipients[].billing_info, memo |
| `setup_invoice_auto_reminders` | `configurations` | config | note, primary_recipients[].billing_info, memo |
| `update_invoice_auto_reminder` | `reminder_configuration_id`, `type`, `status`, `interval`, `repetition`, `notification` | config | note, primary_recipients[].billing_info, memo |
| `search_invoicing` | `resource_type`, `page`, `page_size`, `total_required`, `invoice_filters`, `recurring_series_filters` | read | note, primary_recipients[].billing_info, memo |
| `update_invoicing` | `resource_type`, `invoice_update`, `recurring_series_update` | config | note, primary_recipients[].billing_info, memo |
| `cancel_invoice_auto_reminder` | `invoice_id` | config | note, primary_recipients[].billing_info, memo |
| `generate_invoice_qr_code` | `invoice_id`, `width`, `height` | config | note, primary_recipients[].billing_info, memo |
| `generate_invoice_number` | none | config | note, primary_recipients[].billing_info, memo |
| `record_payment_for_invoice` | `invoice_id`, `payment_id`, `payment_date`, `payment_date_time`, `method`, `note`, `amount`, `shipping_info` | money_move | note, primary_recipients[].billing_info, memo |
| `record_refund_for_invoice` | `invoice_id`, `refund_date`, `amount`, `method` | money_move | note, primary_recipients[].billing_info, memo |
| `create_conditional_rules_for_invoice` | `invoice_id`, `rules` | config | note, primary_recipients[].billing_info, memo |
| `create_product` | `name`, `type`, `description`, `category`, `image_url`, `home_url` | config | description, name |
| `list_products` | `page`, `page_size`, `total_required` | read | description, name |
| `update_product` | `product_id`, `operations` | config | description, name |
| `show_product_details` | `product_id` | read | description, name |
| `create_subscription_plan` | `product_id`, `name`, `description`, `billing_cycles`, `payment_preferences`, `taxes` | config | subscriber.name, subscriber.shipping_address |
| `list_subscription_plans` | `product_id`, `page`, `page_size`, `total_required` | read | subscriber.name, subscriber.shipping_address |
| `show_subscription_plan_details` | `plan_id` | read | subscriber.name, subscriber.shipping_address |
| `create_subscription` | `plan_id`, `quantity`, `shipping_amount`, `subscriber`, `application_context` | money_move | subscriber.name, subscriber.shipping_address |
| `show_subscription_details` | `subscription_id`, `get_additional_details` | read | subscriber.name, subscriber.shipping_address |
| `cancel_subscription` | `subscription_id`, `payload` | config | subscriber.name, subscriber.shipping_address |
| `update_subscription` | `subscription_id`, `currency_code`, `outstanding_balance`, `custom_id`, `fixed_price`, `payment_failure_threshold`, `auto_bill_outstanding`, `taxes_inclusive`, `taxes_percentage`, `shipping_amount`, `shipping_address` | config | subscriber.name, subscriber.shipping_address |
| `create_shipment_tracking` | `order_id`, `tracking_number`, `transaction_id`, `status`, `carrier` | config | tracking_number, carrier |
| `get_shipment_tracking` | `order_id`, `transaction_id` | read | tracking_number, carrier |
| `update_shipment_tracking` | `transaction_id`, `tracking_number`, `new_tracking_number`, `status`, `carrier` | config | tracking_number, carrier |
| `create_order` | `currencyCode`, `items`, `discount`, `shippingCost`, `shippingAddress`, `notes`, `returnUrl`, `cancelUrl` | money_move | shipping.address, shipping.name, notes, items[].name |
| `get_order` | `id` | read | shipping.address, shipping.name, notes, items[].name |
| `pay_order` | `id` | money_move | shipping.address, shipping.name, notes, items[].name |
| `list_disputes` | `disputed_transaction_id`, `dispute_state`, `page_size`, `page` | read | messages[].content, buyer_response |
| `get_dispute` | `dispute_id` | read | messages[].content, buyer_response |
| `accept_dispute_claim` | `dispute_id`, `note` | money_move | messages[].content, buyer_response |
| `list_transactions` | `transaction_id`, `transaction_status`, `start_date`, `end_date`, `search_months`, `page_size`, `page` | read | none |
| `update_plan` | `plan_id`, `description`, `auto_bill_outstanding`, `percentage`, `payment_failure_threshold`, `setup_fee`, `setup_fee_failure_action`, `name`, `operations` | config | none |
| `create_refund` | `capture_id`, `amount`, `invoice_id`, `note_to_payer` | money_move | note_to_payer, reason |
| `get_refund` | `refund_id` | read | note_to_payer, reason |
| `get_merchant_insights` | `start_date`, `end_date`, `insight_type`, `time_interval` | read | none |
