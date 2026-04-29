<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { NetworkPostureState } from '$lib/types';

	let dismissed = $state(false);
	let loading = $state<NetworkPostureState | null>(null);
	let errorMsg = $state<string | null>(null);

	async function acknowledge(state: NetworkPostureState) {
		loading = state;
		errorMsg = null;
		try {
			const res = await fetch('/api/auth/acknowledge-network-posture', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ state })
			});
			if (res.ok) {
				dismissed = true;
				await invalidateAll();
			} else {
				errorMsg = 'Could not save — try again.';
			}
		} catch {
			errorMsg = 'Could not save — try again.';
		} finally {
			loading = null;
		}
	}
</script>

{#if !dismissed}
	<div role="alert" class="border-border bg-card space-y-3 rounded-xl border p-4 text-sm shadow-sm">
		<p class="text-foreground">
			Transmission connects directly through your NAS network. Pirate Claw recommends a VPN bridge
			for most torrent use.
		</p>
		{#if errorMsg}
			<p class="text-destructive text-xs">{errorMsg}</p>
		{/if}
		<div class="flex flex-wrap gap-2">
			<button
				onclick={() => acknowledge('direct_acknowledged')}
				disabled={loading !== null}
				class="border-border text-foreground hover:bg-muted rounded-lg border px-3 py-1.5 text-xs disabled:opacity-50"
			>
				{loading === 'direct_acknowledged' ? 'Saving…' : 'Understood, using direct'}
			</button>
			<button
				onclick={() => acknowledge('already_secured_externally')}
				disabled={loading !== null}
				class="border-border text-foreground hover:bg-muted rounded-lg border px-3 py-1.5 text-xs disabled:opacity-50"
			>
				{loading === 'already_secured_externally' ? 'Saving…' : 'I have external routing'}
			</button>
			<button
				onclick={() => acknowledge('vpn_bridge_pending')}
				disabled={loading !== null}
				class="border-border text-foreground hover:bg-muted rounded-lg border px-3 py-1.5 text-xs disabled:opacity-50"
			>
				{loading === 'vpn_bridge_pending' ? 'Saving…' : "I'll set up a VPN bridge"}
			</button>
		</div>
	</div>
{/if}
