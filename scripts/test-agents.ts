import 'dotenv/config';
import { resolve } from 'path';
import { config } from 'dotenv';

// Load .env.local from root directory
config({ path: resolve(process.cwd(), '.env.local') });

import { AgentOrchestrator } from '../lib/orchestrator';
import { messageBus } from '../lib/message-bus';

async function testAgents() {
  console.log('\n🧪 TESTING MULTI-AGENT SYSTEM\n');

  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY not found in environment variables!');
    console.log('Make sure .env.local exists with: OPENAI_API_KEY=sk-...');
    process.exit(1);
  }

  const orchestrator = new AgentOrchestrator(messageBus);

  const testCases = [
    {
      name: 'Full Workflow: Research → Write → Edit',
      message: "Write a blog post about the benefits of multi-agent AI systems"
    },
    // Uncomment to test other scenarios:
    // {
    //   name: 'Research Only',
    //   message: "Research the latest trends in artificial intelligence"
    // },
  ];

  for (const testCase of testCases) {
    console.log(`\n${'█'.repeat(70)}`);
    console.log(`TEST: ${testCase.name}`);
    console.log(`${'█'.repeat(70)}\n`);

    try {
      const result = await orchestrator.processUserMessage(testCase.message);

      console.log('\n' + '█'.repeat(70));
      console.log('FINAL RESULT:');
      console.log('█'.repeat(70));
      console.log(result);
      console.log('█'.repeat(70) + '\n');

      // Get stats - using the actual return type from getStats()
      const stats = messageBus.getStats();
      
      console.log(`\n📊 STATS:`);
      console.log(`   Total messages: ${stats.totalMessages}`);
      console.log(`   User messages: ${stats.userMessages}`);
      console.log(`   Agent messages: ${stats.agentMessages}`);
      console.log(`   System messages: ${stats.systemMessages}`);
      console.log(`   Agents used: ${stats.uniqueAgents.join(' → ')}`);  // ← Fixed
      console.log(`   Handoffs: ${stats.handoffs}`);
      console.log(`   Messages with tool results: ${stats.messagesWithToolResults}`);
      console.log('\n');

      orchestrator.reset();
      
    } catch (error) {
      console.error('❌ Test failed:', error);
    }
  }
}

testAgents().catch(console.error);