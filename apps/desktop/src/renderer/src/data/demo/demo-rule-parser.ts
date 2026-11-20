import type { AutomationCondition, RuleProposal } from '@relay/shared';
import { parseActions } from './demo-rule-actions';
import { parseConditions } from './demo-rule-conditions';

const EXCEPT = /(?:^|[\s,])okrem\s/iu;

interface SentenceParts {
  readonly main: string;
  readonly except: string;
}

const splitExcept = (sentence: string): SentenceParts => {
  const match = EXCEPT.exec(sentence);
  if (match === null) {
    return { main: sentence, except: '' };
  }
  return {
    main: sentence.slice(0, match.index),
    except: sentence.slice(match.index + match[0].length),
  };
};

const nameOf = (conditions: readonly AutomationCondition[]): string =>
  conditions.some((condition) => condition.type === 'hasAttachment')
    ? 'Maily s prílohou'
    : 'Nové pravidlo';

const understoodOf = (
  when: readonly string[],
  except: readonly string[],
  actions: readonly string[],
): string => {
  if (when.length === 0 && actions.length === 0) {
    return 'Z vety som nerozpoznal podmienky ani akcie.';
  }
  const head = when.length === 0 ? 'Každý nový mail' : `Maily ${when.join(' a ')}`;
  const tail = except.length === 0 ? '' : `, okrem ${except.join(' a ')}`;
  const doing = actions.length === 0 ? 'bez akcie' : actions.join(', ');
  return `${head}${tail}: ${doing}.`;
};

export const parseRuleSentence = (sentence: string): RuleProposal => {
  const parts = splitExcept(sentence);
  const when = parseConditions(parts.main);
  const except = parseConditions(parts.except);
  const actions = parseActions(parts.main);
  return {
    name: nameOf(when.conditions),
    accountId: null,
    match: 'all',
    conditions: when.conditions,
    exceptions: except.conditions,
    actions: actions.actions,
    understood: understoodOf(when.phrases, except.phrases, actions.phrases),
    unmapped: [...when.unmapped, ...except.unmapped, ...actions.unmapped],
  };
};
