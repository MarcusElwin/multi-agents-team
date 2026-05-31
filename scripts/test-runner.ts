import 'dotenv/config';
import { resolve } from 'path';
import { config } from 'dotenv';

// Load .env.local from root directory
config({ path: resolve(process.cwd(), '.env.local') });

import { agentRunner, runAgentsWithCoordination } from '../lib/runner';

async function testRunner() {
  console.log('\n🧪 TESTING AGENT RUNNER - COORDINATED EXECUTION\n');

  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY not found in environment variables!');
    console.log('Make sure .env.local exists with: OPENAI_API_KEY=sk-...');
    process.exit(1);
  }

  const testCases = [
    {
      name: 'Product Feature Development with Coordination',
      message: `Create a new feature for a task management application that allows users to:
      1. Create tasks with priority levels (high, medium, low)
      2. Assign tasks to team members
      3. Track task progress with status updates
      4. Send notifications when tasks are completed

      Please coordinate with the other agents (backend, frontend, design) to create a complete solution.
      Use the coordinationTool to send messages to other agents about what you need from them.`
    },
    // Uncomment to test other scenarios:
    // {
    //   name: 'Dashboard Feature',
    //   message: "Design and implement a beautiful analytics dashboard with real-time data visualization"
    // },
  ];

  for (const testCase of testCases) {
    console.log(`\n${'█'.repeat(80)}`);
    console.log(`TEST: ${testCase.name}`);
    console.log(`${'█'.repeat(80)}\n`);

    try {
      // Run agents with coordination (random starting agent)
      const summary = await runAgentsWithCoordination(testCase.message);

      console.log('\n' + '█'.repeat(80));
      console.log('TEST RESULTS:');
      console.log('█'.repeat(80));

      console.log(`\n🎲 Starting Agent: ${summary.startingAgent}`);
      console.log(`⏱️  Total Duration: ${summary.totalDuration}ms`);
      console.log(`🔄 Total Iterations: ${summary.iterations}`);
      console.log(`🤖 Agent Executions: ${summary.agentResults.length}`);
      console.log(`📧 Coordination Messages: ${summary.coordinationMessages.length}`);

      // Show coordination timeline
      if (summary.coordinationMessages.length > 0) {
        console.log('\n📡 Coordination Timeline:');
        summary.coordinationMessages.forEach((msg, index) => {
          const time = msg.metadata.timestamp.toISOString().split('T')[1].slice(0, 12);
          console.log(`\n${index + 1}. [${time}] ${msg.from} → ${msg.to}`);
          console.log(`   ${msg.content.slice(0, 150)}...`);
        });
      }

      // Show message bus statistics
      console.log('\n' + '─'.repeat(80));
      console.log('MESSAGE BUS STATISTICS:');
      console.log('─'.repeat(80));

      const stats = summary.messageBusStats;
      console.log(`📊 Total Messages: ${stats.totalMessages}`);
      console.log(`👤 User Messages: ${stats.userMessages}`);
      console.log(`🤖 Agent Messages: ${stats.agentMessages}`);
      console.log(`⚙️  System Messages: ${stats.systemMessages}`);
      console.log(`🏷️  Unique Agents: ${stats.uniqueAgents.join(', ')}`);
      console.log(`🔄 Handoffs: ${stats.handoffs}`);

      // Show completion status
      console.log('\n' + '─'.repeat(80));
      console.log('COMPLETION STATUS:');
      console.log('─'.repeat(80));

      const completedAgents = summary.agentResults.filter(r => r.completed).length;
      console.log(`✅ Completed: ${completedAgents}/${summary.agentResults.length}`);

      summary.agentResults.forEach(({ agent, completed }) => {
        console.log(`  ${completed ? '✅' : '❌'} ${agent}: ${completed ? 'COMPLETED' : 'NOT COMPLETED'}`);
      });

      // Show agent outputs
      console.log('\n' + '─'.repeat(80));
      console.log('AGENT OUTPUTS:');
      console.log('─'.repeat(80));

      summary.agentResults.forEach(({ agent, output, duration, completed }) => {
        console.log(`\n${agent} (${duration}ms) ${completed ? '✅' : '⏳'}:`);
        console.log('─'.repeat(40));
        console.log(output.slice(0, 500) + (output.length > 500 ? '...' : ''));
      });

      console.log('\n' + '█'.repeat(80) + '\n');

      // Reset for next test
      agentRunner.reset();

    } catch (error) {
      console.error('❌ Test failed:', error);
    }
  }

  console.log('\n✅ All tests completed!\n');
}

testRunner().catch(console.error);
