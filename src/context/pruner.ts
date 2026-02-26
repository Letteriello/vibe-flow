// Context Pruner - Remove stale tool results from chat history

/**
 * Prunes stale tool_result messages from chat history.
 * Keeps only the most recent 10 iterations of tool results to reduce context size.
 *
 * @param history - Array of chat messages
 * @returns New array with stale tool_results replaced by "[Tool output pruned]"
 */
export function pruneStaleTools(history: any[]): any[] {
  if (!Array.isArray(history) || history.length === 0) {
    return history;
  }

  const result: any[] = [];
  let iterationCount = 0;
  const maxRecentIterations = 10;

  // Process history in reverse to track iterations from the end
  for (let i = history.length - 1; i >= 0; i--) {
    const message = history[i];

    // Track iteration boundaries (every tool call starts a new iteration)
    if (message.role === 'tool') {
      iterationCount++;
    }

    // For tool_result messages, check if they're within recent iterations
    if (message.role === 'tool_result') {
      // Calculate which iteration this tool_result belongs to
      let toolResultIteration = 0;
      for (let j = i; j < history.length; j++) {
        if (history[j].role === 'tool') {
          toolResultIteration++;
        }
      }

      // If older than maxRecentIterations, replace with pruned message
      if (toolResultIteration > maxRecentIterations) {
        result.unshift({
          role: 'tool_result',
          content: '[Tool output pruned]'
        });
        continue;
      }
    }

    result.unshift(message);
  }

  return result;
}

export default pruneStaleTools;
