export class ApiError extends Error {
	status: number;
	constructor(message: string, status: number) {
		super(message);
		this.status = status;
	}
}

async function safeApiError(res: Response): Promise<never> {
	try {
		const data = await res.json();
		const msg = (data && (data.error || data.message)) as
			| string
			| undefined;
		throw new ApiError(msg || `HTTP ${res.status}`, res.status);
	} catch {
		throw new ApiError(`HTTP ${res.status}`, res.status);
	}
}

export async function createUser(payload: {
	username: string;
	password: string;
	email: string;
	display_name: string;
}) {
	const res = await fetch("/api/users", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		credentials: "same-origin",
		body: JSON.stringify(payload),
	});
	if (!res.ok) await safeApiError(res);
	return res.json();
}
