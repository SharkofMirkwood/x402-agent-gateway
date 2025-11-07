import { registry } from '../registry';
import { z } from 'zod';

describe('ToolRegistry', () => {
  beforeEach(() => {
    (registry as any).tools.clear();
  });

  describe('Tool Registration', () => {
    test('should register a tool successfully', () => {
      const tool = {
        name: 'test-tool',
        description: 'A test tool',
        inputSchema: z.object({ input: z.string() }),
        price: { asset: 'SOL', amount: '0.001' },
        handler: async (args: any) => ({ result: args.input })
      };

      registry.register(tool);
      const retrieved = registry.get('test-tool');
      
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('test-tool');
      expect(retrieved?.description).toBe('A test tool');
    });

    test('should register tool with output schema', () => {
      const tool = {
        name: 'typed-tool',
        description: 'A tool with output validation',
        inputSchema: z.object({ input: z.string() }),
        outputSchema: z.object({ result: z.string() }),
        price: { asset: 'SOL', amount: '0.001' },
        handler: async (args: any) => ({ result: args.input })
      };

      registry.register(tool);
      const retrieved = registry.get('typed-tool');
      
      expect(retrieved?.outputSchema).toBeDefined();
    });

    test('should register tool with dynamic pricing function', () => {
      const pricingFn = (args: any) => ({
        asset: 'SOL',
        amount: (args.complexity * 0.001).toString()
      });

      const tool = {
        name: 'dynamic-price-tool',
        description: 'Tool with dynamic pricing',
        inputSchema: z.object({ complexity: z.number() }),
        price: pricingFn,
        handler: async (args: any) => ({ result: 'done' })
      };

      registry.register(tool);
      const retrieved = registry.get('dynamic-price-tool');
      
      expect(retrieved?.price).toBe(pricingFn);
    });

    test('should throw error when registering duplicate tool', () => {
      const tool = {
        name: 'duplicate-tool',
        description: 'A test tool',
        inputSchema: z.object({ input: z.string() }),
        price: { asset: 'SOL', amount: '0.001' },
        handler: async (args: any) => ({ result: args.input })
      };

      registry.register(tool);
      
      expect(() => {
        registry.register(tool);
      }).toThrow('Tool duplicate-tool is already registered');
    });
  });

  describe('Tool Retrieval', () => {
    test('should get all registered tools', () => {
      const tool1 = {
        name: 'tool-1',
        description: 'Tool 1',
        inputSchema: z.object({ input: z.string() }),
        price: { asset: 'SOL', amount: '0.001' },
        handler: async (args: any) => ({ result: args.input })
      };

      const tool2 = {
        name: 'tool-2',
        description: 'Tool 2',
        inputSchema: z.object({ input: z.string() }),
        price: { asset: 'SOL', amount: '0.001' },
        handler: async (args: any) => ({ result: args.input })
      };

      registry.register(tool1);
      registry.register(tool2);

      const allTools = registry.getAll();
      expect(allTools).toHaveLength(2);
    });

    test('should return undefined for non-existent tool', () => {
      const retrieved = registry.get('non-existent-tool');
      expect(retrieved).toBeUndefined();
    });

    test('should return empty array when no tools registered', () => {
      const allTools = registry.getAll();
      expect(allTools).toEqual([]);
    });
  });

  describe('Tool Metadata', () => {
    test('should generate metadata for registered tools', async () => {
      const tool = {
        name: 'metadata-tool',
        description: 'Tool for testing metadata',
        inputSchema: z.object({ 
          text: z.string(),
          count: z.number().optional()
        }),
        price: { asset: 'SOL', amount: '0.002' },
        handler: async (args: any) => ({ result: 'success' })
      };

      registry.register(tool);
      const metadata = await registry.getMetadata();

      expect(metadata).toHaveLength(1);
      expect(metadata[0]).toEqual({
        name: 'metadata-tool',
        description: 'Tool for testing metadata',
        inputSchema: expect.any(Object),
        price: { asset: 'SOL', amount: '0.002' }
      });
    });

    test('should include output schema in metadata when present', async () => {
      const tool = {
        name: 'schema-tool',
        description: 'Tool with schemas',
        inputSchema: z.object({ input: z.string() }),
        outputSchema: z.object({ output: z.string() }),
        price: { asset: 'SOL', amount: '0.001' },
        handler: async (args: any) => ({ output: 'result' })
      };

      registry.register(tool);
      const metadata = await registry.getMetadata();

      expect(metadata[0].outputSchema).toBeDefined();
    });

    test('should generate metadata for multiple tools', async () => {
      const tools = [
        {
          name: 'tool-a',
          description: 'First tool',
          inputSchema: z.object({ a: z.string() }),
          price: { asset: 'SOL', amount: '0.001' },
          handler: async () => ({})
        },
        {
          name: 'tool-b',
          description: 'Second tool',
          inputSchema: z.object({ b: z.number() }),
          price: { asset: 'SOL', amount: '0.002' },
          handler: async () => ({})
        },
        {
          name: 'tool-c',
          description: 'Third tool',
          inputSchema: z.object({ c: z.boolean() }),
          price: { asset: 'SOL', amount: '0.003' },
          handler: async () => ({})
        }
      ];

      tools.forEach(tool => registry.register(tool));
      const metadata = await registry.getMetadata();

      expect(metadata).toHaveLength(3);
      expect(metadata.map(m => m.name)).toEqual(['tool-a', 'tool-b', 'tool-c']);
    });
  });

  describe('Complex Schemas', () => {
    test('should handle nested object schemas', () => {
      const tool = {
        name: 'nested-tool',
        description: 'Tool with nested schema',
        inputSchema: z.object({
          user: z.object({
            name: z.string(),
            age: z.number()
          }),
          preferences: z.object({
            theme: z.string(),
            notifications: z.boolean()
          })
        }),
        price: { asset: 'SOL', amount: '0.001' },
        handler: async (args: any) => ({ result: 'success' })
      };

      registry.register(tool);
      const retrieved = registry.get('nested-tool');
      
      expect(retrieved).toBeDefined();
    });

    test('should handle array schemas', () => {
      const tool = {
        name: 'array-tool',
        description: 'Tool with array inputs',
        inputSchema: z.object({
          items: z.array(z.string()),
          numbers: z.array(z.number()).optional()
        }),
        price: { asset: 'SOL', amount: '0.001' },
        handler: async (args: any) => ({ count: args.items.length })
      };

      registry.register(tool);
      const retrieved = registry.get('array-tool');
      
      expect(retrieved).toBeDefined();
    });

    test('should handle union and enum schemas', () => {
      const tool = {
        name: 'union-tool',
        description: 'Tool with union types',
        inputSchema: z.object({
          mode: z.enum(['fast', 'accurate', 'balanced']),
          value: z.union([z.string(), z.number()])
        }),
        price: { asset: 'SOL', amount: '0.001' },
        handler: async (args: any) => ({ result: args.mode })
      };

      registry.register(tool);
      const retrieved = registry.get('union-tool');
      
      expect(retrieved).toBeDefined();
    });
  });
});
