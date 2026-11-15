import type { AiOutput, AiRunRequest } from '@relay/shared';
import type { MailClient } from '../../data/MailClient';

export const runAiToCompletion = (client: MailClient, request: AiRunRequest): Promise<AiOutput> =>
  new Promise((resolve, reject) => {
    const stop = client.runAi(request, (event) => {
      if (event.type === 'completed') {
        stop();
        resolve(event.output);
        return;
      }
      if (event.type === 'failed') {
        stop();
        reject(new Error(event.message));
      }
    });
  });

export const rewriteText = async (
  client: MailClient,
  text: string,
  instruction: string,
): Promise<string> => {
  const output = await runAiToCompletion(client, {
    input: { kind: 'rewrite', text, instruction, draftId: null },
  });
  return output.kind === 'rewrite' || output.kind === 'chatAnswer' ? output.text : text;
};

export const composeText = async (
  client: MailClient,
  instruction: string,
  recipient: string | null,
): Promise<string> => {
  const question = `Napíš krátky e-mail po slovensky${recipient === null ? '' : ` pre ${recipient}`}. Zadanie: ${instruction.trim() === '' ? 'stručná správa' : instruction}. Vráť iba text e-mailu.`;
  const output = await runAiToCompletion(client, {
    input: { kind: 'chatAnswer', question, threadId: null, history: [] },
  });
  return output.kind === 'chatAnswer' || output.kind === 'rewrite' ? output.text : '';
};
