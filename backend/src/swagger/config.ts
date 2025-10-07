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
			title: 'ft_transcendence User API',
			description: 'API documentation for user management with secure authentication',
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
			{ name: 'auth', description: 'Authentication endpoints' }
		],
		components: {
			securitySchemes: {
				bearerAuth: {
					type: 'http' as const,
					scheme: 'bearer',
					bearerFormat: 'JWT',
					description: 'Enter your JWT token in the format: Bearer <token>'
				}
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
