import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Matches shadcn-svelte / bits-ui typing for element refs on polymorphic components. */
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & {
	ref?: U | null;
};

/** Local helper for bits-ui wrappers that render children directly instead of using the `child` prop. */
export type WithoutChild<T> = Omit<T, 'child'>;

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}
