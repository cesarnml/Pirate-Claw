<script lang="ts">
	// Small consistency legend reused across every Config card that saves
	// something: makes "does this need a daemon restart, or is it live the
	// moment I click save" visible at a glance instead of something the
	// user has to infer per-card from prose (see the 2026-09-02 config-page
	// design pass — this replaces the previous per-card "applies
	// immediately"/"apply after restart" copy scattered inconsistently).
	interface Props {
		mode: 'restart' | 'immediate';
	}

	const { mode }: Props = $props();
</script>

<span
	class={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.14em] uppercase ${
		mode === 'restart'
			? 'border-amber-400/30 bg-amber-400/10 text-amber-400'
			: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-400'
	}`}
>
	<span class={`size-1.5 rounded-full ${mode === 'restart' ? 'bg-amber-400' : 'bg-emerald-400'}`}
	></span>
	{mode === 'restart' ? 'Restart required' : 'Applies immediately'}
</span>
