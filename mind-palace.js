#!/usr/bin/env node

const { mindPalace } = require('./dist/index.js');
const { CLICommandHandler } = require('./dist/commands/cli.js');

async function main() {
  const args = process.argv.slice(2);
  const commandStr = '!mindpalace ' + args.join(' ');
  
  try {
    await mindPalace.initialize();
    const output = await CLICommandHandler.execute(commandStr);
    console.log(output);
  } catch (error) {
    console.error('Error executing mind-palace command:', error.message);
    process.exit(1);
  } finally {
    mindPalace.close();
  }
}

main();