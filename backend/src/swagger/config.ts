/**
 * Swagger/OpenAPI Configuration
 */

import { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';

export const swaggerConfig = {
	openapi: {
		openapi: '3.0.0',
		info: {
			title: 'ft_transcendence API',
			description: 'API documentation for user management and game statistics tracking',
			version: '0.0.1'
		},
		servers: [
			{
				url: 'https://localhost',
				description: 'Development server (via nginx)'
			}
		],
		tags: [
			{ name: 'users', description: 'User management endpoints' },
			{ name: 'auth', description: 'Authentication endpoints' },
			{ name: 'games', description: 'Game statistics and records endpoints' }
		],
		components: {
			securitySchemes: {
				cookieAuth: {
					type: 'apiKey' as const,
					in: 'cookie' as const,
					name: 'accessToken',
					description:
						'Authentication via HttpOnly cookie "accessToken". Obtain it by POST /api/users/login. ' +
            					'Tokens are rotated via POST /api/users/refresh and cleared via POST /api/users/logout.'
				}
				// bearerAuth: {
				// 	type: 'http' as const,
				// 	scheme: 'bearer',
				// 	bearerFormat: 'JWT',
				// 	description: 'Enter your JWT token in the format: Bearer <token>'
				// }
			}
		}
	}
};

export const swaggerUIConfig = {
	routePrefix: '/api/docs',
	uiConfig: {
		docExpansion: 'list' as const,
		deepLinking: false
	},
	staticCSP: true,
	transformStaticCSP: (header: string) => header
};

/**
 * Register Swagger plugins with Fastify instance
 */
export async function registerSwagger(fastify: FastifyInstance) {
	await fastify.register(swagger, swaggerConfig);
	await fastify.register(swaggerUI, swaggerUIConfig);
}
