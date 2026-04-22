<script lang="ts">
	import type { PlexAuthStatusResponse } from '$lib/types';

	type Props = {
		status: PlexAuthStatusResponse;
		canWrite: boolean;
		returnTo: string;
		currentEtag?: string | null;
		message?: string | null;
		messageTone?: 'neutral' | 'success' | 'error';
		mode?: 'config' | 'onboarding';
		saveAction?: string;
		disconnectAction?: string;
		skipHref?: string | null;
	};

	const {
		status,
		canWrite,
		returnTo,
		currentEtag = null,
		message = null,
		messageTone = 'neutral',
		mode = 'config',
		saveAction = '?/savePlex',
		disconnectAction = '?/disconnectPlex',
		skipHref = null
	}: Props = $props();

	const stateCopy = {
		not_connected: {
			label: 'Not connected',
			description: 'Pirate Claw is not signed into Plex yet.'
		},
		connecting: {
			label: 'Connecting in browser',
			description: 'A Plex hosted sign-in is in progress for this server.'
		},
		connected: {
			label: 'Connected',
			description: 'Pirate Claw can call Plex using the current server-side credential.'
		},
		reconnect_required: {
			label: 'Reconnect required',
			description: 'The saved Plex credential needs to be replaced from the browser flow.'
		},
		renewing: {
			label: 'Renewing',
			description: 'Pirate Claw is attempting a silent Plex credential renewal.'
		},
		expired_reconnect_required: {
			label: 'Expired, reconnect required',
			description: 'The saved Plex credential expired and silent renewal did not recover it.'
		},
		error_reconnect_required: {
			label: 'Renewal error, reconnect required',
			description: 'Silent renewal failed before Plex could confirm the current credential.'
		}
	} satisfies Record<PlexAuthStatusResponse['state'], { label: string; description: string }>;

	const connectHref = $derived(`/plex/connect?returnTo=${encodeURIComponent(returnTo)}`);
	const connectLabel = $derived.by(() => {
		if (status.state === 'connected' || status.state === 'reconnect_required') {
			return 'Reconnect in browser';
		}
		if (
			status.state === 'expired_reconnect_required' ||
			status.state === 'error_reconnect_required'
		) {
			return 'Reconnect in browser';
		}
		if (status.state === 'connecting') {
			return 'Restart browser sign-in';
		}
		if (status.state === 'renewing') {
			return 'Connect in browser';
		}
		return 'Connect in browser';
	});
	const stateClass = $derived.by(() => {
		switch (status.state) {
			case 'connected':
				return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100';
			case 'reconnect_required':
				return 'border-amber-500/40 bg-amber-500/10 text-amber-100';
			case 'expired_reconnect_required':
			case 'error_reconnect_required':
				return 'border-amber-500/40 bg-amber-500/10 text-amber-100';
			case 'connecting':
				return 'border-sky-500/40 bg-sky-500/10 text-sky-100';
			case 'renewing':
				return 'border-cyan-500/40 bg-cyan-500/10 text-cyan-100';
			default:
				return 'border-white/15 bg-white/5 text-white';
		}
	});
	const messageClass = $derived.by(() => {
		if (messageTone === 'error') return 'text-destructive';
		if (messageTone === 'success') return 'text-emerald-300';
		return 'text-muted-foreground';
	});
</script>

<div class="bg-card/75 space-y-4 rounded-[30px] border border-white/10 p-6">
	<div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
		<div class="space-y-2">
			<div
				class={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold tracking-[0.25em] uppercase ${stateClass}`}
			>
				{stateCopy[status.state].label}
			</div>
			<div class="space-y-1">
				<h3 class="text-lg font-semibold tracking-tight">Plex Connection</h3>
				<p class="text-muted-foreground max-w-2xl text-sm leading-6">
					{stateCopy[status.state].description} Use Plex&apos;s hosted browser flow instead of manually
					extracting a token.
				</p>
			</div>
		</div>

		<a
			class:text-muted-foreground={!canWrite}
			class:pointer-events-none={!canWrite}
			class="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-11 items-center rounded-xl px-5 text-sm font-semibold transition disabled:opacity-50"
			href={connectHref}
		>
			{connectLabel}
		</a>
	</div>

	{#if mode === 'config'}
		<form method="POST" action={saveAction} class="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
			<div class="space-y-1">
				<label class="text-sm font-medium" for="plex-url">Plex Media Server URL</label>
				<input
					id="plex-url"
					name="plexUrl"
					type="url"
					value={status.plexUrl}
					class="border-input bg-background/70 ring-offset-background placeholder:text-muted-foreground/70 h-11 w-full rounded-xl border px-4 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
				/>
				<p class="text-muted-foreground text-xs">
					Operator-managed PMS URL. Keep this pointed at the server Pirate Claw should read.
				</p>
			</div>

			<div class="flex items-end">
				<input type="hidden" name="ifMatch" value={currentEtag ?? ''} />
				<button
					type="submit"
					class="border-border bg-background/55 hover:bg-muted/80 inline-flex h-11 items-center rounded-xl border px-4 text-sm transition-colors disabled:opacity-50"
					disabled={!canWrite || !currentEtag}
				>
					Save PMS URL
				</button>
			</div>
		</form>
	{/if}

	<div class="flex flex-wrap items-center gap-3">
		{#if mode === 'config' && status.hasToken}
			<form method="POST" action={disconnectAction}>
				<input type="hidden" name="ifMatch" value={currentEtag ?? ''} />
				<button
					type="submit"
					class="border-border bg-background/55 hover:bg-muted/80 inline-flex h-11 items-center rounded-xl border px-4 text-sm transition-colors disabled:opacity-50"
					disabled={!canWrite || !currentEtag}
				>
					Disconnect
				</button>
			</form>
		{/if}

		{#if mode === 'onboarding' && skipHref}
			<a href={skipHref} class="text-muted-foreground text-sm hover:underline">Skip for now</a>
		{/if}
	</div>

	{#if status.state === 'connecting' && status.returnTo}
		<p class="text-muted-foreground text-sm">
			This sign-in was started from <code>{status.returnTo}</code>.
		</p>
	{/if}

	{#if !canWrite}
		<p class="text-muted-foreground text-sm">
			Config writes are disabled. Set <code>PIRATE_CLAW_API_WRITE_TOKEN</code> to start or update the
			connection.
		</p>
	{/if}

	{#if message}
		<p class={`text-sm ${messageClass}`}>{message}</p>
	{/if}
</div>
