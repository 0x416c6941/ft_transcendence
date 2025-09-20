import Fastify from 'fastify';

const fastify = Fastify({
	logger: true
});

fastify.get('/v1/*', async (request, reply) => {
	return { hello: 'world' };
});

const start = async () => {
	const port = Number(process.env.BACKEND_FASTIFY_PORT);

	if (Number.isNaN(port)) {
		throw new Error("process.env.BACKEND_FASTIFY_PORT isn't a number!");
	}
	try {
		/* IPv4 only here.
		 * We don't need to take care of IPv6, since we'll either way
		 * receive data from NGINX as a reverse proxy on IPv4. */
		await fastify.listen({ port: port, host: '0.0.0.0' });
	}
	catch (err) {
		fastify.log.error(err);
		process.exit(1);
	}
};

start();