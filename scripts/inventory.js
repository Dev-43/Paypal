const fs = require('fs');
const tools = JSON.parse(fs.readFileSync('tools_dump.json', 'utf8'));

function classify(t) {
  const name = t.name;
  if ([
    'create_refund',
    'pay_order',
    'record_payment_for_invoice',
    'record_refund_for_invoice',
    'accept_dispute_claim',
    'create_order',
    'create_invoice',
    'create_recurring_series',
    'create_subscription'
  ].includes(name)) {
    return 'money_move';
  }
  if (
    name.startsWith('get_') ||
    name.startsWith('list_') ||
    name.startsWith('search_') ||
    name.startsWith('show_')
  ) {
    return 'read';
  }
  return 'config';
}

function getUntrusted(t, cls) {
  const name = t.name;
  if (name.includes('order')) return 'shipping.address, shipping.name, notes, items[].name';
  if (name.includes('dispute')) return 'messages[].content, buyer_response';
  if (name.includes('invoice') || name.includes('invoicing')) return 'note, primary_recipients[].billing_info, memo';
  if (name.includes('refund')) return 'note_to_payer, reason';
  if (name.includes('tracking') || name.includes('shipment')) return 'tracking_number, carrier';
  if (name.includes('subscription')) return 'subscriber.name, subscriber.shipping_address';
  if (name.includes('product')) return 'description, name';
  return 'none';
}

let md = '# Tool Inventory (@paypal/agent-toolkit@1.11.0)\n\n';
md += 'Inventory of all 47 tools exposed by `@paypal/agent-toolkit@1.11.0` in the current configuration.\n\n';
md += '| Tool | Arguments | Class | Suspected Untrusted Text Fields |\n';
md += '|---|---|---|---|\n';

for (const t of tools) {
  const cls = classify(t);
  const untrusted = getUntrusted(t, cls);
  const args = t.parameters.length > 0 ? t.parameters.map(p => '`' + p + '`').join(', ') : 'none';
  md += `| \`${t.name}\` | ${args} | ${cls} | ${untrusted} |\n`;
}

fs.writeFileSync('docs/TOOL_INVENTORY.md', md);
console.log('Generated docs/TOOL_INVENTORY.md successfully');
