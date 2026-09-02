<script lang="ts">
	// Small consistency legend reused across every Config card that saves
	// something: makes "does this need a daemon restart, or is it live the
	// moment I click save" visible at a glance instead of something the
	// user has to infer per-card from prose (see the 2026-09-02 config-page
	// design pass — this replaces the previous per-card "applies
	// immediately"/"apply after restart" copy scattered inconsistently).
	//
	// This is a static category label — "this section's changes need a
	// restart to take effect" — not a live "you have a restart pending
	// right now" indicator (that's runtimeChangesPending/restartPhase,
	// shown separately near the Restart Daemon button). Deliberately
	// styled calmer than that live state: an always-on amber "RESTART
	// REQUIRED" pill reads as an alarm even with nothing pending, which
	// is exactly the confusion this caused on 2026-09-02.
	interface Props {
		mode: 'restart' | 'immediate';
	}

	const { mode }: Props = $props();
</script>

<span
	class={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.14em] uppercase ${
		mode === 'restart'
			? 'border-border text-muted-foreground'
			: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-400'
	}`}
>
	{#if mode === 'immediate'}
		<span class="size-1.5 rounded-full bg-emerald-400"></span>
	{/if}
	{mode === 'restart' ? 'Changes require restart' : 'Applies immediately'}
</span>
