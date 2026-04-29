<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';

	interface Props {
		form: ActionData;
	}

	let { form }: Props = $props();
	let loading = $state(false);
</script>

<svelte:head>
	<title>Pirate Claw — Setup</title>
</svelte:head>

<div class="bg-background flex min-h-screen items-center justify-center">
	<div class="border-border bg-card w-full max-w-sm space-y-6 rounded-2xl border p-8 shadow-lg">
		<div class="space-y-1 text-center">
			<img
				src="/pirate-claw-logo.webp"
				alt="Pirate Claw"
				width="56"
				height="56"
				class="mx-auto rounded-2xl"
			/>
			<h1 class="text-foreground text-xl font-semibold">Create owner account</h1>
			<p class="text-muted-foreground text-sm">
				First-time setup — this account cannot be recovered.
			</p>
		</div>

		{#if form?.error}
			<p class="bg-destructive/10 text-destructive rounded-lg px-3 py-2 text-sm" role="alert">
				{form.error}
			</p>
		{/if}

		<form
			method="POST"
			use:enhance={() => {
				loading = true;
				return async ({ update }) => {
					loading = false;
					await update();
				};
			}}
			class="space-y-4"
		>
			<div class="space-y-1">
				<label for="username" class="text-foreground text-sm font-medium">Username</label>
				<input
					id="username"
					name="username"
					type="text"
					autocomplete="username"
					required
					class="border-border bg-background text-foreground focus:ring-primary w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
				/>
			</div>

			<div class="space-y-1">
				<label for="password" class="text-foreground text-sm font-medium">Password</label>
				<input
					id="password"
					name="password"
					type="password"
					autocomplete="new-password"
					required
					class="border-border bg-background text-foreground focus:ring-primary w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
				/>
			</div>

			<div class="space-y-1">
				<label for="confirm" class="text-foreground text-sm font-medium">Confirm password</label>
				<input
					id="confirm"
					name="confirm"
					type="password"
					autocomplete="new-password"
					required
					class="border-border bg-background text-foreground focus:ring-primary w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
				/>
			</div>

			<button
				type="submit"
				disabled={loading}
				class="bg-primary text-primary-foreground hover:bg-primary/90 w-full rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
			>
				{loading ? 'Creating account…' : 'Create account'}
			</button>
		</form>
	</div>
</div>
