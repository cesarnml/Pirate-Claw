<script lang="ts">
	import { invalidateAll } from '$app/navigation';

	interface Props {
		origin: string;
	}

	let { origin }: Props = $props();
	let dismissed = $state(false);
	let loading = $state(false);
	let errorMsg = $state<string | null>(null);

	async function trustOrigin() {
		loading = true;
		errorMsg = null;
		try {
			const res = await fetch('/api/auth/trust-origin', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ origin })
			});
			if (res.ok) {
				dismissed = true;
				await invalidateAll();
			} else {
				errorMsg = 'Could not add trusted origin — try again.';
			}
		} catch {
			errorMsg = 'Could not add trusted origin — try again.';
		} finally {
			loading = false;
		}
	}
</script>

{#if !dismissed}
	<div
		role="alert"
		class="bg-warning/10 border-warning/30 text-warning-foreground flex items-center gap-3 rounded-xl border px-4 py-3 text-sm"
	>
		<span class="min-w-0 flex-1">
			You're accessing Pirate Claw from an untrusted origin (<code class="font-mono">{origin}</code
			>).
			{#if errorMsg}
				<span class="text-destructive ml-1">{errorMsg}</span>
			{/if}
		</span>
		<button
			onclick={trustOrigin}
			disabled={loading}
			class="bg-warning text-warning-foreground hover:bg-warning/90 shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
		>
			{loading ? 'Trusting…' : 'Trust this origin'}
		</button>
	</div>
{/if}
