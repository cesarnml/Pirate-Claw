import { toast as sonnerToast } from 'svelte-sonner';

export function toast(message: string, variant: 'success' | 'error', description?: string): void {
	const opts = description ? { description } : undefined;
	if (variant === 'success') {
		sonnerToast.success(message, opts);
	} else {
		sonnerToast.error(message, opts);
	}
}
