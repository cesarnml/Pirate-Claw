<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import type { SubmitFunction } from '@sveltejs/kit';

	interface Props {
		show: boolean;
		canWrite: boolean;
		restarting: boolean;
		writeDisabledTooltip: string;
		enhanceRestartDaemon: SubmitFunction;
	}

	const { show, canWrite, restarting, writeDisabledTooltip, enhanceRestartDaemon }: Props =
		$props();
</script>

{#if show}
	<form method="POST" action="?/restartDaemon" use:enhance={enhanceRestartDaemon}>
		<div
			class="border-border bg-card/60 flex flex-col gap-3 rounded-[24px] border p-4 sm:flex-row sm:items-center sm:justify-between"
		>
			<div class="space-y-1">
				<p class="font-semibold">Runtime changes are staged.</p>
				<p class="text-muted-foreground text-sm">
					Restart the daemon to apply interval and port updates. The browser will not confirm when
					it comes back yet.
				</p>
			</div>
			<Button
				type="submit"
				variant="outline"
				class="rounded-full px-5"
				disabled={!canWrite || restarting}
				title={!canWrite ? writeDisabledTooltip : undefined}
			>
				{#if restarting}
					Restarting…
				{:else}
					Restart Daemon
				{/if}
			</Button>
		</div>
	</form>
{/if}
