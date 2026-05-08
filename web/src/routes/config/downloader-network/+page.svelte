<script lang="ts">
	import type { ActionData, PageData } from './$types';

	const { data, form }: { data: PageData; form?: ActionData } = $props();

	const canWrite = $derived(data.canWrite);
	const hasProfile = $derived(Boolean(form?.hasProfile ?? data.hasProfile));
	const hasCredentials = $derived(Boolean(form?.hasCredentials ?? data.hasCredentials));
	const verifyStatus = $derived(form?.verifyStatus ?? null);
	const writeDisabledTooltip = 'Configure PIRATE_CLAW_API_WRITE_TOKEN to enable editing';
</script>

<section class="mx-auto max-w-6xl space-y-6">
	<div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
		<div class="space-y-3">
			<p class="text-primary font-mono text-xs font-semibold tracking-[0.28em] uppercase">
				Config · Downloader Network
			</p>
			<div class="space-y-2">
				<h1 class="max-w-3xl text-4xl font-semibold text-balance">Downloader Network</h1>
				<p class="text-muted-foreground max-w-3xl text-sm leading-6">
					Manage the bundled Transmission OpenVPN bridge and DSM apply artifact.
				</p>
			</div>
		</div>

		<div class="flex flex-wrap items-center gap-2">
			<span class="inline-flex rounded-full border border-white/8 bg-white/6 px-3 py-1 text-xs">
				{(data.networkPosture ?? 'unknown').replaceAll('_', ' ').toUpperCase()}
			</span>
			<div
				class={`inline-flex items-center rounded-full border px-4 py-2 font-mono text-[11px] font-semibold tracking-[0.18em] uppercase ${
					canWrite
						? 'border-primary/35 bg-primary/16 text-primary'
						: 'border-white/8 bg-white/6 text-slate-300'
				}`}
			>
				Write Access: {canWrite ? 'Active' : 'Restricted'}
			</div>
		</div>
	</div>

	<div class="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
		<section class="bg-card/75 space-y-5 rounded-[30px] border border-white/10 p-5">
			<div class="flex items-start justify-between gap-3">
				<div>
					<p class="text-primary font-mono text-xs font-semibold tracking-[0.2em] uppercase">
						01 · Profile
					</p>
					<h2 class="mt-2 text-2xl font-semibold">OpenVPN Profile</h2>
				</div>
				<span class="inline-flex rounded-full border border-white/8 bg-white/6 px-3 py-1 text-xs">
					{hasProfile ? 'CONFIGURED' : 'MISSING'}
				</span>
			</div>
			<form method="POST" action="?/saveProfile" enctype="multipart/form-data">
				<label class="grid gap-2 text-sm">
					<span class="text-muted-foreground">OpenVPN profile</span>
					<input
						name="profile"
						type="file"
						accept=".ovpn"
						disabled={!canWrite}
						title={!canWrite ? writeDisabledTooltip : undefined}
						class="border-input bg-background ring-offset-background focus-visible:ring-ring h-11 rounded-2xl border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50"
					/>
				</label>
				<div class="mt-4 flex flex-wrap items-center gap-3">
					<button
						type="submit"
						class="bg-primary text-primary-foreground h-9 rounded-full px-4 text-sm font-medium disabled:opacity-50"
						disabled={!canWrite}
					>
						Save Profile
					</button>
					{#if form?.profileMessage}
						<p
							class={`text-sm ${form.profileMessageTone === 'error' ? 'text-rose-200' : 'text-emerald-200'}`}
						>
							{form.profileMessage}
						</p>
					{/if}
				</div>
			</form>

			<div class="border-border bg-background/50 rounded-2xl border p-4">
				<p class="text-muted-foreground text-xs font-semibold tracking-[0.18em] uppercase">
					Compose Artifact
				</p>
				{#if hasProfile}
					<a
						href="/config/downloader-network/compose"
						download
						class="text-primary mt-3 inline-flex items-center gap-2 text-sm font-medium hover:underline"
					>
						Download Compose
					</a>
				{:else}
					<p class="text-muted-foreground mt-3 text-sm">Upload a VPN profile first</p>
				{/if}
			</div>
		</section>

		<section class="bg-card/75 space-y-5 rounded-[30px] border border-white/10 p-5">
			<div class="flex items-start justify-between gap-3">
				<div>
					<p class="text-primary font-mono text-xs font-semibold tracking-[0.2em] uppercase">
						02 · Credentials
					</p>
					<h2 class="mt-2 text-2xl font-semibold">VPN Credentials</h2>
				</div>
				<span class="inline-flex rounded-full border border-white/8 bg-white/6 px-3 py-1 text-xs">
					{hasCredentials ? 'CONFIGURED' : 'UNKNOWN'}
				</span>
			</div>
			<form method="POST" action="?/saveCredentials" class="space-y-4">
				<p class="text-muted-foreground text-sm">
					Credentials are written to the daemon credential file and are never read back into the
					browser.
				</p>
				<label class="grid gap-2 text-sm">
					<span class="text-muted-foreground">VPN username</span>
					<input
						name="username"
						type="text"
						value={form?.username ?? ''}
						autocomplete="username"
						disabled={!canWrite}
						title={!canWrite ? writeDisabledTooltip : undefined}
						class="border-input bg-background ring-offset-background focus-visible:ring-ring h-10 rounded-2xl border px-3 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50"
					/>
				</label>
				<label class="grid gap-2 text-sm">
					<span class="text-muted-foreground">VPN password</span>
					<input
						name="password"
						type="password"
						autocomplete="current-password"
						disabled={!canWrite}
						title={!canWrite ? writeDisabledTooltip : undefined}
						class="border-input bg-background ring-offset-background focus-visible:ring-ring h-10 rounded-2xl border px-3 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50"
					/>
				</label>
				<div class="flex flex-wrap items-center gap-3">
					<button
						type="submit"
						class="bg-primary text-primary-foreground h-9 rounded-full px-4 text-sm font-medium disabled:opacity-50"
						disabled={!canWrite}
					>
						Save Credentials
					</button>
					{#if form?.credentialsMessage}
						<p
							class={`text-sm ${form.credentialsMessageTone === 'error' ? 'text-rose-200' : 'text-emerald-200'}`}
						>
							{form.credentialsMessage}
						</p>
					{/if}
				</div>
			</form>
		</section>
	</div>

	<section class="bg-card/75 space-y-5 rounded-[30px] border border-white/10 p-5">
		<div class="flex items-start justify-between gap-3">
			<div>
				<p class="text-primary font-mono text-xs font-semibold tracking-[0.2em] uppercase">
					03 · Verify
				</p>
				<h2 class="mt-2 text-2xl font-semibold">VPN Bridge Status</h2>
			</div>
			{#if verifyStatus}
				<span class="inline-flex rounded-full border border-white/8 bg-white/6 px-3 py-1 text-xs">
					{verifyStatus.replaceAll('_', ' ').toUpperCase()}
				</span>
			{/if}
		</div>
		<form method="POST" action="?/verify" class="flex flex-wrap items-center gap-3">
			<button
				type="submit"
				class="bg-primary text-primary-foreground h-9 rounded-full px-4 text-sm font-medium disabled:opacity-50"
				disabled={!canWrite || !hasProfile}
			>
				Verify VPN connection
			</button>
			{#if verifyStatus === 'vpn_bridge_unreachable'}
				<button
					type="submit"
					class="border-border bg-background h-9 rounded-full border px-4 text-sm font-medium disabled:opacity-50"
					disabled={!canWrite}
				>
					Try again
				</button>
			{/if}
			{#if form?.verifyMessage}
				<p
					class={`text-sm ${form.verifyMessageTone === 'success' ? 'text-emerald-200' : 'text-rose-200'}`}
				>
					{form.verifyMessage}
				</p>
			{/if}
		</form>
		{#if verifyStatus === 'passthrough'}
			<p class="text-muted-foreground text-sm">
				Bundled Transmission: Direct (VPN bridge not configured).
			</p>
		{/if}
	</section>

	<div class="grid gap-5 lg:grid-cols-2">
		<section class="border-border bg-background/50 rounded-2xl border p-5">
			<p class="text-primary font-mono text-xs font-semibold tracking-[0.2em] uppercase">DSM 7.1</p>
			<h2 class="mt-2 text-xl font-semibold">DSM 7.1 requires manual apply</h2>
			<p class="text-muted-foreground mt-3 text-sm leading-6">
				Docker on DSM 7.1 cannot update a container network from the GUI. Upload the profile, save
				credentials, download the generated compose artifact, then apply it from an SSH session on
				the NAS.
			</p>
			<ol class="text-muted-foreground mt-4 list-decimal space-y-2 pl-5 text-sm">
				<li>Stop the existing Pirate Claw and Transmission containers.</li>
				<li>Copy the generated compose file into the Pirate Claw install root.</li>
				<li>Run Docker Compose from the install root to recreate the stack with gluetun.</li>
			</ol>
		</section>

		<section class="border-border bg-background/50 rounded-2xl border p-5">
			<p class="text-primary font-mono text-xs font-semibold tracking-[0.2em] uppercase">
				DSM 7.2+
			</p>
			<h2 class="mt-2 text-xl font-semibold">DSM 7.2+ Container Manager Project</h2>
			<p class="text-muted-foreground mt-3 text-sm leading-6">
				In Container Manager, open Project, import or update the Pirate Claw project with the
				generated compose file, then wait for gluetun, the daemon, web, and Transmission to come
				back online.
			</p>
			<ol class="text-muted-foreground mt-4 list-decimal space-y-2 pl-5 text-sm">
				<li>Open Container Manager and select Project.</li>
				<li>Import or update the Pirate Claw project using the downloaded compose file.</li>
				<li>Return here and run Verify VPN connection.</li>
			</ol>
		</section>
	</div>
</section>
