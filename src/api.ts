export function createApiFetch(): (request: Request) => Response {
  return () => Response.json({ error: 'not found' }, { status: 404 });
}
