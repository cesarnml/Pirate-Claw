import { describe, expect, it, vi, beforeEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';

const apiRequestMock = vi.fn();
vi.mock('$lib/server/api', () => ({
	apiRequest: apiRequestMock
}));

vi.mock('$lib/server/log', () => ({
	log: vi.fn()
}));

const layoutData = {
	user: null,
	untrustedOrigin: null,
	networkPosture: 'vpn_bridge_pending',
	health: null,
	transmissionSession: null,
	plexAuthState: 'unavailable'
};

async function renderPage(data: Record<string, unknown>, form?: Record<string, unknown>) {
	const Page = (await import('../../../src/routes/config/downloader-network/+page.svelte')).default;
	return render(Page, {
		data: { ...layoutData, ...data } as never,
		form: form as never
	});
}

describe('/config/downloader-network', () => {
	beforeEach(() => {
		cleanup();
		apiRequestMock.mockReset();
	});

	it('renders the profile upload and credential forms', async () => {
		await renderPage({
			canWrite: true,
			hasProfile: false,
			hasCredentials: false,
			networkPosture: 'vpn_bridge_pending'
		});

		expect(screen.getByLabelText('OpenVPN profile')).toHaveAttribute('accept', '.ovpn');
		expect(screen.getByRole('textbox', { name: 'VPN username' })).toBeInTheDocument();
		expect(screen.getByLabelText('VPN password')).toHaveAttribute('type', 'password');
	});

	it('renders compose download as active only after a profile exists', async () => {
		await renderPage({
			canWrite: true,
			hasProfile: true,
			hasCredentials: false,
			networkPosture: 'vpn_bridge_pending'
		});

		expect(screen.getByRole('link', { name: 'Download Compose' })).toHaveAttribute(
			'href',
			'/config/downloader-network/compose'
		);

		cleanup();
		await renderPage({
			canWrite: true,
			hasProfile: false,
			hasCredentials: false,
			networkPosture: 'vpn_bridge_pending'
		});

		expect(screen.getByText('Upload a VPN profile first')).toBeInTheDocument();
		expect(screen.queryByRole('link', { name: 'Download Compose' })).not.toBeInTheDocument();
	});

	it('renders verify results and retry affordance', async () => {
		await renderPage(
			{
				canWrite: true,
				hasProfile: true,
				hasCredentials: true,
				networkPosture: 'vpn_bridge_pending'
			},
			{ verifyStatus: 'vpn_bridge_active' }
		);

		expect(screen.getByText('VPN BRIDGE ACTIVE')).toBeInTheDocument();

		await renderPage(
			{
				canWrite: true,
				hasProfile: true,
				hasCredentials: true,
				networkPosture: 'vpn_bridge_pending'
			},
			{ verifyStatus: 'vpn_bridge_unreachable' }
		);

		expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
	});

	it('renders DSM 7.1 and DSM 7.2 apply instructions', async () => {
		await renderPage({
			canWrite: true,
			hasProfile: true,
			hasCredentials: true,
			networkPosture: 'vpn_bridge_pending'
		});

		expect(screen.getByText('DSM 7.1 requires manual apply')).toBeInTheDocument();
		expect(screen.getByText(/DSM 7.2\+ Container Manager/)).toBeInTheDocument();
	});

	it('loads profile availability from the daemon compose endpoint and auth state', async () => {
		vi.resetModules();
		vi.doMock('$env/dynamic/private', () => ({
			env: { PIRATE_CLAW_API_WRITE_TOKEN: 'write-token' }
		}));
		const { load } = await import('../../../src/routes/config/downloader-network/+page.server');
		apiRequestMock
			.mockResolvedValueOnce(new Response('name: pirate-claw', { status: 200 }))
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						owner_exists: true,
						setup_complete: true,
						trusted_origins: [],
						network_posture: 'vpn_bridge_pending'
					}),
					{ status: 200 }
				)
			);

		const result = await load({} as never);

		expect(result).toMatchObject({
			canWrite: true,
			hasProfile: true,
			networkPosture: 'vpn_bridge_pending'
		});
	});

	it('proxies profile uploads to POST /api/vpn/profile', async () => {
		vi.resetModules();
		vi.doMock('$env/dynamic/private', () => ({
			env: { PIRATE_CLAW_API_WRITE_TOKEN: 'write-token' }
		}));
		const { actions } = await import('../../../src/routes/config/downloader-network/+page.server');
		apiRequestMock.mockResolvedValueOnce(
			new Response(JSON.stringify({ ok: true }), { status: 200 })
		);
		const form = new FormData();
		form.set('profile', new File(['client\nremote vpn.example 1194\n'], 'profile.ovpn'));

		const result = await actions.saveProfile({
			request: { formData: async () => form }
		} as never);

		expect(apiRequestMock).toHaveBeenCalledWith(
			'/api/vpn/profile',
			expect.objectContaining({
				method: 'POST',
				headers: expect.objectContaining({ authorization: 'Bearer write-token' })
			})
		);
		expect(result).toMatchObject({ profileMessage: 'Profile saved.' });
	});

	it('proxies credentials without echoing the password on failure', async () => {
		vi.resetModules();
		vi.doMock('$env/dynamic/private', () => ({
			env: { PIRATE_CLAW_API_WRITE_TOKEN: 'write-token' }
		}));
		const { actions } = await import('../../../src/routes/config/downloader-network/+page.server');
		apiRequestMock.mockResolvedValueOnce(
			new Response(JSON.stringify({ error: 'daemon rejected credentials' }), { status: 400 })
		);
		const form = new FormData();
		form.set('username', 'mullvad-user');
		form.set('password', 'secret-password');

		const result = await actions.saveCredentials({
			request: { formData: async () => form }
		} as never);

		expect(apiRequestMock).toHaveBeenCalledWith(
			'/api/vpn/credentials',
			expect.objectContaining({
				method: 'POST',
				body: JSON.stringify({ username: 'mullvad-user', password: 'secret-password' })
			})
		);
		expect(JSON.stringify(result)).not.toContain('secret-password');
		expect(result).toMatchObject({ data: { credentialsMessage: 'daemon rejected credentials' } });
	});

	it('verifies the VPN bridge through POST /api/vpn/verify', async () => {
		vi.resetModules();
		vi.doMock('$env/dynamic/private', () => ({
			env: { PIRATE_CLAW_API_WRITE_TOKEN: 'write-token' }
		}));
		const { actions } = await import('../../../src/routes/config/downloader-network/+page.server');
		apiRequestMock.mockResolvedValueOnce(
			new Response(JSON.stringify({ status: 'vpn_bridge_active' }), { status: 200 })
		);

		const result = await actions.verify({
			request: new Request('http://localhost/config/downloader-network', { method: 'POST' })
		} as never);

		expect(apiRequestMock).toHaveBeenCalledWith(
			'/api/vpn/verify',
			expect.objectContaining({ method: 'POST' })
		);
		expect(result).toMatchObject({ verifyStatus: 'vpn_bridge_active' });
	});
});
