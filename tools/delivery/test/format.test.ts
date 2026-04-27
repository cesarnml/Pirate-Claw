import { describe, expect, it } from 'bun:test';

import {
  formatAdvanceBoundaryGuidance,
  formatCurrentTicketStatus,
  resolveEffectiveAdvanceBoundaryMode,
} from '../format';
import type { ResolvedOrchestratorConfig } from '../runtime-config';
import type { DeliveryState } from '../types';

const baseConfig: ResolvedOrchestratorConfig = {
  defaultBranch: 'main',
  planRoot: 'docs',
  runtime: 'bun',
  packageManager: 'bun',
  ticketBoundaryMode: 'cook',
  reviewPolicy: {
    selfAudit: 'skip_doc_only',
    codexPreflight: 'skip_doc_only',
    externalReview: 'skip_doc_only',
  },
};

describe('formatAdvanceBoundaryGuidance (EE7 boundary output)', () => {
  const baseState: DeliveryState = {
    planKey: 'engineering-epic-07',
    planPath: 'docs/02-delivery/engineering-epic-07/implementation-plan.md',
    statePath: '.agents/delivery/engineering-epic-07/state.json',
    reviewsDirPath: '.agents/delivery/engineering-epic-07/reviews',
    handoffsDirPath: '.agents/delivery/engineering-epic-07/handoffs',
    reviewPollIntervalMinutes: 6,
    reviewPollMaxWaitMinutes: 12,
    tickets: [
      {
        id: 'EE7.01',
        title: 'Boundary policy plumbing and visibility',
        slug: 'boundary-policy-plumbing-and-visibility',
        ticketFile:
          'docs/02-delivery/engineering-epic-07/ticket-01-boundary-policy-plumbing-and-visibility.md',
        status: 'reviewed',
        branch: 'agents/ee7-01-boundary-policy-plumbing-and-visibility',
        baseBranch: 'main',
        worktreePath: '/tmp/ee7_01',
        reviewOutcome: 'patched',
      },
      {
        id: 'EE7.02',
        title: 'Gated boundary semantics and resume prompt',
        slug: 'gated-boundary-semantics-and-resume-prompt',
        ticketFile:
          'docs/02-delivery/engineering-epic-07/ticket-02-gated-boundary-semantics-and-resume-prompt.md',
        status: 'pending',
        branch: 'agents/ee7-02-gated-boundary-semantics-and-resume-prompt',
        baseBranch: 'agents/ee7-01-boundary-policy-plumbing-and-visibility',
        worktreePath: '/tmp/ee7_02',
      },
    ],
  };

  const advancedState: DeliveryState = {
    ...baseState,
    tickets: baseState.tickets.map((ticket) =>
      ticket.id === 'EE7.01' ? { ...ticket, status: 'done' as const } : ticket,
    ),
  };

  it('emits gated reset guidance and the canonical resume prompt', () => {
    const config: ResolvedOrchestratorConfig = {
      ...baseConfig,
      ticketBoundaryMode: 'gated',
    };

    const output = formatAdvanceBoundaryGuidance(
      baseState,
      advancedState,
      advancedState,
      config,
    );

    expect(output).toContain('context_reset_required=true');
    expect(output).toContain('GATED BOUNDARY before starting EE7.02.');
    expect(output).toContain('Prefer /clear for minimum token use');
    expect(output).toContain(
      'resume_prompt=Immediately execute `bun run deliver --plan docs/02-delivery/engineering-epic-07/implementation-plan.md start`, read the locally materialized handoff artifact in the started worktree as the source of truth for context, and implement EE7.02.',
    );
  });

  it('emits cook continuation guidance with the next worktree and absolute handoff path', () => {
    const config: ResolvedOrchestratorConfig = {
      ...baseConfig,
      ticketBoundaryMode: 'cook',
    };

    const nextState: DeliveryState = {
      ...advancedState,
      tickets: advancedState.tickets.map((ticket) =>
        ticket.id === 'EE7.02'
          ? {
              ...ticket,
              status: 'in_progress' as const,
              handoffPath:
                '.agents/delivery/engineering-epic-07/handoffs/ee7-02-handoff.md',
            }
          : ticket,
      ),
    };

    const output = formatAdvanceBoundaryGuidance(
      baseState,
      advancedState,
      nextState,
      config,
    );

    expect(output).toContain('continuation_mode=cook');
    expect(output).toContain('COOK CONTINUATION started EE7.02.');
    expect(output).toContain('next_worktree=/tmp/ee7_02');
    expect(output).toContain(
      'next_handoff=.agents/delivery/engineering-epic-07/handoffs/ee7-02-handoff.md',
    );
    expect(output).toContain(
      'next_handoff_absolute=/tmp/ee7_02/.agents/delivery/engineering-epic-07/handoffs/ee7-02-handoff.md',
    );
  });

  it('emits explicit glide fallback guidance', () => {
    const config: ResolvedOrchestratorConfig = {
      ...baseConfig,
      ticketBoundaryMode: 'glide',
    };

    const output = formatAdvanceBoundaryGuidance(
      baseState,
      advancedState,
      advancedState,
      config,
    );

    expect(output).toContain('context_reset_required=true');
    expect(output).toContain('glide_fallback=gated');
    expect(output).toContain('GLIDE FALLBACK before starting EE7.02.');
    expect(output).toContain(
      'Host/runtime self-reset is not supported here, so Son-of-Anton is using gated boundary behavior instead.',
    );
  });
});

describe('formatCurrentTicketStatus (EE6: findings block)', () => {
  const baseState: DeliveryState = {
    planKey: 'phase-15',
    planPath: 'docs/02-delivery/phase-15/implementation-plan.md',
    statePath: '.agents/delivery/phase-15/state.json',
    reviewsDirPath: '.agents/delivery/phase-15/reviews',
    handoffsDirPath: '.agents/delivery/phase-15/handoffs',
    reviewPollIntervalMinutes: 6,
    reviewPollMaxWaitMinutes: 12,
    tickets: [
      {
        id: 'P15.06',
        title: 'Unmatched Candidates View',
        slug: 'unmatched-candidates-view',
        ticketFile:
          'docs/02-delivery/phase-15/ticket-06-unmatched-candidates-view.md',
        branch: 'agents/p15-06-unmatched-candidates-view',
        baseBranch: 'agents/p15-05-movies-view',
        worktreePath: '/tmp/p15_06',
        status: 'in_review',
        prUrl: 'https://github.com/example/repo/pull/130',
        reviewActionSummary: 'Flagged 2 finding comment(s) for follow-up.',
        reviewComments: [
          {
            authorLogin: 'coderabbitai[bot]',
            authorType: 'Bot',
            vendor: 'coderabbit',
            kind: 'finding',
            channel: 'inline_review',
            body: '⚠️ Potential issue | 🟡 Minor\n\n**Add an explicit label for the search field.**\n\nThe search control currently relies on placeholder text.',
            path: 'web/src/routes/candidates/unmatched/+page.svelte',
            line: 58,
            isOutdated: false,
            isResolved: false,
          },
          {
            authorLogin: 'coderabbitai[bot]',
            authorType: 'Bot',
            vendor: 'coderabbit',
            kind: 'finding',
            channel: 'inline_review',
            body: '**Tighten the "no match" assertion to verify zero data rows.**\n\nCurrent checks can pass even if rows still render.',
            path: 'web/test/routes/candidates/unmatched/unmatched.test.ts',
            line: 63,
            isOutdated: false,
            isResolved: false,
          },
        ],
      },
    ],
  };

  it('emits a findings block for actionable finding comments', () => {
    const output = formatCurrentTicketStatus(baseState, baseConfig, 'P15.06');

    expect(output).toContain('findings (2):');
    expect(output).toContain(
      '[coderabbit] web/src/routes/candidates/unmatched/+page.svelte:58 — Add an explicit label for the search field.',
    );
    expect(output).toContain(
      '[coderabbit] web/test/routes/candidates/unmatched/unmatched.test.ts:63 — Tighten the "no match" assertion to verify zero data rows.',
    );
  });

  it('suppresses findings marked outdated or resolved', () => {
    const stateWithStale: DeliveryState = {
      ...baseState,
      tickets: baseState.tickets.map((t) => ({
        ...t,
        reviewComments: (t.reviewComments ?? []).map((c, i) =>
          i === 0 ? { ...c, isOutdated: true } : { ...c, isResolved: true },
        ),
      })),
    };

    const output = formatCurrentTicketStatus(
      stateWithStale,
      baseConfig,
      'P15.06',
    );

    expect(output).not.toContain('findings (');
    expect(output).not.toContain('[coderabbit]');
  });

  it('omits the findings block when reviewComments is empty', () => {
    const stateNoComments: DeliveryState = {
      ...baseState,
      tickets: baseState.tickets.map((t) => ({ ...t, reviewComments: [] })),
    };

    const output = formatCurrentTicketStatus(
      stateNoComments,
      baseConfig,
      'P15.06',
    );

    expect(output).not.toContain('findings (');
  });

  it('falls back to truncated body when no bold title is present', () => {
    const stateNoBold: DeliveryState = {
      ...baseState,
      tickets: baseState.tickets.map((t) => ({
        ...t,
        reviewComments: [
          {
            authorLogin: 'sonarqubecloud',
            authorType: 'Bot',
            vendor: 'sonarqube',
            kind: 'finding' as const,
            channel: 'issue_comment' as const,
            body: 'This function has cognitive complexity of 19 which is higher than the allowed 15.',
            path: 'tools/delivery/orchestrator.ts',
            line: 100,
            isOutdated: false,
            isResolved: false,
          },
        ],
      })),
    };

    const output = formatCurrentTicketStatus(stateNoBold, baseConfig, 'P15.06');

    expect(output).toContain('findings (1):');
    expect(output).toContain(
      '[sonarqube] tools/delivery/orchestrator.ts:100 — This function has cognitive complexity',
    );
  });

  it('includes kind:unknown comments (e.g. SonarQube annotations) as actionable', () => {
    const stateUnknown: DeliveryState = {
      ...baseState,
      tickets: baseState.tickets.map((t) => ({
        ...t,
        reviewComments: [
          {
            authorLogin: 'sonarqubecloud',
            authorType: 'Bot',
            vendor: 'sonarqube',
            kind: 'unknown' as const,
            channel: 'issue_comment' as const,
            body: '**Cognitive complexity too high.**\n\nThis function has cognitive complexity of 19.',
            path: 'tools/delivery/orchestrator.ts',
            line: 100,
            isOutdated: false,
            isResolved: false,
          },
        ],
      })),
    };

    const output = formatCurrentTicketStatus(
      stateUnknown,
      baseConfig,
      'P15.06',
    );

    expect(output).toContain('findings (1):');
    expect(output).toContain(
      '[sonarqube] tools/delivery/orchestrator.ts:100 — Cognitive complexity too high.',
    );
  });

  it('renders findings block when ticket status is needs_patch', () => {
    const stateNeedsPatch: DeliveryState = {
      ...baseState,
      tickets: baseState.tickets.map((t) => ({
        ...t,
        status: 'needs_patch' as const,
      })),
    };

    // no ticketId — selector must find needs_patch ticket
    const output = formatCurrentTicketStatus(stateNeedsPatch, baseConfig);

    expect(output).toContain('findings (2):');
    expect(output).toContain('[coderabbit]');
  });
});

it('resolves glide to gated as the effective advance boundary mode', () => {
  expect(resolveEffectiveAdvanceBoundaryMode('cook')).toBe('cook');
  expect(resolveEffectiveAdvanceBoundaryMode('gated')).toBe('gated');
  expect(resolveEffectiveAdvanceBoundaryMode('glide')).toBe('gated');
});
