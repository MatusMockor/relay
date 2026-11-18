const DONE: Readonly<Record<string, string>> = {
  'Hľadám v pošte…': 'Pošta prehľadaná',
  'Čítam vlákno…': 'Vlákno prečítané',
  'Prechádzam priečinok…': 'Priečinok prejdený',
  'Pozerám úlohy…': 'Úlohy skontrolované',
  'Pozerám kalendár…': 'Kalendár skontrolovaný',
  'Pozerám udalosť vo vlákne…': 'Udalosť vo vlákne skontrolovaná',
  'Vytváram úlohu…': 'Úloha vytvorená',
  'Pripravujem koncept…': 'Koncept pripravený',
};

const STARTED = /^Spúšťam (.+)$/;

export const doneStepLabel = (step: string): string => {
  const known = DONE[step];
  if (known !== undefined) {
    return known;
  }
  const started = STARTED.exec(step);
  if (started !== null) {
    return `Spustené cez ${started[1] ?? ''}`;
  }
  return step.replace(/…$/, '');
};
