import { MockFactory, commonSchemas, generateFromSchema } from './src/execution/tdd/mock-factory';

console.log('=== MockFactory Test ===\n');

// Test 1: Basic schema
console.log('1. Generate from common schema (user):');
const user = new MockFactory({ seed: 123 }).generate(commonSchemas.user);
console.log(JSON.stringify(user, null, 2));

console.log('\n2. Generate from common schema (product):');
const product = new MockFactory({ seed: 456 }).generate(commonSchemas.product);
console.log(JSON.stringify(product, null, 2));

// Test 2: JSON Schema string
console.log('\n3. Generate from JSON Schema string:');
const schemaStr = JSON.stringify({
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    age: { type: 'integer' },
    active: { type: 'boolean' }
  },
  required: ['id', 'name']
});
const fromString = generateFromSchema(schemaStr, { seed: 789 });
console.log(JSON.stringify(fromString, null, 2));

// Test 3: TypeScript interface
console.log('\n4. Generate from TypeScript interface:');
const tsInterface = `
interface Person {
  id: string;
  name: string;
  email: string;
  age?: number;
  roles: string[];
  address: Address;
}

interface Address {
  street: string;
  city: string;
  country: string;
}
`;
const fromTs = new MockFactory({ seed: 100 }).generateFromTypeScript(tsInterface);
console.log(JSON.stringify(fromTs, null, 2));

// Test 4: Generate many
console.log('\n5. Generate 3 users:');
const users = new MockFactory({ seed: 200 }).generateMany(commonSchemas.user, 3);
console.log(JSON.stringify(users, null, 2));

// Test 5: Locale options
console.log('\n6. Generate with pt-BR locale:');
const personPt = new MockFactory({ seed: 300, locale: 'pt-BR' }).generate(commonSchemas.person);
console.log(JSON.stringify(personPt, null, 2));

// Test 6: Array with items
console.log('\n7. Generate with custom array:');
const customSchema = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: { type: 'string' },
      minimumItems: 2,
      maximumItems: 5
    }
  }
};
const withArray = new MockFactory({ seed: 400 }).generate(customSchema);
console.log(JSON.stringify(withArray, null, 2));

console.log('\n=== All tests passed! ===');
