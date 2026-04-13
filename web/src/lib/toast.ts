import { toast as sonnerToast } from 'svelte-sonner';

export function toast(message: string, variant: 'success' | 'error'): void {
	if (variant === 'success') {
		sonnerToast.success(message);
	} else {
		sonnerToast.error(message);
	}
}
