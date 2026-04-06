import { describe, expect, it } from 'bun:test';

import type { DeliveryState, TicketState } from './orchestrator';
import {
  getCloseoutTicketChain,
  parseStackedCloseoutArgs,
} from './stacked-closeout';

function createTicket(overrides: Partial<TicketState>): TicketState {
  return {
    id: 'P1.01',
    title: 'Example Ticket',
    slug: 'example-ticket',
    ticketFile: 'docs/02-delivery/phase-01/ticket-01-example.md',
    status: 'done',
    branch: 'agents/p1-01-example-ticket',
    baseBranch: 'main',
    worktreePath: '/tmp/p1-01',
    prNumber: 12,
    prUrl: 'https://github.com/example/repo/pull/12',
    ...overrides,
  };
}

function createState(tickets: TicketState[]): DeliveryState {
  return {
    planKey: 'phase-01',
    planPath: 'docs/02-delivery/phase-01/implementation-plan.md',
    statePath: '.agents/delivery/phase-01/state.json',
    reviewsDirPath: '.agents/delivery/phase-01/reviews',
    handoffsDirPath: '.agents/delivery/phase-01/handoffs',
    reviewPollIntervalMinutes: 2,
    reviewPollMaxWaitMinutes: 8,
    tickets,
  };
}

describe('stacked closeout', () => {
  describe('parseStackedCloseoutArgs', () => {
    it('requires an explicit plan path', () => {
      expect(() => parseStackedCloseoutArgs([])).toThrow(
        'Usage: bun run stacked-closeout --plan <plan-path>',
      );
    });

    it('parses the requested plan path', () => {
      expect(
        parseStackedCloseoutArgs([
          '--plan',
          'docs/02-delivery/phase-07/implementation-plan.md',
        ]),
      ).toEqual({
        planPath: 'docs/02-delivery/phase-07/implementation-plan.md',
      });
    });
  });

  describe('getCloseoutTicketChain', () => {
    it('returns the full done ticket chain', () => {
      const state = createState([
        createTicket({ id: 'P1.01' }),
        createTicket({
          id: 'P1.02',
          branch: 'agents/p1-02-example-ticket',
          worktreePath: '/tmp/p1-02',
          prNumber: 13,
          prUrl: 'https://github.com/example/repo/pull/13',
        }),
      ]);

      expect(getCloseoutTicketChain(state).map((ticket) => ticket.id)).toEqual([
        'P1.01',
        'P1.02',
      ]);
    });

    it('rejects phases with incomplete tickets', () => {
      const state = createState([
        createTicket({ id: 'P1.01' }),
        createTicket({
          id: 'P1.02',
          status: 'reviewed',
          branch: 'agents/p1-02-example-ticket',
          worktreePath: '/tmp/p1-02',
          prNumber: 13,
          prUrl: 'https://github.com/example/repo/pull/13',
        }),
      ]);

      expect(() => getCloseoutTicketChain(state)).toThrow(
        'stacked-closeout requires the full phase to be done first. Incomplete tickets: P1.02=reviewed',
      );
    });
  });
});
