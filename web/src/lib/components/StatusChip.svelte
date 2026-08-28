<script lang="ts">
	import { cn } from '$lib/utils';

	interface Props {
		status: string;
		class?: string;
	}

	const { status, class: className }: Props = $props();

	const normalized = $derived(status.trim().toLowerCase());

	// Add Transmission torrent UI display labels
	const labels: Record<string, string> = {
		active: 'ACTIVE',
		completed: 'COMPLETED',
		queued: 'QUEUED',
		downloading: 'DOWNLOADING',
		seeding: 'SEEDING',
		error: 'ERROR',
		paused: 'PAUSED',
		failed: 'FAILED',
		dismissed: 'DISMISSED',
		stopped: 'PAUSED',
		skipped_no_match: 'SKIPPED',
		skipped_duplicate: 'SKIPPED_DUPLICATE',
		rejected: 'FAILED',
		duplicate: 'MISSING',
		reconciled: 'COMPLETED',
		in_library: 'IN LIBRARY',
		missing: 'MISSING',
		unknown: 'UNKNOWN',
		unaired: 'UNAIRED'
	};

	// Add Transmission torrent UI display tones
	const toneClasses: Record<string, string> = {
		active: 'border-primary/35 bg-primary/18 text-primary',
		downloading: 'border-primary/35 bg-primary/18 text-primary',
		seeding: 'border-sky-400/25 bg-sky-500/15 text-sky-200',
		error: 'border-rose-400/25 bg-rose-500/18 text-rose-200',
		paused: 'border-slate-400/25 bg-slate-500/18 text-slate-200',
		completed: 'border-emerald-400/25 bg-emerald-500/15 text-emerald-200',
		queued: 'border-white/8 bg-white/6 text-slate-200',
		skipped_no_match: 'border-white/8 bg-slate-900/70 text-slate-300',
		skipped_duplicate: 'border-white/8 bg-slate-900/70 text-slate-300',
		failed: 'border-rose-400/25 bg-rose-500/18 text-rose-200',
		dismissed: 'border-white/8 bg-slate-900/70 text-slate-400',
		stopped: 'border-slate-400/25 bg-slate-500/18 text-slate-200',
		rejected: 'border-rose-400/25 bg-rose-500/18 text-rose-200',
		duplicate: 'border-amber-400/25 bg-amber-500/18 text-amber-200',
		reconciled: 'border-emerald-400/25 bg-emerald-500/15 text-emerald-200',
		in_library: 'border-primary/35 bg-primary/18 text-primary',
		missing: 'border-amber-400/25 bg-amber-500/18 text-amber-200',
		unknown: 'border-white/8 bg-white/6 text-slate-300',
		unaired: 'border-white/8 bg-white/6 text-slate-300'
	};

	const label = $derived(labels[normalized] ?? status.toUpperCase());
	const toneClass = $derived(toneClasses[normalized] ?? 'border-white/8 bg-white/6 text-slate-200');
</script>

<span
	class={cn(
		'inline-flex items-center rounded-full border px-2.5 py-1 font-mono text-[11px] font-semibold tracking-[0.18em] uppercase',
		toneClass,
		className
	)}
>
	{label}
</span>
